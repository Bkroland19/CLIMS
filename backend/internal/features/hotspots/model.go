package hotspots

import "time"

// Hotspot statuses. A submitted hotspot stays inactive until a DCFP activates it.
const (
	StatusActive   = "active"
	StatusInactive = "inactive"
)

// Place is a region, district or subcounty from the DHIS2 hierarchy.
type Place struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ContactPerson struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	PhoneNumber *string `json:"phone_number"`
}

// HotSpot fields are nullable because converted legacy rows can lack them;
// hotspots submitted through the API always have them.
type HotSpot struct {
	ID                 string         `json:"id"`
	LegacyID           *string        `json:"legacy_id"`
	Name               *string        `json:"name"`
	Type               *string        `json:"type"`
	Village            *string        `json:"village"`
	Region             *Place         `json:"region"`
	District           *Place         `json:"district"`
	Subcounty          *Place         `json:"subcounty"`
	Latitude           *float64       `json:"latitude"`
	Longitude          *float64       `json:"longitude"`
	HasCondomDispenser *bool          `json:"has_condom_dispenser"`
	DispenserCondition *string        `json:"dispenser_condition"`
	Status             string         `json:"status"`
	EnteredByID        *string        `json:"entered_by_id"`
	ContactPerson      *ContactPerson `json:"contact_person"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

// Comment actions: a plain comment, or the comment recorded with a status change.
const (
	ActionComment     = "comment"
	ActionActivated   = "activated"
	ActionDeactivated = "deactivated"
)

type Comment struct {
	ID        string    `json:"id"`
	UserID    *string   `json:"user_id"`
	Action    string    `json:"action"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
}

// Detail is a hotspot with its comment thread and assigned hotspot managers.
type Detail struct {
	HotSpot
	ManagerIDs []string  `json:"manager_ids"`
	Comments   []Comment `json:"comments"`
}

// Event actions recorded in hot_spot_events.
const (
	EventSubmitted   = "submitted"
	EventUpdated     = "updated"
	EventCommented   = "commented"
	EventActivated   = "activated"
	EventDeactivated = "deactivated"
)

// Event is one workflow step. Events with a recipient form the notification inbox.
type Event struct {
	ID          string    `json:"id"`
	HotSpotID   string    `json:"hot_spot_id"`
	HotSpotName *string   `json:"hot_spot_name"`
	ActorID     string    `json:"actor_id"`
	Action      string    `json:"action"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}
