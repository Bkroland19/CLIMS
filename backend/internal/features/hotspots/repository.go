package hotspots

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidLocation = errors.New("subcounty must belong to the district, and the district to the region")
	ErrDuplicateName   = errors.New("a hotspot with this name already exists in the village")
	ErrUnknownManager  = errors.New("hotspot manager must be an active user")
	ErrNotEditable     = errors.New("only inactive hotspots can be edited")
	ErrStatusUnchanged = errors.New("hotspot already has that status")
)

// scope decides which hotspots a user sees: their own submissions (submit)
// and every hotspot in the district of their assigned store (verify).
type scope struct {
	userID  string
	storeID *string
	submit  bool
	verify  bool
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// The district a verifier is responsible for, from their assigned store.
const verifierDistrict = `(SELECT s.district_id FROM users u JOIN stores s ON s.id = u.store_id WHERE u.id = $1::uuid)`

// Parameters $1 user ID, $2 submit and $3 verify are reserved by this filter.
const visibleHotSpots = `(($2::boolean AND h.entered_by_id = $1::uuid)
	OR ($3::boolean AND h.district_id = ` + verifierDistrict + `))`

const hotSpotColumns = `h.id, h.legacy_id, h.name, h.type, h.village,
	r.id, r.name, d.id, d.name, sc.id, sc.name,
	h.latitude::float8, h.longitude::float8, h.has_condom_dispenser, h.dispenser_condition,
	h.status, h.entered_by_id, cp.id, cp.name, cp.phone_number, h.created_at, h.updated_at`

const hotSpotTables = ` FROM hot_spots h
	LEFT JOIN districts d ON d.id = h.district_id
	LEFT JOIN regions r ON r.id = d.region_id
	LEFT JOIN subcounties sc ON sc.id = h.subcounty_id
	LEFT JOIN LATERAL (SELECT id, name, phone_number FROM contact_persons
		WHERE hot_spot_id = h.id ORDER BY created_at DESC, id DESC LIMIT 1) cp ON true`

func place(id, name *string) *Place {
	if id == nil || name == nil {
		return nil
	}
	return &Place{ID: *id, Name: *name}
}

func scanHotSpot(row pgx.Row, extra ...any) (HotSpot, error) {
	var h HotSpot
	var regionID, regionName, districtID, districtName, subcountyID, subcountyName *string
	var contactID, contactName, contactPhone *string
	dest := []any{&h.ID, &h.LegacyID, &h.Name, &h.Type, &h.Village,
		&regionID, &regionName, &districtID, &districtName, &subcountyID, &subcountyName,
		&h.Latitude, &h.Longitude, &h.HasCondomDispenser, &h.DispenserCondition,
		&h.Status, &h.EnteredByID, &contactID, &contactName, &contactPhone, &h.CreatedAt, &h.UpdatedAt}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return HotSpot{}, err
	}
	h.Region = place(regionID, regionName)
	h.District = place(districtID, districtName)
	h.Subcounty = place(subcountyID, subcountyName)
	if contactID != nil {
		h.ContactPerson = &ContactPerson{ID: *contactID, Name: contactName, PhoneNumber: contactPhone}
	}
	return h, nil
}

// list returns visible hotspots, most recently updated first, and the total match count.
func (r *Repository) list(ctx context.Context, access scope, status string, limit, offset int32) ([]HotSpot, int64, error) {
	rows, err := r.db.Query(ctx, `SELECT `+hotSpotColumns+`, count(*) OVER ()`+hotSpotTables+
		` WHERE `+visibleHotSpots+` AND ($4 = '' OR h.status = $4)
		ORDER BY h.updated_at DESC, h.id DESC LIMIT $5 OFFSET $6`,
		access.userID, access.submit, access.verify, status, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	hotSpots := []HotSpot{}
	var total int64
	for rows.Next() {
		h, err := scanHotSpot(rows, &total)
		if err != nil {
			return nil, 0, err
		}
		hotSpots = append(hotSpots, h)
	}
	return hotSpots, total, rows.Err()
}

func (r *Repository) get(ctx context.Context, access scope, id string) (Detail, error) {
	h, err := scanHotSpot(r.db.QueryRow(ctx, `SELECT `+hotSpotColumns+hotSpotTables+
		` WHERE `+visibleHotSpots+` AND h.id = $4`, access.userID, access.submit, access.verify, id))
	if err != nil {
		return Detail{}, err
	}
	detail := Detail{HotSpot: h}
	rows, err := r.db.Query(ctx, `SELECT user_id FROM hot_spot_user
		WHERE hot_spot_id = $1 ORDER BY created_at, user_id`, id)
	if err != nil {
		return Detail{}, err
	}
	if detail.ManagerIDs, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
		return Detail{}, err
	}
	rows, err = r.db.Query(ctx, `SELECT id, user_id, action, comment, created_at FROM hot_spot_comments
		WHERE hot_spot_id = $1 ORDER BY created_at, id`, id)
	if err != nil {
		return Detail{}, err
	}
	detail.Comments, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Comment])
	return detail, err
}

