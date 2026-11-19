# Users module

[Module architecture](README.md) · [OpenAPI contract](../api/openapi.json)

Source: `backend/internal/features/users/`.

| File            | Responsibility                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| `model.go`      | Account response model and `HasPermission` implementation                     |
| `dto.go`        | Account input, admin creation, role assignment, status change, normalization  |
| `repository.go` | Account SQL, identity lookup, paginated listing, transactional access changes |
| `service.go`    | Shared bcrypt hashing and account creation                                    |
| `middleware.go` | Active-account resolution and current-user retrieval                          |
| `handler.go`    | Management requests, validation, pagination, and HTTP responses               |
| `routes.go`     | User routes and required permission gates                                     |

## Management routes

All routes require JWT authentication and an active account.

| Method | Route                       | Required permissions                   |
| ------ | --------------------------- | -------------------------------------- |
| GET    | `/api/v1/users`             | `users:read`                           |
| GET    | `/api/v1/users/{id}`        | `users:read`                           |
| POST   | `/api/v1/users`             | Both `users:create` and `roles:assign` |
| PATCH  | `/api/v1/users/{id}/role`   | `roles:assign`                         |
| PUT    | `/api/v1/users/{id}/roles`  | `roles:assign`                         |
| PATCH  | `/api/v1/users/{id}/status` | `users:update`                         |

Listing defaults to `limit=50&offset=0`, allows limits from 1 to 100, and orders by user ID. Account responses include names, email, phone, status, and the complete `roles` array with each role’s permissions. The legacy `role` field contains the assigned role with the lowest numeric ID, or null when there are no assignments. `PasswordHash` has `json:"-"` and is never serialized.

Admin creation accepts signup fields plus either one existing `role_id` or a nonempty `role_ids` array. Unknown roles reject the entire transaction. Supplying only `users:create` does not allow a caller to create an administrator; the route also requires `roles:assign`.

## Account creation and persistence

`Service.Create` hashes the password and calls the repository. Signup, admin creation, and `cmd/create-admin` share it. Its callers perform normalization and input validation before invoking it. The repository stores hashes in the legacy `users.password` column and writes role assignments to `role_user` in the same transaction.

Public signup starts with `roles: []` and `role: null`. Legacy imports map recognized numeric role IDs to assignments. Unresolved legacy values grant no management permissions. Legacy accounts with a null email return an empty email string in responses.

The repository joins roles and permission mappings when looking up users. PostgreSQL's normalized email index prevents concurrent duplicate email registrations. Other database failures return a server error rather than being reported as duplicate emails.

## Access changes and administrator protection

`UpdateUserAccess` updates role or account status inside a transaction. It takes a PostgreSQL transaction advisory lock before reading and updating the account, serializing account-access changes. A request that would disable or demote the last active account with role `1` returns 409. This guard applies to concurrent API requests; operators with direct database access must preserve the invariant themselves.

Allowed status updates are `active` and `disabled`. Use `PUT /api/v1/users/{id}/roles` with up to 100 existing numeric IDs in `role_ids` to replace the full set. Duplicate IDs collapse into one assignment, and an empty array clears the set. The legacy `PATCH /api/v1/users/{id}/role` endpoint replaces the full set with one role. There is no user deletion endpoint. The current API also does not provide profile editing, password changes, organization assignment, or organization-scoped access.

## Administrator provisioning

Use imported active role-1 accounts, or set `CLIMS_ADMIN_EMAIL`, `CLIMS_ADMIN_PASSWORD`, and optionally `CLIMS_ADMIN_USERNAME` before running `make create-admin`. The command applies migrations and creates a new administrator without overwriting an existing account. It requires operator database access and Go 1.26+; the HTTP API offers no unauthenticated admin-bootstrap route.
