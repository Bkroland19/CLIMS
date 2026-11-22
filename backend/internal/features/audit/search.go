package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"time"

	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Record is an audit entry as the search API returns it.
type Record struct {
	ID         string          `json:"id"`
	OccurredAt time.Time       `json:"occurred_at"`
	Action     string          `json:"action"`
	Outcome    string          `json:"outcome"`
	Reason     *string         `json:"reason"`
	Actor      *ActorSnapshot  `json:"actor"`
	System     *string         `json:"system_actor"`
	Target     *Subject        `json:"target"`
	Subjects   []Subject       `json:"subjects"`
	Changes    json.RawMessage `json:"changes"`
	Details    json.RawMessage `json:"details"`
	IPAddress  *string         `json:"ip_address"`
	UserAgent  *string         `json:"user_agent"`
	RequestID  *string         `json:"request_id"`
	SessionID  *string         `json:"session_id"`
}

// ActorSnapshot is the acting user as they were when the entry was written.
type ActorSnapshot struct {
	ID       string   `json:"id"`
	Username *string  `json:"username"`
	Roles    []string `json:"roles"`
}

// Filter narrows a search; empty fields match everything.
type Filter struct {
	ActorID     *string
	Action      string
	Outcome     string
	SubjectType string
	SubjectID   string
	From, To    *time.Time
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// search returns matching entries, newest first. A subject matches an entry's
// target or any of its related records.
func (r *Repository) search(ctx context.Context, f Filter, limit, offset int32) ([]Record, error) {
	rows, err := r.db.Query(ctx, `SELECT a.id, a.occurred_at, a.action, a.outcome, a.reason,
			a.actor_id, a.actor_username, a.actor_roles, a.system_actor, a.target_type, a.target_id,
			coalesce((SELECT jsonb_agg(jsonb_build_object('type', s.subject_type, 'id', s.subject_id)
				ORDER BY s.subject_type, s.subject_id) FROM audit_log_subjects s WHERE s.audit_id = a.id), '[]'),
			a.changes, a.details, a.ip_address, a.user_agent, a.request_id, a.session_id
		FROM audit_log a
		WHERE ($1::uuid IS NULL OR a.actor_id = $1) AND ($2 = '' OR a.action = $2) AND ($3 = '' OR a.outcome = $3)
			AND ($4::timestamptz IS NULL OR a.occurred_at >= $4) AND ($5::timestamptz IS NULL OR a.occurred_at < $5)
			AND ($6 = '' OR a.id IN (SELECT audit_id FROM audit_log_subjects WHERE subject_type = $6 AND subject_id = $7))
		ORDER BY a.occurred_at DESC, a.id DESC LIMIT $8 OFFSET $9`,
		f.ActorID, f.Action, f.Outcome, f.From, f.To, f.SubjectType, f.SubjectID, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Record, error) {
		var rec Record
		var actorID, actorName, targetType, targetID *string
		var roles []string
		var subjects []byte
		err := row.Scan(&rec.ID, &rec.OccurredAt, &rec.Action, &rec.Outcome, &rec.Reason,
			&actorID, &actorName, &roles, &rec.System, &targetType, &targetID, &subjects,
			&rec.Changes, &rec.Details, &rec.IPAddress, &rec.UserAgent, &rec.RequestID, &rec.SessionID)
		if err != nil {
			return rec, err
		}
		if actorID != nil {
			rec.Actor = &ActorSnapshot{ID: *actorID, Username: actorName, Roles: roles}
		}
		if targetType != nil && targetID != nil {
			rec.Target = &Subject{Type: *targetType, ID: *targetID}
		}
		if rec.Changes == nil {
			rec.Changes = json.RawMessage("null")
		}
		return rec, json.Unmarshal(subjects, &rec.Subjects)
	})
}

type Handler struct {
	repo    *Repository
	auditor Auditor
}

// RegisterRoutes serves GET /audit behind requireRead, which must check audit:read
// (rbac.RequirePermission("audit:read")). It is passed in because rbac records its
// own changes in the audit log and so cannot be imported here.
func RegisterRoutes(router fiber.Router, repo *Repository, auditor Auditor, jwtMiddleware, activeUser, requireRead fiber.Handler) {
	h := &Handler{repo: repo, auditor: auditor}
	router.Get("/audit", jwtMiddleware, activeUser, requireRead, h.search)
}

func (h *Handler) search(c fiber.Ctx) error {
	limit, limitErr := strconv.ParseInt(c.Query("limit", "50"), 10, 32)
	offset, offsetErr := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if limitErr != nil || offsetErr != nil || limit < 1 || limit > 100 || offset < 0 {
		return response.Error(c, 400, "limit must be between 1 and 100 and offset must be nonnegative", nil)
	}
	f := Filter{Action: c.Query("action"), Outcome: c.Query("outcome"),
		SubjectType: c.Query("subject_type"), SubjectID: c.Query("subject_id")}
	if raw := c.Query("actor_id"); raw != "" {
		id, err := request.ParseUUID(raw)
		if err != nil {
			return response.Error(c, 400, "actor_id must be a nonzero UUID", nil)
		}
		f.ActorID = &id
	}
	if f.Outcome != "" && f.Outcome != OutcomeSuccess && f.Outcome != OutcomeFailure {
		return response.Error(c, 400, "outcome must be success or failure", nil)
	}
	if (f.SubjectType == "") != (f.SubjectID == "") {
		return response.Error(c, 400, "subject_type and subject_id go together", nil)
	}
	for name, target := range map[string]**time.Time{"from": &f.From, "to": &f.To} {
		if raw := c.Query(name); raw != "" {
			at, err := parseTime(raw)
			if err != nil {
				return response.Error(c, 400, name+" must be a date (2026-11-21) or an RFC 3339 time", nil)
			}
			*target = &at
		}
	}

	// Reading the audit log is itself audited, before any results are returned.
	if err := h.auditor.RecordNow(c.Context(), Entry{Action: "audit.searched", Details: map[string]any{
		"filters": c.Queries(), "limit": limit, "offset": offset,
	}}); err != nil {
		slog.Error("record audit search", "error", err)
		return response.Error(c, 500, "audit search failed", nil)
	}
	records, err := h.repo.search(c.Context(), f, int32(limit), int32(offset))
	if err != nil {
		slog.Error("audit search failed", "error", err)
		return response.Error(c, 500, "audit search failed", nil)
	}
	return response.Success(c, 200, "audit entries retrieved", records)
}

// parseTime accepts a date, meaning its start in UTC, or an RFC 3339 time.
func parseTime(raw string) (time.Time, error) {
	if at, err := time.Parse(time.DateOnly, raw); err == nil {
		return at, nil
	}
	return time.Parse(time.RFC3339, raw)
}
