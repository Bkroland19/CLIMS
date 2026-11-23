// Package audit is the central, append-only audit log: who did what, to which
// record, when and from where. See docs/adr/0003-audit-log.md.
package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Outcomes of an audited action.
const (
	OutcomeSuccess = "success"
	OutcomeFailure = "failure"
)

// Subject is a record an entry concerns, such as {"hotspot", id}.
type Subject struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// Entry describes one audited action. The actor, address, device, request and
// session come from the request (see Middleware) unless set here.
type Entry struct {
	// Action is "<domain>.<event>", e.g. "auth.login_failed" or "hotspot.activated".
	Action string
	// Outcome defaults to OutcomeSuccess.
	Outcome string
	// Reason explains a failure, e.g. "invalid_credentials".
	Reason  string
	Target  *Subject
	Related []Subject
	// Changes is the changed fields, normally from Diff.
	Changes map[string]Change
	// Details holds other facts, e.g. the identifier typed at a failed login. Never secrets.
	Details map[string]any
	// ActorID overrides the signed-in user, e.g. the account that has just logged in.
	ActorID string
	// SessionID overrides the request's session, e.g. the session a login created.
	SessionID string
}

// Auditor is what features depend on. Create one Service in main and pass it in.
type Auditor interface {
	// Record writes inside the transaction of the change, so the entry exists only
	// if the change commits.
	Record(ctx context.Context, tx pgx.Tx, entry Entry) error
	// RecordNow writes immediately, for failures and refusals that change nothing.
	RecordNow(ctx context.Context, entry Entry) error
}

var actionPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`)

// domainPattern matches the part of an action before the dot.
var domainPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// Service is the Auditor backed by PostgreSQL.
type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Record(ctx context.Context, tx pgx.Tx, entry Entry) error {
	return write(ctx, tx, entry)
}

func (s *Service) RecordNow(ctx context.Context, entry Entry) error {
	return write(ctx, s.db, entry)
}

type executor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// The actor's username and roles are copied in the same statement, so the entry
// stays readable after the account changes or is deleted.
const insertEntry = `WITH actor AS (
		SELECT u.username, ARRAY(SELECT r.name FROM role_user ru JOIN roles r ON r.id = ru.role_id
			WHERE ru.user_id = u.id ORDER BY r.name) AS roles
		FROM users u WHERE u.id = $4::uuid
	), entry AS (
		INSERT INTO audit_log (action, outcome, reason, actor_id, actor_username, actor_roles, system_actor,
			target_type, target_id, changes, details, ip_address, user_agent, request_id, session_id)
		SELECT $1, $2, $3, $4::uuid, (SELECT username FROM actor), coalesce((SELECT roles FROM actor), '{}'),
			$5, $6, $7, $8, $9, $10, $11, $12, $13::uuid
		RETURNING id
	)
	INSERT INTO audit_log_subjects (audit_id, subject_type, subject_id)
	SELECT entry.id, subject.type, subject.id
	FROM entry, unnest($14::text[], $15::text[]) AS subject(type, id)`

func write(ctx context.Context, db executor, entry Entry) error {
	if !actionPattern.MatchString(entry.Action) {
		return fmt.Errorf("audit action %q must look like domain.event", entry.Action)
	}
	outcome := entry.Outcome
	if outcome == "" {
		outcome = OutcomeSuccess
	}
	req := requestFrom(ctx)
	actor, system := req.actorID(), req.system
	if entry.ActorID != "" {
		actor, system = entry.ActorID, ""
	}
	session := req.sessionID()
	if entry.SessionID != "" {
		session = entry.SessionID
	}
	var changes []byte
	if len(entry.Changes) > 0 {
		var err error
		if changes, err = json.Marshal(entry.Changes); err != nil {
			return fmt.Errorf("encode audit changes: %w", err)
		}
	}
	details, err := json.Marshal(scrub(entry.Details))
	if err != nil {
		return fmt.Errorf("encode audit details: %w", err)
	}
	var targetType, targetID *string
	if entry.Target != nil {
		targetType, targetID = &entry.Target.Type, &entry.Target.ID
	}
	types, ids := subjects(entry)
	_, err = db.Exec(ctx, insertEntry, entry.Action, outcome, nullable(entry.Reason), nullable(actor),
		nullable(system), targetType, targetID, changes, details, nullable(req.ip),
		nullable(req.userAgent), nullable(req.requestID), nullable(session), types, ids)
	if err != nil {
		return fmt.Errorf("record audit entry %s: %w", entry.Action, err)
	}
	return nil
}

// subjects lists the target and related records once each, for searching.
func subjects(entry Entry) ([]string, []string) {
	types, ids := []string{}, []string{}
	seen := map[Subject]bool{}
	add := func(s Subject) {
		if s.Type == "" || s.ID == "" || seen[s] {
			return
		}
		seen[s] = true
		types, ids = append(types, s.Type), append(ids, s.ID)
	}
	if entry.Target != nil {
		add(*entry.Target)
	}
	for _, s := range entry.Related {
		add(s)
	}
	return types, ids
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