// submit records a VHT's new hotspot. It stays inactive until a DCFP activates it.
func (r *Repository) submit(ctx context.Context, actorID string, input SubmitRequest) (string, error) {
	var id string
	err := pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if err := checkDetails(ctx, tx, input.Details, nil); err != nil {
			return err
		}
		managerID := actorID
		if input.HotSpotManagerID != nil {
			managerID = *input.HotSpotManagerID
		}
		var managerActive bool
		err := tx.QueryRow(ctx, `SELECT status = 'active' FROM users WHERE id = $1`, managerID).Scan(&managerActive)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !managerActive) {
			return ErrUnknownManager
		}
		if err != nil {
			return err
		}
		d := input.Details
		if err = tx.QueryRow(ctx, `INSERT INTO hot_spots (name, type, village, district_id, subcounty_id,
			entered_by_id, latitude, longitude, has_condom_dispenser, dispenser_condition, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'inactive') RETURNING id`,
			d.Name, d.Type, d.Village, d.DistrictID, d.SubcountyID, actorID,
			d.Latitude, d.Longitude, d.HasCondomDispenser, d.DispenserCondition).Scan(&id); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO contact_persons (name, phone_number, hot_spot_id)
			VALUES ($1, $2, $3)`, d.ContactPersonName, d.ContactPersonPhone, id); err != nil {
			return err
		}
		if input.Note != nil {
			if err = addComment(ctx, tx, id, actorID, ActionComment, *input.Note); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, `INSERT INTO hot_spot_user (hot_spot_id, user_id) VALUES ($1, $2)`, id, managerID); err != nil {
			return err
		}
		return addEvent(ctx, tx, id, actorID, EventSubmitted, true, nil)
	})
	return id, err
}

// update lets the submitting VHT correct their hotspot while it is inactive.
func (r *Repository) update(ctx context.Context, actorID, id string, d Details) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM hot_spots WHERE id = $1 AND entered_by_id = $2 FOR UPDATE`,
			id, actorID).Scan(&status); err != nil {
			return err
		}
		if status != StatusInactive {
			return ErrNotEditable
		}
		if err := checkDetails(ctx, tx, d, &id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE hot_spots SET name = $2, type = $3, village = $4, district_id = $5,
			subcounty_id = $6, latitude = $7, longitude = $8, has_condom_dispenser = $9,
			dispenser_condition = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
			id, d.Name, d.Type, d.Village, d.DistrictID, d.SubcountyID,
			d.Latitude, d.Longitude, d.HasCondomDispenser, d.DispenserCondition); err != nil {
			return err
		}
		// Keep earlier contacts as history; add a row only when the contact changed.
		if _, err := tx.Exec(ctx, `INSERT INTO contact_persons (name, phone_number, hot_spot_id)
			SELECT $2, $3, $1 WHERE NOT EXISTS (
				SELECT 1 FROM (SELECT name, phone_number FROM contact_persons WHERE hot_spot_id = $1
					ORDER BY created_at DESC, id DESC LIMIT 1) latest
				WHERE latest.name IS NOT DISTINCT FROM $2 AND latest.phone_number IS NOT DISTINCT FROM $3)`,
			id, d.ContactPersonName, d.ContactPersonPhone); err != nil {
			return err
		}
		return addEvent(ctx, tx, id, actorID, EventUpdated, true, nil)
	})
}

