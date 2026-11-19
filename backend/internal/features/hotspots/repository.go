package hotspots

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	errConflict  = errors.New("action is unavailable in the current hotspot state")
	errForbidden = errors.New("this hotspot is outside your assigned district")
)

// transitions holds the activation map: a VHT submits, then the district DCFP verifies and activates,
// or rejects the submission with a reason.
var transitions = map[string]struct {
	from []string
	to   string
}{
	"verify":   {[]string{"submitted"}, "verified"},
	"activate": {[]string{"verified"}, "active"},
	"reject":   {[]string{"submitted", "verified"}, "rejected"},
}

type HotSpot struct {
	ID                     string     `json:"id"`
	Name                   *string    `json:"name"`
	Type                   *string    `json:"type"`
	Village                *string    `json:"village"`
	ContactPersonName      *string    `json:"contact_person_name"`
	ContactPersonTelephone *string    `json:"contact_person_telephone"`
	HasCondomDispenser     *bool      `json:"has_condom_dispenser"`
	DispenserCondition     *string    `json:"dispenser_condition"`
	Latitude               *float64   `json:"latitude"`
	Longitude              *float64   `json:"longitude"`
	Comment                *string    `json:"comment"`
	Status                 *string    `json:"status"`
	RejectionReason        *string    `json:"rejection_reason"`
	DistrictID             *string    `json:"district_id"`
	SubmittedByID          *string    `json:"submitted_by_id"`
	CreatedAt              *time.Time `json:"created_at"`
	UpdatedAt              *time.Time `json:"updated_at"`
}

type Event struct {
	ID        string    `json:"id"`
	HotSpotID string    `json:"hot_spot_id"`
	ActorID   string    `json:"actor_id"`
	Action    string    `json:"action"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type District struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type scope struct {
	userID       string
	storeID      *string
	allDistricts bool
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Legacy coordinates and dispenser answers are free text; anything unrecognised reads as null.
const columns = `id, name, type, village, contact_person_name, contact_person_telephone,
CASE lower(btrim(has_condom_dispenser)) WHEN 'yes' THEN true WHEN 'no' THEN false END, dispenser_condition,
CASE WHEN btrim(latitude) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(latitude)::float8 END,
CASE WHEN btrim(longtitude) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(longtitude)::float8 END,
comment, status, rejection_reason, district_id, submitted_by_id, created_at, updated_at`

const assignedDistrict = `(SELECT district_id FROM stores WHERE id = $3::uuid)`

const visible = `($1::boolean OR submitted_by_id = $2::uuid OR district_id = ` + assignedDistrict + `)`

func scan(row pgx.Row, extra ...any) (HotSpot, error) {
	var h HotSpot
	err := row.Scan(append([]any{&h.ID, &h.Name, &h.Type, &h.Village, &h.ContactPersonName,
		&h.ContactPersonTelephone, &h.HasCondomDispenser, &h.DispenserCondition, &h.Latitude, &h.Longitude,
		&h.Comment, &h.Status, &h.RejectionReason, &h.DistrictID, &h.SubmittedByID,
		&h.CreatedAt, &h.UpdatedAt}, extra...)...)
	return h, err
}

func (r *Repository) list(ctx context.Context, access scope, status string, limit, offset int32) ([]HotSpot, error) {
	rows, err := r.db.Query(ctx, `SELECT `+columns+` FROM hot_spots WHERE `+visible+
		` AND ($4 = '' OR status = $4) ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $5 OFFSET $6`,
		access.allDistricts, access.userID, access.storeID, status, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (HotSpot, error) { return scan(row) })
}

func (r *Repository) submit(ctx context.Context, actorID string, in Submission) (HotSpot, error) {
	var dispenser *string
	if in.HasCondomDispenser != nil {
		answer := map[bool]string{true: "Yes", false: "No"}[*in.HasCondomDispenser]
		dispenser = &answer
	}
	var result HotSpot
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var err error
		result, err = scan(tx.QueryRow(ctx, `INSERT INTO hot_spots (hid, name, type, village, contact_person_name,
				contact_person_telephone, has_condom_dispenser, dispenser_condition, latitude, longtitude, comment,
				district_id, submitted_by_id, status, created_at, updated_at)
			VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8::float8::text, $9::float8::text, $10, $11, $12, 'submitted',
				CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			RETURNING `+columns, in.Name, in.Type, in.Village, in.ContactPersonName, in.ContactPersonTelephone,
			dispenser, in.DispenserCondition, in.Latitude, in.Longitude, in.Comment, in.DistrictID, actorID))
		if err != nil {
			return err
		}
		// The submission is the message that notifies the district DCFP.
		return addEvent(ctx, tx, result, actorID, "submitted", result.DistrictID, nil)
	})
	return result, err
}

// act applies a DCFP action. reason is required for reject and must be nil otherwise (checked by the handler).
func (r *Repository) act(ctx context.Context, access scope, id, action string, reason *string) (HotSpot, error) {
	step := transitions[action]
	var result HotSpot
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var inDistrict bool
		current, err := scan(tx.QueryRow(ctx, `SELECT `+columns+`, ($1::boolean OR district_id = `+assignedDistrict+`)
			FROM hot_spots WHERE `+visible+` AND id = $4 FOR UPDATE`,
			access.allDistricts, access.userID, access.storeID, id), &inDistrict)
		if err != nil {
			return err
		}
		if !inDistrict {
			return errForbidden
		}
		if current.SubmittedByID == nil || current.Status == nil || !slices.Contains(step.from, *current.Status) {
			return errConflict
		}
		result, err = scan(tx.QueryRow(ctx, `UPDATE hot_spots SET status = $2, rejection_reason = $3,
			updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING `+columns, id, step.to, reason))
		if err != nil {
			return err
		}
		var notifySubmitter *string
		if action != "verify" {
			notifySubmitter = current.SubmittedByID
		}
		return addEvent(ctx, tx, result, access.userID, action, nil, notifySubmitter)
	})
	return result, err
}

func addEvent(ctx context.Context, tx pgx.Tx, h HotSpot, actorID, action string, notifyDistrictID, notifyUserID *string) error {
	_, err := tx.Exec(ctx, `INSERT INTO hot_spot_events (hot_spot_id, actor_id, action, status, notify_district_id, notify_user_id)
		VALUES ($1, $2, $3, $4, $5, $6)`, h.ID, actorID, action, h.Status, notifyDistrictID, notifyUserID)
	return err
}

// notifications returns submissions addressed to the user's district and outcomes addressed to the user.
func (r *Repository) notifications(ctx context.Context, access scope, offset int32) ([]Event, error) {
	rows, err := r.db.Query(ctx, `SELECT id, hot_spot_id, actor_id, action, status, created_at FROM hot_spot_events
		WHERE ($1::boolean AND (notify_district_id IS NOT NULL OR notify_user_id IS NOT NULL))
			OR notify_district_id = (SELECT district_id FROM stores WHERE id = $2::uuid)
			OR notify_user_id = $3::uuid
		ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $4`, access.allDistricts, access.storeID, access.userID, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}

func (r *Repository) districts(ctx context.Context) ([]District, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name FROM districts ORDER BY name, id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[District])
}
