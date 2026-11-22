package inventory

import (
	"strings"
	"testing"
	"text/template"
	"time"

	"clims-backend/internal/features/notifications"
)

func TestExpiryMessage(t *testing.T) {
	service := notifications.NewService()
	for _, typ := range NotificationTypes() {
		if err := service.Register(typ); err != nil {
			t.Fatal(err)
		}
	}
	bodies := map[string]string{}
	for _, typ := range NotificationTypes() {
		bodies[typ.Name] = typ.Body
	}
	number := "TGL24155"
	batch := expiringBatch{id: "b1", storeID: "s1", store: "National Medical Stores", product: "Engabu Free Male",
		unit: "cartons", number: &number, expiry: time.Date(2027, 3, 31, 0, 0, 0, 0, time.UTC), onHand: 120}
	expired := batch
	expired.expired, expired.product, expired.number = true, "", nil

	for _, tc := range []struct {
		batch    expiringBatch
		typeName string
		body     string
	}{
		{batch, BatchExpiring, "National Medical Stores holds 120 cartons of Engabu Free Male in batch TGL24155, which expires on 31 Mar 2027. Dispatch it before newer batches."},
		{expired, BatchExpired, "National Medical Stores holds 120 cartons of condoms in a batch with no number, which expired on 31 Mar 2027. It can no longer be dispatched; record an adjustment once it is disposed of."},
	} {
		msg := expiryMessage(tc.batch)
		if msg.Type != tc.typeName || msg.IdempotencyKey != "b1" || msg.Resource.Type != "stock_batch" ||
			len(msg.Targets) != 1 || msg.Targets[0].Permission != "inventory:manage" || msg.Targets[0].StoreID != "s1" {
			t.Errorf("message for %s: %+v", tc.typeName, msg)
		}
		var out strings.Builder
		if err := template.Must(template.New("").Option("missingkey=error").Parse(bodies[tc.typeName])).Execute(&out, msg.Data); err != nil {
			t.Fatal(err)
		}
		if out.String() != tc.body {
			t.Errorf("%s body:\n got %s\nwant %s", tc.typeName, out.String(), tc.body)
		}
	}
}
