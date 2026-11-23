package hotspots

import (
	"testing"

	"clims-backend/internal/features/notifications"
)

func TestEveryEventHasANotificationType(t *testing.T) {
	service := notifications.NewService()
	registered := map[string]bool{}
	for _, typ := range NotificationTypes() {
		if err := service.Register(typ); err != nil {
			t.Fatal(err)
		}
		registered[typ.Name] = true
	}
	for _, event := range []string{EventSubmitted, EventUpdated, EventResubmitted, EventCommented,
		EventActivated, EventDeactivated, EventRejected} {
		if !registered["hotspot."+event] {
			t.Errorf("event %s has no notification type", event)
		}
	}
}
