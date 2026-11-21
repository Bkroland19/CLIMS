# ADR 0003: A central, append-only audit log

- **Status:** Accepted
- **Date:** 2026-11-21
- **Applies to:** `backend/`; nginx and the deployment provide the client address

## Context

The system cannot yet answer "who did what, to which record, when and from where":

- A successful login creates a `user_sessions` row with the user agent and `c.IP()`. The app is
  created with `fiber.New()` defaults behind nginx, so `c.IP()` is nginx's container address
  (`172.21.0.6` in development) for every request, and every session records it.
- Failed logins, logins to disabled accounts, and who revoked a session are not stored anywhere.
  Sessions are deleted with their user.
- `order_events`, `hot_spot_events` and `inventory_movements` record each feature's workflow, but
  nothing records changes to users, roles, permissions, store assignments or the catalogue.
- The request log on stdout has each request's method, path, status, IP and request ID, but it is
  not queryable and is lost when logs rotate.

About thirty endpoints change data: authentication, user and role administration, store
assignment, the catalogue, hotspots, orders and inventory.

## Decisions

### 1. What is audited

- **Security events:** successful and failed logins, logins to disabled accounts, logout, session
  revocation, self-registration, and security-relevant token refreshes (decision 9).
- **Access-control changes:** creating users, assigning roles and stores, changing role
  permissions, enabling and disabling accounts.
- **Business data changes:** hotspots, orders, inventory movements and the catalogue.
- **Permission denials:** HTTP 403 from the permission check.
- **Searches of the audit log itself.**

Not audited: reads of ordinary records, exports (none exist yet), notification read state,
unauthenticated 401s (mostly expired sessions), and migrations and legacy imports, which git and
the migration history already record.

### 2. One central log, separate from feature history

A single `audit_log` table answers "who did what" across the system. The feature event tables stay
as workflow history; a business action writes both, and the small overlap is accepted. A view over
the event tables could not cover logins, users, roles or the catalogue.

### 3. What an entry holds

- **Actor:** the user's ID plus a copy of their username and roles at that moment, so the entry
  stays readable after the account is renamed or deleted. Automated jobs record as a named
  `system` actor without a user.
- **Action:** `<domain>.<event>`, for example `auth.login_failed`, `user.roles_changed`,
  `role.permissions_changed`, `hotspot.activated`, `order.dispatched`,
  `inventory.movement_recorded`, `catalogue.product_updated`, `access.denied`, `audit.searched`.
  Each feature keeps its names as constants; the docs list them all.
- **Target:** the record acted on, as type and ID.
- **Related records:** a short list of other records the action concerns, stored in an indexed
  side table. A stockout's target is the order, and its related records are the hotspot, district
  and store. This is what lets the log be isolated for one hotspot, district, store, order or user,
  including actions whose target is a different record.
- **Outcome:** success or failure, with a reason such as `invalid_credentials`.
- **Changes:** for data changes, only the fields that changed, before and after.
- **Context:** the real client IP, user agent, request ID (to match server log lines), session ID
  and time.

Secrets are never stored: no passwords, password hashes, tokens or token hashes. A failed login
records the identifier that was typed, and the matching account when there is one, but never the
password.

### 4. Writing entries

Features depend on an injected `Auditor` interface, created once in `cmd/server/main.go`, in the
same way as the `Notifier`:

- `Record(ctx, tx, entry)` writes inside the transaction of a successful change, so an entry is
  saved only if the change commits and is never lost.
- `RecordNow(ctx, entry)` writes immediately for failures and refusals, which have no transaction
  to join.

A middleware puts the request context (actor, IP, user agent, request ID, session) into each
request, so a feature only describes the action, target, related records and changes. The
permission check, `rbac.RequirePermission`, records denials itself, so no feature has to remember
to.

Changes are captured by the feature passing the record's state before and after to a shared helper,
which keeps the changed fields and drops anything on a deny-list of secret fields. Database triggers
were rejected because the database cannot tell who made a change or which action it was: an
activation and a plain edit look the same.

### 5. Append-only and kept

A database trigger refuses every `UPDATE` and `DELETE` on the audit tables, including from the
application's own database user. Entries are not deleted with their user: there is no cascading
foreign key, and the copied name keeps the entry readable. Entries are kept indefinitely, with
indexes for searches by actor, by subject and by time, unless Ministry of Health policy sets a
retention period. A hash chain, which would make an edited or missing entry detectable, can be added
if auditors require it.

### 6. Reading the log

`GET /api/v1/audit` searches the log, newest first and paginated, with filters that combine:
`actor_id`, `action`, `subject_type` with `subject_id` (matching the target or a related record),
`outcome`, `from` and `to`. It requires a new national `audit:read` permission, granted to `admin`
by the migration and to other roles, such as an MoH auditor, through the RBAC API. Every search is
itself audited with the filters used. District-scoped reading waits for a real need; DCFPs and VHTs
already see a hotspot's workflow history at `/hotspots/{id}/events`.

### 7. The real client address

The backend reads the client's address from `X-Real-IP`, which nginx overwrites with the address
that connected to it, so a client cannot supply its own value through nginx (unlike
`X-Forwarded-For`, which nginx appends to). The header is trusted only on requests from the private
container network, where nginx is the API's caller; `TRUSTED_PROXIES` can narrow that to named
addresses. Without this, every entry would record nginx's address, so it is the first step. A load
balancer in front of nginx is configured in nginx itself (`set_real_ip_from`), so nginx passes on
the real client address without a code change.

### 8. Alerts

There are no automatic alerts in v1, such as notifying admins of repeated failed logins. The log
records what they need, and they can be added later on top of the notification service.

### 9. Token refreshes

Access tokens last 15 minutes, so routine refreshes would dominate the log. Only security-relevant
refreshes are audited: a refresh from a different IP address or device than the session's last
one, a reused (replayed) refresh token, and a refused refresh. Routine refreshes only update the
session's `last_seen_at`, as before.

## Delivery

1. The client IP fix.
2. The audit core: tables, append-only trigger, related records, search API, request-context
   middleware, and the authentication events.
3. Users, roles, permissions and store assignment, plus permission denials.
4. Hotspots, orders, inventory and the catalogue.

Each step includes tests:

- unit tests for change capture and the secret deny-list
- integration tests showing that writes commit and roll back with their change, that updates and
  deletes are refused, that failures and denials are recorded, that searches isolate a subject
  through related records, and that searching requires `audit:read` and is itself audited

## Consequences

- Administrators and auditors can answer who did what, to which record, when and from where, for
  any user, hotspot, order, district or store.
- Login sessions and audit entries record the real client address.
- Recording inside the business transaction means an audit failure fails the action. That keeps
  the log complete at the cost of tying each change to a successful audit write.
- Every audited feature must call the `Auditor` and declare its related records. Permission
  denials are covered centrally.
- The log grows without limit until a retention policy is set.
