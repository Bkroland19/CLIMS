package orders

import (
	"slices"
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
	warehouse := func(permission string) recipient { return recipient{permission: permission, warehouse: true} }
	district := func(permission string) recipient { return recipient{permission: permission} }
	cases := []struct {
		action     string
		typeName   string
		recipients []recipient
	}{
		{"replenishment_requested", "order.replenishment_requested", []recipient{warehouse("orders:process")}},
		{"review", "order.replenishment_approved", []recipient{district("orders:replenish")}},
		{"reject", "order.replenishment_rejected", []recipient{district("orders:replenish")}},
		{"dispatch", "order.shipment_dispatched", []recipient{district("orders:receive")}},
		// The warehouse hears of the receipt too.
		{"receive", "order.shipment_received", []recipient{district("orders:replenish"), warehouse("orders:process")}},
	}
	for _, tc := range cases {
		typeName, recipients := notification(tc.action)
		if typeName != tc.typeName || !slices.Equal(recipients, tc.recipients) || !registered[typeName] {
			t.Errorf("%s: got %q %v", tc.action, typeName, recipients)
		}
	}
	// The stock check notifies nobody, and the hotspot delivery steps went with the alert orders.
	for _, action := range []string{"check-stock", "request-replenishment", "deliver"} {
		if typeName, recipients := notification(action); typeName != "" || recipients != nil {
			t.Errorf("%s should notify nobody", action)
		}
	}
	if !registered["order.stockout_reported"] {
		t.Error("stockout reports have no registered type")
	}
}

// TestWarehouseStepText renders each warehouse step's notification from the data record sends.
func TestWarehouseStepText(t *testing.T) {
	bodies := map[string]string{}
	for _, typ := range NotificationTypes() {
		bodies[typ.Name] = typ.Body
	}
	count := func(value int32) *int32 { return &value }
	text := func(value string) *string { return &value }
	order := Order{QuantityNeeded: count(500)}
	data := func(order Order, action string) map[string]any {
		return map[string]any{"product": "Engabu Free Male", "unit": "cartons", "from_store": "National Medical Stores",
			"to_store": "Wakiso District Store", "quantity": quantityFor(order, action),
			"quantity_ordered": value(order.QuantityNeeded), "quantity_dispatched": value(order.QuantityIssued),
			"note": noteFor(order, action), "transport": transportOf(order), "unrequested": order.Unrequested}
	}
	full, partial, rejected, sent, counted, exact, pushed := order, order, order, order, order, order, order
	full.QuantityApproved = count(500)
	partial.QuantityApproved = count(300)
	rejected.RejectionReason = text("Out of stock until March")
	sent.QuantityIssued = count(280)
	sent.WaybillNumber, sent.VehicleRegistration = text("WB-104"), text("UAX 123B")
	sent.DriverName, sent.DriverPhone = text("John Okello"), text("0772 000000")
	counted.QuantityIssued, counted.QuantityReceived, counted.DiscrepancyNote = count(280), count(270), text("Ten missing")
	exact.QuantityIssued, exact.QuantityReceived = count(280), count(280)
	pushed.QuantityIssued, pushed.Unrequested, pushed.Comment = count(200), true, text("Quarterly allocation")
	for _, tc := range []struct {
		typeName, action string
		order            Order
		want             string
	}{
		{"order.replenishment_approved", "review", full,
			"National Medical Stores approved the order for 500 cartons ordered by Wakiso District Store, and will send Engabu Free Male."},
		{"order.replenishment_approved", "review", partial,
			"National Medical Stores approved 300 of the 500 cartons ordered by Wakiso District Store, and will send Engabu Free Male."},
		{"order.replenishment_rejected", "reject", rejected,
			`National Medical Stores rejected the order for 500 cartons of Engabu Free Male from Wakiso District Store. Reason: "Out of stock until March"`},
		{"order.shipment_dispatched", "dispatch", sent,
			"National Medical Stores dispatched 280 cartons of Engabu Free Male. Waybill WB-104, vehicle UAX 123B, driver John Okello (0772 000000). Record the receipt when it arrives."},
		{"order.shipment_dispatched", "dispatch", exact,
			"National Medical Stores dispatched 280 cartons of Engabu Free Male. Record the receipt when it arrives."},
		// Stock sent without an order says so and carries the warehouse's note; an order's comment is the DCFP's own.
		{"order.shipment_dispatched", "dispatch", pushed,
			`National Medical Stores dispatched 200 cartons of Engabu Free Male to Wakiso District Store without an order. Note: "Quarterly allocation". Record the receipt when it arrives.`},
		{"order.shipment_received", "receive", counted,
			`270 cartons of Engabu Free Male from National Medical Stores arrived at Wakiso District Store. 280 were dispatched. Note: "Ten missing"`},
		{"order.shipment_received", "receive", exact,
			"280 cartons of Engabu Free Male from National Medical Stores arrived at Wakiso District Store."},
	} {
		if got := render(t, bodies[tc.typeName], data(tc.order, tc.action)); got != tc.want {
			t.Errorf("%s:\n got %s\nwant %s", tc.typeName, got, tc.want)
		}
	}
	if got := transportOf(Order{DriverPhone: text("0772 000000")}); got != "Driver (0772 000000)" {
		t.Errorf("transport with only a phone: %q", got)
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
