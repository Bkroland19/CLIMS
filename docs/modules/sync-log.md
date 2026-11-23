# Sync log

[Module architecture](README.md) · [Audit log](audit.md)

The field app saves every action a VHT, hotspot manager or delivery agent takes, sends it when the
phone has network, and reports how that went. The sync log keeps those reports so MOH can answer
"my submission never arrived" without the phone in hand. Field users do not see the log; the app
keeps showing them only what is still waiting to send.

## What an entry holds

One entry per saved action, updated as the phone tries to send it:

| Field              | Meaning                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `client_entry_id`  | The phone's ID for the entry, unique per user                                           |
| `action`           | The field app action: `mapHotspot`, `stockout`, `acknowledge`, `pickup`, `deliver`, …   |
| `status`           | `waiting`, `retrying`, `sent`, `refused` or `saved_on_phone` (see below)                |
| `server_record_id` | The hotspot, stockout report or other record the API created or changed, once sent      |
| `queued_at`        | When the action was saved, by the phone's clock                                         |
| `changed_at`       | When the entry last changed, by the phone's clock                                       |
| `attempt_count`    | Every attempt to send it; `attempts` keeps the latest ten with time, HTTP status, error |
| `device`           | Platform, OS version and app version of the phone that reported it                      |

Statuses:

- **waiting**: saved, not tried yet.
- **retrying**: the last try did not reach the server (no network, timeout or a 5xx); the phone tries
  again when it reconnects.
- **sent**: the API accepted it.
- **refused**: the API rejected it, for example a duplicate hotspot name; the user was told in the app.
- **saved_on_phone**: the API has no endpoint for this action yet (`pickup`, `deliver`,
  `confirmReceipt`, `notify`), so only the phone's copy changed. It is never shown as sent.

## Privacy

Phones send metadata only. Payloads hold contact persons' names, phone numbers, GPS and comments,
and the server already has every record it accepted, linked through `server_record_id`. Errors are
short codes such as `network` or `http_409`; the API refuses free text. Sample (demo) sign-ins keep
no log.

## Matching the phone's account to the server's

Entries are what the phone says happened. The phone also sends its entry ID as the
`X-Client-Entry-Id` header on the request that submits the action, and every audit entry that request
writes keeps it as `details.client_entry_id`. `GET /api/v1/audit?client_entry_id=…` then shows what
the server recorded, so support can tell "sent and recorded" from "the phone thinks it sent".

## API

| Endpoint                | Who                         | Does                                                         |
| ----------------------- | --------------------------- | ------------------------------------------------------------ |
| `POST /api/v1/sync-log` | Any signed-in user          | Saves up to 100 of the user's own entries in one transaction |
| `GET /api/v1/sync-log`  | Holders of `sync_logs:read` | Filters by user, action, status, entry and time saved        |

An entry is re-sent whenever it changes. Versions are compared by `changed_at`, so an older version
arriving after a newer one (a retried upload) changes nothing. Phone clocks drift, so times up to a
day ahead of the server are accepted.

Migration 38 grants `sync_logs:read` to `moh` and `admin`. Change who holds it on the web app's
**Roles & permissions** page. The web app shows the log on the **Sync log** tab of **Audit** in the
MOH workspace.

The notification, HMIS 105 and hotspot reports count pending, refused and phone-only entries in the reader's
area, without `sync_logs:read`; see [reports](reports.md#field-data-not-yet-received).

## On the phone

`mobile/lib/syncLog.ts` keeps the log under its own storage key per user, separate from the app's
data, so resetting sample data leaves it alone. Entries are deleted once the server has their final
version; at most 500 are kept, and when full the oldest finished entries go first, never open ones.
The phone uploads after each send, when it reconnects, and when the app returns to the foreground.

## Not yet

- No automatic deletion on the server; plan a retention period before the table grows large.
- Reading the log is not itself audited, unlike `GET /audit`.
