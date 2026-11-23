# ADR 0002: A shared notification service, in-app first

- **Status:** Accepted
- **Date:** 2026-11-21
- **Applies to:** `backend/`; the web and mobile clients consume the result

## Context

Features need to tell people things: a DCFP that a VHT submitted a hotspot, a VHT that it was
activated, a rider that stock was dispatched. Today each feature does this on its own:

- Orders write `order_events` rows addressed to a store or a user, and serve them at
  `GET /orders/notifications`.
- Hotspots write `hot_spot_events` rows addressed to a district or a user, and serve them at
  `GET /hotspots/notifications`.
- Neither tracks whether a notification was read, and each new feature would have to repeat the
  pattern and add another inbox.
- The legacy tables `user_notifications` (90 historical rows) and Laravel's `notifications`
  (empty) are unused.
- The web app's `NotificationsBell` shows "Notifications are not connected yet". The mobile
  `PushBanner` reads local data and notes that "real push needs a server".

The team wants one service that any workflow can call to notify one person or a group, delivering
by email, SMS and in-app. There is no budget for an email or SMS provider yet, and the stack has no
queue or broker, only PostgreSQL.

## Decisions

### 1. In-app delivery only, with room for email and SMS

v1 delivers in-app only. Email and SMS will follow once a provider is funded. To keep that step
small, v1 has a `Channel` interface with a single in-app implementation, and each notification type
declares the channels it would use.

The outbox table, background worker, retries and failure handling are built together with the
first external channel, not before. An in-app notification is a row written in the same
transaction as the business change, so nothing needs delivering afterwards; building that
machinery now would leave untested code waiting for a provider.

### 2. One central inbox

All notifications go through one service and land in one inbox,
`GET /api/v1/notifications`. Features keep their event tables as workflow history, but those
tables stop being inboxes.

### 3. An internal package, called inside the caller's transaction

The service is a new package, `internal/features/notifications`, in the existing backend. It
needs no new infrastructure and can become a separate service later if load requires.

Features depend on a small `Notifier` interface (`Register`, `Notify`), created once in
`cmd/server/main.go` and passed in. There are no package-level globals, and features can be tested
with a fake.

`Notify` takes the caller's `pgx.Tx`. A notification is saved only if the business change commits,
and a failure to record it rolls the action back. Notifications are never lost and never sent for
something that did not happen.

### 4. Types are registered by the features that own them

Each feature registers its types at startup, for example `hotspot.submitted` or
`order.dispatched`, with a template and the channels it would use. The notifications package knows
nothing about orders or hotspots. Sending an unregistered type is an error.

The service owns the wording. Templates (Go `text/template`, English for now) are rendered **when
the notification is sent**, and the finished title and body are stored, so the inbox shows what was
true at that moment and reads stay cheap. Translation later means rendering in each recipient's
language at send time.

A notification holds:

- type, title and body
- the related resource (type and ID), so clients can open it
- the actor who caused it
- a small JSON `data` field for type-specific details
- per-recipient `read_at`

There are no priority levels.

### 5. Recipients are targets resolved to people at send time

A **target** combines filters that must all match:

- a user, or a list of users
- a role
- a **permission**, the preferred filter, since roles can be renamed or re-granted
- a store
- a district (through the users' assigned stores)

For example, "has `hotspots:activate` and covers district X" reaches that district's DCFPs but not
the riders and store staff who share its store. A send can include several targets; the results
are merged and de-duplicated, then stored as one row per person.

The actor and disabled accounts are left out, unless a type opts to include the actor. Because
groups are resolved at send time, someone who joins a district later does not see earlier
notifications. There are no saved custom groups in v1.

### 6. Duplicate protection

The caller passes an idempotency key, normally the ID of the event row that caused the
notification. The database allows one notification per key per recipient, so a retried request
cannot notify anyone twice.

### 7. Storage

- `notifications` stores each send once: type, title, body, resource, actor, data, idempotency key.
- `notification_recipients` holds one row per person (`notification_id`, `user_id`, `read_at`),
  so a send to 150 users stores its text once.
- The migration drops the empty legacy Laravel `notifications` table to reuse the name. Legacy
  `user_notifications` stays as history.
- Notifications are kept indefinitely, with indexes for the inbox and the unread count. There is
  no job scheduler yet; cleanup is revisited if volume calls for it.

### 8. Inbox API

Any signed-in, active user can read their own inbox; no extra permission is needed, and nobody can
see anyone else's.

| Method | Route                                | Purpose                                        |
| ------ | ------------------------------------ | ---------------------------------------------- |
| GET    | `/api/v1/notifications`              | Newest first; `unread=true`, `limit`, `offset` |
| GET    | `/api/v1/notifications/unread-count` | For the bell badge                             |
| POST   | `/api/v1/notifications/{id}/read`    | Mark one read; no effect if already read       |
| POST   | `/api/v1/notifications/read-all`     | Mark all read                                  |

Each item carries the type, title, body, resource type and ID, actor, data, `read_at` and
`created_at`. Clients check for new notifications periodically (for example the unread count every
30–60 seconds); server push to open clients can be added later behind the same API.

### 9. Orders and hotspots move to the service as a straight port

Who gets notified does not change; targets become permission-based. For example:

- Hotspots: `submitted`, `updated`, `resubmitted` and comments from the submitter go to
  "`hotspots:activate` in the hotspot's district". `activated`, `deactivated`, `rejected` and
  comments from a DCFP go to the submitting VHT.
- Orders: each recipient `order_events` addresses today keeps receiving the same step. A stockout
  goes to the district store, a replenishment request to the warehouse, a warehouse dispatch and
  its receipt to the district store, a district dispatch to the rider, and a delivery to the
  reporter. Store-addressed steps target the permission that acts on them at that store, for
  example `orders:process`.

No new notifications are added in this work. Existing addressed events are not copied into the new
inbox, which starts empty; `order_events` and `hot_spot_events` remain as history.
`/orders/notifications` and `/hotspots/notifications` are marked deprecated and removed once the
web and mobile clients use the central inbox. (`/orders/notifications` was removed in migration 32.)

## Out of scope for v1

- Email and SMS delivery, the outbox, worker and retries that come with them, per-user notification
  preferences, and an admin view of deliveries. These arrive with the first external channel, when
  there are costs to control and failed sends to inspect.
- Mobile push notifications (Expo or Firebase). The `Channel` interface leaves room for a push
  channel.
- Server push to open clients (SSE or WebSockets).
- A broadcast endpoint for people to send notifications, for example MoH to a district.
- Saved custom recipient groups.
- Cleaning up old notifications.
- Connecting the web `NotificationsBell` and the mobile `PushBanner`. These are separate tasks for
  the client owners, working from the documented API.

## Delivery

1. Notification service, tables and inbox API.
2. Hotspots moved to the service.
3. Orders moved to the service.
4. Old inbox endpoints removed, once the web and mobile clients have switched.

Each step includes its tests:

- unit tests for target resolution (filters, merging, de-duplication, leaving out the actor and
  disabled users) and for template rendering
- integration tests for the inbox (own notifications only, unread count, mark read, idempotency)
- the hotspot and orders integration tests updated to check the central inbox instead of the old
  endpoints

## Consequences

- Any feature can notify one person or a group with one call, without its own inbox.
- People get one place to see everything addressed to them, with read state.
- Recording notifications inside the business transaction means a notification failure fails the
  action. Recording a row is cheap and local, so this is acceptable for in-app delivery. External
  delivery will happen after commit, through the outbox, so a slow provider never blocks an action.
- Adding email or SMS later needs a provider adapter, the outbox and worker, and per-user
  preferences. Callers and stored notifications do not change.
- Until the clients switch, the old inbox endpoints and the new one both exist.
