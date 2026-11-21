package integration

import (
	"context"
	"testing"

	"clims-backend/internal/features/notifications"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testNotifications sends through the real service and reads the inbox over HTTP.
// districtStore is a district store; its district scopes the district target.
func testNotifications(t *testing.T, pool *pgxpool.Pool,
	request func(string, string, any, string, int) map[string]any,
	login func(string, string, int) string,
	admin, districtStore string,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	var district, otherStore, roleID, registeredRole string
	if err := pool.QueryRow(ctx, `SELECT district_id FROM stores WHERE id = $1`, districtStore).Scan(&district); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM stores WHERE store_type = 'district' AND id <> $1
		ORDER BY code LIMIT 1`, districtStore).Scan(&otherStore); err != nil {
		t.Fatal(err)
	}
	// A dedicated role and permission, so users from other tests are never selected.
	if err := pool.QueryRow(ctx, `INSERT INTO roles (name) VALUES ('notification tester') RETURNING id`).Scan(&roleID); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO permissions (name, description) VALUES ('notifications:test', 'Integration test only')`)
	exec(`INSERT INTO role_permission (role_id, permission_id)
		SELECT $1, id FROM permissions WHERE name = 'notifications:test'`, roleID)
	if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'registered user'`).Scan(&registeredRole); err != nil {
		t.Fatal(err)
	}
	account := func(name string, roleIDs []string, store *string) (string, string) {
		t.Helper()
		email := name + "@example.test"
		id := request("POST", "/users", map[string]any{
			"username": name, "email": email, "password": "test-password-123", "role_ids": roleIDs,
		}, admin, 201)["data"].(map[string]any)["user_id"].(string)
		exec(`UPDATE users SET store_id = $2 WHERE id = $1`, id, store)
		return id, login(email, "test-password-123", 200)
	}
	inDistrict, inDistrictToken := account("notify-in-district", []string{roleID}, &districtStore)
	elsewhere, _ := account("notify-elsewhere", []string{roleID}, &otherStore)
	disabled, _ := account("notify-disabled", []string{roleID}, &districtStore)
	actor, _ := account("notify-actor", []string{roleID}, &districtStore)
	listed, listedToken := account("notify-listed", []string{registeredRole}, nil)
	exec(`UPDATE users SET status = 'disabled' WHERE id = $1`, disabled)

	service := notifications.NewService()
	service.MustRegister(
		notifications.Type{Name: "test.ping", Title: "Hi {{.who}}", Body: "Ping for {{.who}}",
			Channels: []string{notifications.ChannelInApp, notifications.ChannelSMS}},
		notifications.Type{Name: "test.self", Title: "Self", Body: "Includes the actor",
			Channels: []string{notifications.ChannelInApp}, IncludeActor: true},
	)
	send := func(msg notifications.Message, commit bool) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if err = service.Notify(ctx, tx, msg); err != nil {
			t.Fatal(err)
		}
		if commit {
			if err = tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
	recipients := func(key string) map[string]bool {
		t.Helper()
		rows, err := pool.Query(ctx, `SELECT nr.user_id FROM notification_recipients nr
			JOIN notifications n ON n.id = nr.notification_id WHERE n.idempotency_key = $1`, key)
		if err != nil {
			t.Fatal(err)
		}
		ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			t.Fatal(err)
		}
		found := map[string]bool{}
		for _, id := range ids {
			found[id] = true
		}
		return found
	}

	// Targets: permission AND district, plus an explicit list that repeats a user.
	resource := &notifications.Resource{Type: "hotspot", ID: uuid.NewString()}
	ping := notifications.Message{
		Type: "test.ping", ActorID: &actor, Resource: resource, IdempotencyKey: "ping-1",
		Data: map[string]any{"who": "there"},
		Targets: []notifications.Target{
			{Permission: "notifications:test", DistrictID: district},
			{UserIDs: []string{listed, inDistrict}},
		},
	}
	send(ping, true)
	got := recipients("ping-1")
	if len(got) != 2 || !got[inDistrict] || !got[listed] || got[elsewhere] || got[disabled] || got[actor] {
		t.Fatalf("recipients: %v", got)
	}
	send(ping, true) // A repeat with the same key is ignored.
	var sends int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE idempotency_key = 'ping-1'`).Scan(&sends); err != nil {
		t.Fatal(err)
	}
	if sends != 1 {
		t.Fatalf("idempotency: %d notifications for one key", sends)
	}
	rolledBack := ping
	rolledBack.IdempotencyKey = "ping-rolled-back"
	send(rolledBack, false)
	if len(recipients("ping-rolled-back")) != 0 {
		t.Fatal("a rolled-back change still left a notification")
	}
	nobody := ping
	nobody.IdempotencyKey = "ping-nobody"
	nobody.Targets = []notifications.Target{{Role: "notification tester", StoreID: uuid.NewString()}}
	send(nobody, true)
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE idempotency_key = 'ping-nobody'`).Scan(&sends); err != nil {
		t.Fatal(err)
	}
	if sends != 0 {
		t.Fatal("a send with no recipients was stored")
	}
	send(notifications.Message{Type: "test.self", ActorID: &actor, IdempotencyKey: "self-1",
		Targets: []notifications.Target{{UserIDs: []string{actor}}}}, true)
	if !recipients("self-1")[actor] {
		t.Fatal("IncludeActor did not keep the actor")
	}
	send(notifications.Message{Type: "test.ping", IdempotencyKey: "ping-listed-only",
		Data:    map[string]any{"who": "listed"},
		Targets: []notifications.Target{{UserIDs: []string{listed}}}}, true)

	// Inbox: own notifications, newest first, unread count, mark read.
	unread := func(token string) float64 {
		t.Helper()
		return request("GET", "/notifications/unread-count", nil, token, 200)["data"].(map[string]any)["unread"].(float64)
	}
	inbox := request("GET", "/notifications", nil, inDistrictToken, 200)["data"].([]any)
	if len(inbox) != 1 || unread(inDistrictToken) != 1 {
		t.Fatalf("in-district inbox: %v", inbox)
	}
	item := inbox[0].(map[string]any)
	if item["title"] != "Hi there" || item["resource_id"] != resource.ID || item["actor_id"] != actor ||
		item["read_at"] != nil || item["data"].(map[string]any)["who"] != "there" {
		t.Fatalf("inbox item: %v", item)
	}
	id := item["id"].(string)
	listedInbox := request("GET", "/notifications", nil, listedToken, 200)["data"].([]any)
	if len(listedInbox) != 2 || listedInbox[0].(map[string]any)["title"] != "Hi listed" {
		t.Fatalf("listed inbox should hold both sends, newest first: %v", listedInbox)
	}
	listedOnly := listedInbox[0].(map[string]any)["id"].(string)

	request("POST", "/notifications/"+id+"/read", nil, inDistrictToken, 200)
	request("POST", "/notifications/"+id+"/read", nil, inDistrictToken, 200) // Already read: no change.
	request("POST", "/notifications/"+listedOnly+"/read", nil, inDistrictToken, 404)
	request("POST", "/notifications/"+uuid.NewString()+"/read", nil, inDistrictToken, 404)
	request("POST", "/notifications/not-a-uuid/read", nil, inDistrictToken, 400)
	if unread(inDistrictToken) != 0 || unread(listedToken) != 2 {
		t.Fatal("marking one recipient's copy read affected another")
	}
	if len(request("GET", "/notifications?unread=true", nil, inDistrictToken, 200)["data"].([]any)) != 0 {
		t.Fatal("unread filter returned a read notification")
	}
	marked := request("POST", "/notifications/read-all", nil, listedToken, 200)["data"].(map[string]any)["marked"]
	if marked != 2.0 || unread(listedToken) != 0 {
		t.Fatalf("read-all marked %v", marked)
	}
	request("GET", "/notifications?unread=maybe", nil, listedToken, 400)
	request("GET", "/notifications?limit=101", nil, listedToken, 400)
	request("GET", "/notifications", nil, "", 401)
}