// comment adds to a visible hotspot's thread. A comment from the submitter
// notifies the district; anyone else's comment notifies the submitter.
func (r *Repository) comment(ctx context.Context, access scope, id, text string) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var enteredBy *string
		if err := tx.QueryRow(ctx, `SELECT h.entered_by_id FROM hot_spots h WHERE `+visibleHotSpots+
			` AND h.id = $4 FOR UPDATE OF h`, access.userID, access.submit, access.verify, id).Scan(&enteredBy); err != nil {
			return err
		}
		if err := addComment(ctx, tx, id, access.userID, ActionComment, text); err != nil {
			return err
		}
		// Comments count as activity so the thread surfaces at the top of lists.
		if _, err := tx.Exec(ctx, `UPDATE hot_spots SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, id); err != nil {
			return err
		}
		fromSubmitter := enteredBy != nil && *enteredBy == access.userID
		var notifyUser *string
		if !fromSubmitter {
			notifyUser = enteredBy
		}
		return addEvent(ctx, tx, id, access.userID, EventCommented, fromSubmitter, notifyUser)
	})
}

// setStatus activates or deactivates a hotspot in the verifier's district,
// recording the required comment and notifying the submitter.
func (r *Repository) setStatus(ctx context.Context, actorID, id, status, text string) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		var current string
		var enteredBy *string
		if err := tx.QueryRow(ctx, `SELECT h.status, h.entered_by_id FROM hot_spots h
			WHERE h.id = $2 AND h.district_id = `+verifierDistrict+` FOR UPDATE OF h`,
			actorID, id).Scan(&current, &enteredBy); err != nil {
			return err
		}
		if current == status {
			return ErrStatusUnchanged
		}
		if _, err := tx.Exec(ctx, `UPDATE hot_spots SET status = $2, updated_at = CURRENT_TIMESTAMP
			WHERE id = $1`, id, status); err != nil {
			return err
		}
		action, event := ActionActivated, EventActivated
		if status == StatusInactive {
			action, event = ActionDeactivated, EventDeactivated
		}
		if err := addComment(ctx, tx, id, actorID, action, text); err != nil {
			return err
		}
		return addEvent(ctx, tx, id, actorID, event, false, enteredBy)
	})
}

// events returns a visible hotspot's workflow history, oldest first.
func (r *Repository) events(ctx context.Context, access scope, id string) ([]Event, error) {
	var visible bool
	if err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM hot_spots h WHERE `+visibleHotSpots+
		` AND h.id = $4)`, access.userID, access.submit, access.verify, id).Scan(&visible); err != nil {
		return nil, err
	}
	if !visible {
		return nil, pgx.ErrNoRows
	}
	rows, err := r.db.Query(ctx, `SELECT e.id, e.hot_spot_id, h.name, e.actor_id, e.action, e.status, e.created_at
		FROM hot_spot_events e JOIN hot_spots h ON h.id = e.hot_spot_id
		WHERE e.hot_spot_id = $1 ORDER BY e.created_at, e.id`, id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}

// notifications is the inbox: events sent to the user, plus their district
// store's events when they verify hotspots.
func (r *Repository) notifications(ctx context.Context, access scope, limit, offset int32) ([]Event, error) {
	rows, err := r.db.Query(ctx, `SELECT e.id, e.hot_spot_id, h.name, e.actor_id, e.action, e.status, e.created_at
		FROM hot_spot_events e JOIN hot_spots h ON h.id = e.hot_spot_id
		WHERE e.notify_user_id = $1 OR ($2::boolean AND e.notify_store_id = $3::uuid)
		ORDER BY e.created_at DESC, e.id DESC LIMIT $4 OFFSET $5`,
		access.userID, access.verify, access.storeID, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}

// checkDetails validates the location chain and the "no duplicate name in the
// same village" rule. Legacy hotspots without a subcounty are compared by district.
func checkDetails(ctx context.Context, tx pgx.Tx, d Details, excludeID *string) error {
	var valid bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM subcounties s JOIN districts d ON d.id = s.district_id
		WHERE s.id = $1 AND d.id = $2 AND d.region_id = $3)`, d.SubcountyID, d.DistrictID, d.RegionID).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return ErrInvalidLocation
	}
	// Serialize concurrent submissions of the same name in the same village.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(
		$1 || '|' || hot_spot_label($2) || '|' || hot_spot_label($3), 8))`,
		d.DistrictID, d.Village, d.Name); err != nil {
		return err
	}
	var duplicate bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM hot_spots h
		WHERE hot_spot_label(h.name) = hot_spot_label($1) AND hot_spot_label(h.village) = hot_spot_label($2)
			AND (h.subcounty_id = $3 OR (h.subcounty_id IS NULL AND h.district_id = $4))
			AND h.id IS DISTINCT FROM $5::uuid)`,
		d.Name, d.Village, d.SubcountyID, d.DistrictID, excludeID).Scan(&duplicate); err != nil {
		return err
	}
	if duplicate {
		return ErrDuplicateName
	}
	return nil
}

func addComment(ctx context.Context, tx pgx.Tx, hotSpotID, userID, action, text string) error {
	_, err := tx.Exec(ctx, `INSERT INTO hot_spot_comments (hot_spot_id, user_id, action, comment)
		VALUES ($1, $2, $3, $4)`, hotSpotID, userID, action, text)
	return err
}

// addEvent records a workflow step with the hotspot's resulting status. With
// notifyDistrict, it goes to the hotspot's district store, where DCFPs read it.
func addEvent(ctx context.Context, tx pgx.Tx, hotSpotID, actorID, action string, notifyDistrict bool, notifyUser *string) error {
	_, err := tx.Exec(ctx, `INSERT INTO hot_spot_events (hot_spot_id, actor_id, action, status, notify_store_id, notify_user_id)
		SELECT h.id, $2, $3, h.status,
			CASE WHEN $4 THEN (SELECT s.id FROM stores s WHERE s.district_id = h.district_id AND s.store_type = 'district') END,
			$5
		FROM hot_spots h WHERE h.id = $1`, hotSpotID, actorID, action, notifyDistrict, notifyUser)
	return err
}
