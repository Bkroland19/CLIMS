package synclog

import (
	"strings"
	"testing"
	"time"
)

var now = time.Date(2026, 11, 24, 9, 0, 0, 0, time.UTC)


func validUpload() Upload {
	return Upload{
		Device: Device{Platform: "android", OSVersion: "14", AppVersion: "2.2.0"},
		Entries: []Entry{{
			ClientEntryID: "SL-m3x9k2-ab12cd", Action: "mapHotspot", Status: StatusRetrying,
			QueuedAt: now.Add(-time.Hour), ChangedAt: now.Add(-time.Minute), AttemptCount: 3,
			Attempts: []Attempt{{At: now.Add(-time.Minute), Error: new("network")}},
		}},
	}
}

func TestValidUploadPasses(t *testing.T) {
	u := validUpload()
	if errs := u.validate(now); len(errs) > 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
}

func TestUploadValidation(t *testing.T) {
	cases := map[string]struct {
		change func(*Upload)
		field  string
	}{
		"unknown platform":      {func(u *Upload) { u.Device.Platform = "web" }, "device.platform"},
		"odd app version":       {func(u *Upload) { u.Device.AppVersion = "2.2 beta" }, "device.app_version"},
		"no entries":            {func(u *Upload) { u.Entries = nil }, "entries"},
		"too many entries":      {func(u *Upload) { u.Entries = make([]Entry, MaxEntries+1) }, "entries"},
		"short entry ID":        {func(u *Upload) { u.Entries[0].ClientEntryID = "OB-1" }, "entries[0].client_entry_id"},
		"unknown action":        {func(u *Upload) { u.Entries[0].Action = "rptSubmit" }, "entries[0].action"},
		"unknown status":        {func(u *Upload) { u.Entries[0].Status = "discarded" }, "entries[0].status"},
		"empty server record":   {func(u *Upload) { u.Entries[0].ServerRecordID = new("") }, "entries[0].server_record_id"},
		"queued in the future":  {func(u *Upload) { u.Entries[0].QueuedAt = now.Add(48 * time.Hour) }, "entries[0].queued_at"},
		"changed before queued": {func(u *Upload) { u.Entries[0].ChangedAt = now.Add(-2 * time.Hour) }, "entries[0].changed_at"},
		"too many attempts": {func(u *Upload) {
			u.Entries[0].Attempts = make([]Attempt, MaxAttempts+1)
			u.Entries[0].AttemptCount = MaxAttempts + 1
		}, "entries[0].attempts"},
		"count below listed": {func(u *Upload) { u.Entries[0].AttemptCount = 0 }, "entries[0].attempt_count"},
		"free-text error": {func(u *Upload) {
			u.Entries[0].Attempts[0].Error = new("Couldn't submit Mama Rose Bar")
		}, "entries[0].attempts[0].error"},
		"impossible HTTP status": {func(u *Upload) {
			u.Entries[0].Attempts[0].HTTPStatus = new(42)
		}, "entries[0].attempts[0].http_status"},
		"duplicate entry": {func(u *Upload) {
			u.Entries = append(u.Entries, u.Entries[0])
		}, "entries[1].client_entry_id"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			u := validUpload()
			tc.change(&u)
			errs := u.validate(now)
			if _, ok := errs[tc.field]; !ok {
				t.Fatalf("expected an error for %s, got %v", tc.field, errs)
			}
		})
	}
}

// Phone clocks in the field are often wrong; a few hours ahead is accepted, a day and more is not.
func TestClockSkewTolerance(t *testing.T) {
	u := validUpload()
	u.Entries[0].QueuedAt = now.Add(3 * time.Hour)
	u.Entries[0].ChangedAt = now.Add(3 * time.Hour)
	u.Entries[0].Attempts = nil
	if errs := u.validate(now); len(errs) > 0 {
		t.Fatalf("a phone a few hours ahead should be accepted: %v", errs)
	}
}

func TestLastErrorIsTheLatestAttempt(t *testing.T) {
	e := Entry{Attempts: []Attempt{{Error: new("network")}, {HTTPStatus: new(409), Error: new("http_409")}}}
	if got := e.lastError(); got == nil || *got != "http_409" {
		t.Fatalf("lastError = %v, want http_409", got)
	}
	if (&Entry{}).lastError() != nil {
		t.Fatal("an entry with no attempts has no last error")
	}
	if b, _ := (&Entry{}).attemptsJSON(); !strings.EqualFold(string(b), "[]") {
		t.Fatalf("no attempts must encode as [], got %s", b)
	}
}
