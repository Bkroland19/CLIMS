package orders

import (
	"strings"
	"testing"
	"text/template"
	"time"

	"clims-backend/internal/features/notifications"
)

func registeredTypes(t *testing.T) map[string]bool {
	t.Helper()
	service := notifications.NewService()
	registered := map[string]bool{}
	for _, typ := range NotificationTypes() {
		if err := service.Register(typ); err != nil {
			t.Fatal(err)
		}
		registered[typ.Name] = true
	}
	return registered
}

func TestNotifyingStepsHaveRegisteredTypes(t *testing.T) {
	registered := registeredTypes(t)
	cases := []struct {
		action     string
		typeName   string
		permission string
	}{
		{"replenishment_requested", "order.replenishment_requested", "orders:process"},
		{"dispatch", "order.shipment_dispatched", "orders:receive"},
		{"receive", "order.shipment_received", "orders:replenish"},
	}
	for _, tc := range cases {
		typeName, permission, notifies := notification(tc.action)
		if !notifies || typeName != tc.typeName || permission != tc.permission || !registered[typeName] {
			t.Errorf("%s: got %q %q %v", tc.action, typeName, permission, notifies)
		}
	}
	// The hotspot delivery steps went with the alert orders; their actions no longer exist.
	for _, action := range []string{"review", "check-stock", "request-replenishment", "deliver"} {
		if _, _, notifies := notification(action); notifies {
			t.Errorf("%s should notify nobody", action)
		}
	}
	if !registered["order.stockout_reported"] {
		t.Error("stockout reports have no registered type")
	}
}

func TestStockoutData(t *testing.T) {
	text := func(value string) *string { return &value }
	full := StockoutReport{
		ID: "r1", HotSpotID: "h1", CondomID: text("c1"), Product: "Engabu Free Female", ReportedBy: "Grace Nakato",
		Comment: text("  Dispenser empty since Monday "), CreatedAt: time.Now(),
		HotSpot: StockoutHotSpot{Name: "Kisenyi Landing", Village: text("Kisenyi"), Subcounty: text("Central"),
			District: text("Kampala"), ContactName: text("Peter"), ContactPhone: text("0700000000")},
	}
	bare := StockoutReport{ID: "r2", HotSpotID: "h2", CondomID: text("c1"), Product: "condoms", ReportedBy: "a VHT",
		HotSpot: StockoutHotSpot{Name: "Bar 7", ContactPhone: text("0711111111")}}
	cases := []struct {
		name   string
		report StockoutReport
		want   map[string]string
	}{
		{"every detail", full, map[string]string{"place": "Kisenyi, Central, Kampala",
			"contact": "Peter (0700000000)", "message": "Dispenser empty since Monday", "hotspot_id": "h1"}},
		// Missing details are empty strings, never absent keys, so templates still render.
		{"phone only, no message", bare, map[string]string{"place": "", "contact": "0711111111", "message": "",
			"village": "", "district": "", "contact_name": ""}},
	}
	for _, tc := range cases {
		data := stockoutData(tc.report)
		for key, want := range tc.want {
			if data[key] != want {
				t.Errorf("%s: %s = %q, want %q", tc.name, key, data[key], want)
			}
		}
	}

	// The DCFP's notification carries the hotspot's details and the message.
	typ := NotificationTypes()[0]
	if typ.Name != "order.stockout_reported" {
		t.Fatalf("first type is %s", typ.Name)
	}
	for _, tc := range []struct {
		report StockoutReport
		want   string
	}{
		{full, `Kisenyi Landing, Kisenyi, Central, Kampala, is out of Engabu Free Female. Message: "Dispenser empty since Monday" Reported by Grace Nakato. Contact: Peter (0700000000).`},
		{bare, `Bar 7 is out of condoms. Reported by a VHT. Contact: 0711111111.`},
	} {
		body := render(t, typ.Body, stockoutData(tc.report))
		if body != tc.want {
			t.Errorf("body:\n got %s\nwant %s", body, tc.want)
		}
	}
	if title := render(t, typ.Title, stockoutData(full)); !strings.Contains(title, "Kisenyi Landing") {
		t.Errorf("title %q lacks the hotspot", title)
	}
}

// render fills a template the way the notification service does, refusing missing keys.
func render(t *testing.T, text string, data map[string]any) string {
	t.Helper()
	var out strings.Builder
	if err := template.Must(template.New("").Option("missingkey=error").Parse(text)).Execute(&out, data); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func TestSelections(t *testing.T) {
	for _, tc := range []struct{ open, reported, want string }{
		{"male", "male", "male"}, {"male", "female", "both"}, {"female", "male", "both"},
		{"both", "male", "both"}, {"female", "both", "both"},
	} {
		if got := combineSelections(tc.open, tc.reported); got != tc.want {
			t.Errorf("%s then %s = %s, want %s", tc.open, tc.reported, got, tc.want)
		}
	}
	if !selected("both", "female") || !selected("male", "male") || selected("male", "female") {
		t.Error("selected does not match the selection rules")
	}
	for _, s := range []string{"male", "female", "both"} {
		if !ValidSelection(s) {
			t.Errorf("%s should be valid", s)
		}
	}
	if ValidSelection("Male") || ValidSelection("") {
		t.Error("selections are lower case and required")
	}
}

func TestDeliveryNotifications(t *testing.T) {
	pieces := func(n int32) *int32 { return &n }
	lines := []DeliveryLine{{Category: "male", Pieces: 300, AcknowledgedPieces: pieces(290)},
		{Category: "female", Pieces: 100}}
	if got := piecesSummary(lines, false); got != "300 male and 100 female pieces" {
		t.Errorf("delivered summary %q", got)
	}
	if got := piecesSummary(lines, true); got != "290 male pieces" {
		t.Errorf("acknowledged summary %q", got)
	}
	types := map[string]string{}
	for _, typ := range NotificationTypes() {
		types[typ.Name] = typ.Body
	}
	if body := render(t, types["order.hotspot_delivery"], map[string]any{"report_id": "r", "hotspot": "Bar 7",
		"pieces": "300 male pieces"}); !strings.Contains(body, "300 male pieces") {
		t.Errorf("delivery body %q", body)
	}
	for fulfilled, want := range map[bool]string{true: "is fulfilled", false: "stays open"} {
		body := render(t, types["order.delivery_acknowledged"], map[string]any{"report_id": "r", "hotspot": "Bar 7",
			"pieces": "290 male pieces", "fulfilled": fulfilled})
		if !strings.Contains(body, want) {
			t.Errorf("acknowledged body %q lacks %q", body, want)
		}
	}
}
