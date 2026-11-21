package orders

import (
	"testing"

	"clims-backend/internal/features/notifications"
)

func TestNotifyingStepsHaveRegisteredTypes(t *testing.T) {
	service := notifications.NewService()
	registered := map[string]bool{}
	for _, typ := range NotificationTypes() {
		if err := service.Register(typ); err != nil {
			t.Fatal(err)
		}
		registered[typ.Name] = true
	}
	cases := []struct {
		action     string
		toStore    bool
		typeName   string
		permission string
	}{
		{"stockout_reported", true, "order.stockout_reported", "orders:process"},
		{"replenishment_requested", true, "order.replenishment_requested", "orders:process"},
		{"dispatch", true, "order.shipment_dispatched", "orders:receive"},
		{"dispatch", false, "order.delivery_assigned", ""},
		{"receive", true, "order.shipment_received", "orders:process"},
		{"deliver", false, "order.delivered", ""},
	}
	for _, tc := range cases {
		typeName, permission, notifies := notification(tc.action, tc.toStore)
		if !notifies || typeName != tc.typeName || permission != tc.permission || !registered[typeName] {
			t.Errorf("%s: got %q %q %v", tc.action, typeName, permission, notifies)
		}
	}
	for _, action := range []string{"review", "check-stock", "request-replenishment"} {
		if _, _, notifies := notification(action, false); notifies {
			t.Errorf("%s notifies nobody today and should stay silent", action)
		}
	}
}
