# Notifications

[Module architecture](README.md) · [Design decision](../adr/0002-notification-service.md)

The notifications module is the shared way to notify one person or a group. Any feature sends through it, and every user reads their notifications in one inbox. Delivery is in-app for now; email and SMS follow once a provider is funded, without changes to the features that send.

[Hotspots](hotspots.md#notifications) and [orders](orders.md#notifications) send their workflow notifications through it, and [inventory](inventory.md#expiry-alerts) its batch expiry alerts.

## Sending from a feature

1. Depend on the `notifications.Notifier` interface, passed in from `cmd/server/main.go`, rather than creating a service yourself.
2. Register your types once at startup. A type name is `<feature>.<event>`. Its title and body are Go `text/template` strings filled from the message's `Data`; a missing field is an error rather than blank text.
3. Call `Notify` with the **transaction of the change** that caused the notification. The notification is saved only if the change commits, and a failure to record it rolls the change back.

```go
notifier.Register(notifications.Type{
	Name:     "hotspot.submitted",
	Title:    "New hotspot: {{.name}}",
	Body:     "{{.name}} in {{.district}} is waiting for verification.",
	Channels: []string{notifications.ChannelInApp},
})

err := notifier.Notify(ctx, tx, notifications.Message{
	Type:     "hotspot.submitted",
	ActorID:  &actorID,
	Resource: &notifications.Resource{Type: "hotspot", ID: hotSpotID},
	Data:     map[string]any{"name": name, "district": districtName},
	Targets: []notifications.Target{
		{Permission: "hotspots:activate", DistrictID: districtID},
	},
	IdempotencyKey: eventID,
})
```

### Choosing recipients

A `Target` combines filters that must all match: `UserIDs`, `Role`, `Permission`, `StoreID` and `DistrictID` (users whose assigned store is in the district). Prefer `Permission` to `Role`: roles can be renamed or re-granted, while a permission says what a person does. A target with no filters is rejected.

A message can have several targets. Their users are combined and de-duplicated, so each person receives one copy. Disabled accounts are never selected. The actor is left out unless the type sets `IncludeActor`. Recipients are resolved when the notification is sent, so someone who joins a district later does not receive earlier notifications. A send that matches nobody stores nothing.

### Repeats and channels

Pass the ID of the event that caused the notification as `IdempotencyKey`. A second send with the same type and key is ignored, so a retried request notifies nobody twice.

A type lists the channels it is meant for (`in_app`, `email`, `sms`). Only in-app delivery exists today, and channels that are not available yet are skipped, so a type can already declare `sms` for when a provider is funded.

## Inbox API

Every signed-in user can read their own notifications; no extra permission is needed, and nobody can read another user's.

| Method | Route                                | Purpose                                                  |
| ------ | ------------------------------------ | -------------------------------------------------------- |
| GET    | `/api/v1/notifications`              | Newest first; `unread=true`, `limit` (max 100), `offset` |
| GET    | `/api/v1/notifications/unread-count` | `{ "unread": n }` for the badge                          |
| POST   | `/api/v1/notifications/{id}/read`    | Mark one read; repeating it changes nothing              |
| POST   | `/api/v1/notifications/read-all`     | `{ "marked": n }`                                        |

Each notification has its `type`, `title`, `body`, the related `resource_type` and `resource_id` for opening the record, the `actor_id`, type-specific `data`, `read_at` and `created_at`. Clients check for new notifications periodically, for example the unread count every 30 to 60 seconds.

## Storage

`notifications` stores each send once, with its rendered text. `notification_recipients` holds one row per person with their `read_at`. Migration 20 created both and dropped Laravel's unused, empty `notifications` table. The legacy `user_notifications` table is kept as history. Notifications are kept indefinitely.
