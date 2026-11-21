// Package notifications is the shared notification service. Features register
// their notification types at startup and call Notify inside the transaction of
// the change that caused the notification. See docs/adr/0002-notification-service.md.
package notifications

import (
	"encoding/json"
	"time"
)

// Channel names a delivery channel a notification type can use. Only in-app
// delivery exists for now; email and SMS follow once a provider is funded.
const (
	ChannelInApp = "in_app"
	ChannelEmail = "email"
	ChannelSMS   = "sms"
)

// Type is a kind of notification, registered by the feature that sends it.
type Type struct {
	// Name identifies the type, as "<feature>.<event>", e.g. "hotspot.submitted".
	Name string
	// Title and Body are text/template strings rendered with Message.Data at send time.
	Title string
	Body  string
	// Channels the type is delivered through; channels that are not available yet are skipped.
	Channels []string
	// IncludeActor keeps the person who caused the notification among its recipients.
	IncludeActor bool
}

// Target selects recipients. Every filter that is set must match; a Message's
// targets are combined and de-duplicated. Only active accounts are selected.
type Target struct {
	UserIDs []string
	Role    string
	// Permission is preferred to Role: roles can be renamed or re-granted, while a
	// permission says what a person does.
	Permission string
	StoreID    string
	// DistrictID matches users whose assigned store is in the district.
	DistrictID string
}

func (t Target) empty() bool {
	return len(t.UserIDs) == 0 && t.Role == "" && t.Permission == "" && t.StoreID == "" && t.DistrictID == ""
}

// Resource is the record a notification is about, so clients can open it.
type Resource struct {
	Type string
	ID   string
}

// Message is one send: what happened, to whom, and the details its templates use.
type Message struct {
	Type     string
	Targets  []Target
	ActorID  *string
	Resource *Resource
	// Data fills the type's templates and is stored with the notification.
	Data map[string]any
	// IdempotencyKey, normally the ID of the event that caused the notification,
	// makes a repeated send of the same type and key a no-op.
	IdempotencyKey string
}

// Notification is an inbox item: a notification as one recipient sees it.
type Notification struct {
	ID           string          `json:"id"`
	Type         string          `json:"type"`
	Title        string          `json:"title"`
	Body         string          `json:"body"`
	ResourceType *string         `json:"resource_type"`
	ResourceID   *string         `json:"resource_id"`
	ActorID      *string         `json:"actor_id"`
	Data         json.RawMessage `json:"data"`
	ReadAt       *time.Time      `json:"read_at"`
	CreatedAt    time.Time       `json:"created_at"`
}
