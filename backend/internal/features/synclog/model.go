// Package synclog keeps what field phones report about sending the actions they saved: when each was
// saved, every attempt to send it and how it ended. MOH reads it to answer "my submission never
// arrived". See docs/modules/sync-log.md.
package synclog

import (
	"encoding/json"
	"fmt"
	"regexp"
	"time"
)

// Statuses an entry can report.
const (
	StatusWaiting  = "waiting"
	StatusRetrying = "retrying"
	StatusSent     = "sent"
	StatusRefused  = "refused"
	// StatusSavedOnPhone is an action the API has no endpoint for yet: it changed only the phone's copy.
	StatusSavedOnPhone = "saved_on_phone"
)

var statuses = map[string]bool{StatusWaiting: true, StatusRetrying: true, StatusSent: true,
	StatusRefused: true, StatusSavedOnPhone: true}

// The field app's action types (mobile/lib/types.ts ActionType).
var actions = map[string]bool{"notify": true, "stockout": true, "acknowledge": true, "mapHotspot": true,
	"confirmReceipt": true, "pickup": true, "deliver": true}

// Limits that bound one upload; the phone sends at most MaxEntries per request.
const (
	MaxEntries  = 100
	MaxAttempts = 10
	// maxClockSkew is how far ahead of the server a phone's clock may run. Phones in the field often
	// have the wrong time, so only times that are clearly impossible are refused.
	maxClockSkew = 24 * time.Hour
)

var (
	clientEntryPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
	// errorCodePattern keeps errors to short codes such as "http_409" or "network", never free text,
	// so nothing the user typed can reach the server through the log.
	errorCodePattern = regexp.MustCompile(`^[a-z0-9_]{1,100}$`)
	versionPattern   = regexp.MustCompile(`^[A-Za-z0-9._+-]{1,40}$`)
)

// Attempt is one try at sending an entry.
type Attempt struct {
	At         time.Time `json:"at"`
	HTTPStatus *int      `json:"http_status"`
	Error      *string   `json:"error"`
}

// Device describes the phone that uploaded the entries.
type Device struct {
	Platform   string `json:"platform"`
	OSVersion  string `json:"os_version"`
	AppVersion string `json:"app_version"`
}

// Entry is one saved action as the phone reports it. The phone sends only metadata: payloads hold
// contact names, phone numbers and GPS, and the server already has the records it accepted.
type Entry struct {
	ClientEntryID  string    `json:"client_entry_id"`
	Action         string    `json:"action"`
	Status         string    `json:"status"`
	ServerRecordID *string   `json:"server_record_id"`
	QueuedAt       time.Time `json:"queued_at"`
	ChangedAt      time.Time `json:"changed_at"`
	AttemptCount   int       `json:"attempt_count"`
	Attempts       []Attempt `json:"attempts"`
}

// Upload is the body of POST /sync-log.
type Upload struct {
	Device  Device  `json:"device"`
	Entries []Entry `json:"entries"`
}

// validate returns field errors keyed like the request body, e.g. "entries[2].status".
func (u *Upload) validate(now time.Time) map[string]string {
	errs := map[string]string{}
	if u.Device.Platform != "android" && u.Device.Platform != "ios" {
		errs["device.platform"] = "must be android or ios"
	}
	for name, value := range map[string]string{"device.os_version": u.Device.OSVersion,
		"device.app_version": u.Device.AppVersion} {
		if value != "" && !versionPattern.MatchString(value) {
			errs[name] = "must be up to 40 letters, digits, dots, dashes, + or _"
		}
	}
	if len(u.Entries) == 0 || len(u.Entries) > MaxEntries {
		errs["entries"] = fmt.Sprintf("must hold 1 to %d entries", MaxEntries)
		return errs
	}
	seen := map[string]bool{}
	latest := now.Add(maxClockSkew)
	for i := range u.Entries {
		e := &u.Entries[i]
		field := func(name string) string { return fmt.Sprintf("entries[%d].%s", i, name) }
		switch {
		case !clientEntryPattern.MatchString(e.ClientEntryID):
			errs[field("client_entry_id")] = "must be 8 to 64 letters, digits, - or _"
		case seen[e.ClientEntryID]:
			errs[field("client_entry_id")] = "appears more than once in this upload"
		}
		seen[e.ClientEntryID] = true
		if !actions[e.Action] {
			errs[field("action")] = "is not a field app action"
		}
		if !statuses[e.Status] {
			errs[field("status")] = "must be waiting, retrying, sent, refused or saved_on_phone"
		}
		if e.ServerRecordID != nil && (len(*e.ServerRecordID) == 0 || len(*e.ServerRecordID) > 100) {
			errs[field("server_record_id")] = "must be 1 to 100 characters"
		}
		if e.QueuedAt.IsZero() || e.QueuedAt.After(latest) {
			errs[field("queued_at")] = "must be a time no later than now"
		}
		if e.ChangedAt.Before(e.QueuedAt) || e.ChangedAt.After(latest) {
			errs[field("changed_at")] = "must be between queued_at and now"
		}
		if len(e.Attempts) > MaxAttempts {
			errs[field("attempts")] = fmt.Sprintf("must hold at most the latest %d attempts", MaxAttempts)
		}
		if e.AttemptCount < len(e.Attempts) {
			errs[field("attempt_count")] = "must count at least the attempts listed"
		}
		for j, a := range e.Attempts {
			if a.At.IsZero() || a.At.After(latest) {
				errs[field(fmt.Sprintf("attempts[%d].at", j))] = "must be a time no later than now"
			}
			if a.HTTPStatus != nil && (*a.HTTPStatus < 100 || *a.HTTPStatus > 599) {
				errs[field(fmt.Sprintf("attempts[%d].http_status", j))] = "must be an HTTP status"
			}
			if a.Error != nil && !errorCodePattern.MatchString(*a.Error) {
				errs[field(fmt.Sprintf("attempts[%d].error", j))] = "must be a short code such as network or http_409"
			}
		}
	}
	return errs
}

// lastError is the error of the entry's latest attempt, for filtering and display.
func (e *Entry) lastError() *string {
	if len(e.Attempts) == 0 {
		return nil
	}
	return e.Attempts[len(e.Attempts)-1].Error
}

func (e *Entry) attemptsJSON() ([]byte, error) {
	if e.Attempts == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(e.Attempts)
}

// Record is an entry as GET /sync-log returns it, with the user who saved it and their device.
type Record struct {
	ID             string          `json:"id"`
	ClientEntryID  string          `json:"client_entry_id"`
	User           RecordUser      `json:"user"`
	Action         string          `json:"action"`
	Status         string          `json:"status"`
	ServerRecordID *string         `json:"server_record_id"`
	QueuedAt       time.Time       `json:"queued_at"`
	ChangedAt      time.Time       `json:"changed_at"`
	AttemptCount   int             `json:"attempt_count"`
	Attempts       json.RawMessage `json:"attempts"`
	LastError      *string         `json:"last_error"`
	Device         Device          `json:"device"`
	ReceivedAt     time.Time       `json:"received_at"`
}

// RecordUser is the field user who saved the action, with their current roles.
type RecordUser struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
}
