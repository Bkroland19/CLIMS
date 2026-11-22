# CLIMS in the MoH SSO Dashboard

`clims.application.yaml` is the portal import template for launching CLIMS in
its own tab. Fill in the target environment, deployment URL, support URL and
owner details. The URLs and contact in the template are placeholders.

1. Use the MoH identity administration workflow to provision a confidential
   OpenID Connect client with client ID `clims` and client role `clims_access`
   in the same Keycloak realm as the target dashboard. Set its redirect URI to
   `https://<clims-host>/api/v1/auth/sso/callback`, require PKCE (S256), and add
   a client-role mapper that puts the `clims` client roles in the ID token as
   `clims_roles`. The dashboard's `infra/keycloak/realm-export.json` has the
   reference definition.
2. In the dashboard, open **Systems → Import manifest**, review the proposed
   registry entry and import it. Follow the dashboard activation workflow when
   CLIMS is ready for users. Assign the application role to the pilot group.
3. Provision or identify each pilot user's CLIMS account and confirm their
   existing role and facility assignment. Use a verified Keycloak issuer and
   subject from the same realm and the user's existing CLIMS UUID when recording
   the account link.

Migration 000014 establishes the account link. It allows an issuer and subject
to identify exactly one CLIMS user, and a CLIMS user to have one identity per
issuer. The issuer is the exact `iss` value and the subject is the stable
`sub` value. An authorized database operator can provision the link with this
parameterized statement after confirming both identities:

```sql
INSERT INTO user_oidc_identities (issuer, subject, user_id)
VALUES ($1, $2, $3::uuid);
```

## Portal sign-in

Set these on the backend to turn portal sign-in on. Without `OIDC_CLIENT_ID`,
CLIMS offers password sign-in only.

| Variable                   | Value                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER`              | The realm issuer, exactly as it appears in `iss`, e.g. `https://sso.health.go.ug/realms/moh`. The dashboard reconciler must use the same value.                                                                        |
| `OIDC_CLIENT_ID`           | `clims`                                                                                                                                                                                                                |
| `OIDC_CLIENT_SECRET`       | The `clims` client secret                                                                                                                                                                                              |
| `OIDC_PUBLIC_ORIGIN`       | The CLIMS address users see, scheme and host only, e.g. `https://clims.health.go.ug`                                                                                                                                   |
| `IDENTITY_SYNC_CLIENT_ID`  | `clims-identity-sync`, the dashboard reconciler's service client. Optional; it turns on the identity-sync endpoints, which require an HTTPS issuer. Its service account holds the `clims` client role `identity_sync`. |
| `IDENTITY_SYNC_TEST_PROBE` | Leave unset. `1` adds the conformance suite's session probe; test environments only.                                                                                                                                   |

The portal tile opens `/api/v1/auth/sso/start`. The flow is:

1. `GET /api/v1/auth/sso/start` stores state, nonce and a PKCE verifier in a
   short-lived cookie and redirects to Keycloak.
2. `GET /api/v1/auth/sso/callback` exchanges the code and verifies the ID
   token, its nonce and `azp`, and requires `clims_access` in `clims_roles`. It
   then looks up the account by the linked issuer and subject. Email is never
   used to find an account. The account must be active and hold at least one
   CLIMS role, the same rule identity sync uses.
3. The callback starts an ordinary CLIMS session and hands its refresh token to
   the browser in an HttpOnly cookie scoped to `/api/v1/auth/sso/exchange`
   that lasts 60 seconds. It redirects to `/sso/complete`.
4. That page posts to `/api/v1/auth/sso/exchange`. The exchange checks the
   `Origin` header, rotates the refresh token so the handoff works only once,
   and returns the same body as a password login.

The user keeps their existing CLIMS roles, permissions and facility
assignment, because the session belongs to their existing account.

When sign-in is refused, the callback redirects to
`/sign-in?sso_error=<reason>` and the sign-in page explains it:

| Reason        | Cause                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `denied`      | No `clims_access` role in the token, or the token was issued to another client                                                     |
| `unavailable` | No account link for this Keycloak user, or the linked account is disabled or has no role                                           |
| `invalid`     | Missing or mismatched state, nonce or ID token. Usually a stale tab or a sign-in that was started somewhere other than the portal. |
| `failed`      | Keycloak or the database could not be reached                                                                                      |
| `expired`     | The handoff was older than 60 seconds or had already been used                                                                     |

Signing out of CLIMS ends the CLIMS session only; the Keycloak session stays.

## Identity sync (contract 1.1)

With `IDENTITY_SYNC_CLIENT_ID` set, CLIMS serves the MoH identity-sync contract
v1.1 at `/api/v1/internal/identity-sync`. The contract is defined in the
dashboard repository (`docs/integrations/identity-sync-contract.md`). Every
request needs a Keycloak access token for `aud` `clims`, `azp` equal to
`IDENTITY_SYNC_CLIENT_ID`, `typ` `Bearer`, and the `clims` client role
`identity_sync`. A token that is missing, badly signed, expired, from another
issuer or for another audience gets 401. A valid token that fails any of the
other checks gets 403.

| Endpoint                      | Purpose                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                       | Descriptor: application `clims`, account IDs `uuid`, page size 100, capabilities `accounts.list`, `identity.link`, `sessions.revoke`                                                                                                                 |
| `GET /accounts?after=&limit=` | Active accounts with at least one role, in UUID order, each with its current `link` for `OIDC_ISSUER` or `null`                                                                                                                                      |
| `PUT /accounts/{id}/identity` | Records a link. It never replaces a link or grants roles.                                                                                                                                                                                            |
| `POST /sessions/revoke`       | Ends every CLIMS session of the linked account at once. Access tokens stop working on their next request, because each request checks its session, and refresh tokens are refused. The link and roles stay. Returns 204 even when nothing is linked. |

When portal access to CLIMS is removed, the dashboard removes `clims_access` in
Keycloak, so new sign-ins are refused, and then calls `POST /sessions/revoke`,
which ends existing sessions immediately.

### Test session probe

`IDENTITY_SYNC_TEST_PROBE=1` adds two routes for the dashboard's conformance
suite. They use the same bearer checks as the endpoints above:

- `POST /test/sessions` with `{"issuer","subject"}` starts a real CLIMS session
  for the linked account and returns `201 {"sessionToken": "..."}`, or 404 when
  nothing is linked.
- `GET /test/sessions/check` with header `X-Test-Session: <token>` returns 200
  while that session would still authorize a request, and 401 once it is
  revoked or expired.

Never set this flag outside a disposable test environment. Without it the
routes do not exist, and the backend logs a warning at startup whenever it is
on.

Keep the launcher in the registration workflow until pilot users have signed
in from the portal and CLIMS authorization has been verified with users from
different facilities.
