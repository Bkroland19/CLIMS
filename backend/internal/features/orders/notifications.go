package orders

import (
	"context"
	"strings"

	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// NotificationTypes are the order notifications; register them once at startup. A stockout report's
// template receives the keys of stockoutData; the warehouse steps receive product, unit, quantity,
// quantity_ordered, quantity_dispatched, note, transport, from_store and to_store.
func NotificationTypes() []notifications.Type {
	inApp := []string{notifications.ChannelInApp}
	return []notifications.Type{
		{Name: "order.stockout_reported", Channels: inApp,
			Title: "Stockout at {{.hotspot}}",
			Body: "{{.hotspot}}{{with .place}}, {{.}},{{end}} is out of {{.product}}." +
				"{{with .message}} Message: \"{{.}}\"{{end}} Reported by {{.reporter}}.{{with .contact}} Contact: {{.}}.{{end}}"},
		{Name: "order.hotspot_delivery", Channels: inApp,
			Title: "Stock on the way to {{.hotspot}}",
			Body:  "The district sent {{.pieces}} for your stockout notification. Acknowledge the pieces you receive."},
		{Name: "order.delivery_acknowledged", Channels: inApp,
			Title: "{{.hotspot}} acknowledged its delivery",
			Body: "{{.hotspot}} has acknowledged {{.pieces}} received." +
				"{{if .fulfilled}} The notification is fulfilled.{{else}} The notification stays open until every selected type is received.{{end}}"},
		{Name: "order.replenishment_requested", Channels: inApp,
			Title: "Stock order from {{.to_store}}",
			Body:  "{{.to_store}} ordered {{.quantity}} {{.unit}} of {{.product}}."},
		// Review approves the request, all or part, for the product the warehouse chose.
		{Name: "order.replenishment_approved", Channels: inApp,
			Title: "Order approved by {{.from_store}}",
			Body: "{{.from_store}} approved {{if eq .quantity .quantity_ordered}}the order for {{.quantity}} {{.unit}}" +
				"{{else}}{{.quantity}} of the {{.quantity_ordered}} {{.unit}}{{end}} ordered by {{.to_store}}, " +
				"and will send {{.product}}."},
		{Name: "order.replenishment_rejected", Channels: inApp,
			Title: "Order rejected by {{.from_store}}",
			Body: "{{.from_store}} rejected the order for {{.quantity_ordered}} {{.unit}} of {{.product}} " +
				"from {{.to_store}}. Reason: \"{{.note}}\""},
		{Name: "order.shipment_dispatched", Channels: inApp,
			Title: "Stock on the way from {{.from_store}}",
			Body: "{{.from_store}} dispatched {{.quantity}} {{.unit}} of {{.product}}.{{with .transport}} {{.}}.{{end}}" +
				" Record the receipt when it arrives."},
		// The DCFPs who ordered and the warehouse that dispatched both receive this one.
		{Name: "order.shipment_received", Channels: inApp,
			Title: "Stock received at {{.to_store}}",
			Body: "{{.quantity}} {{.unit}} of {{.product}} from {{.from_store}} arrived at {{.to_store}}." +
				"{{with .note}} {{$.quantity_dispatched}} were dispatched. Note: \"{{.}}\"{{end}}"},
	}
}

// recipient is who hears of a workflow step: the holders of a permission at the supplying warehouse
// or at the ordering district store.
type recipient struct {
	permission string
	warehouse  bool
}

// notification picks the type for a warehouse request step and who receives it. Steps without a
// type notify nobody.
func notification(action string) (string, []recipient) {
	district := func(permission string) recipient { return recipient{permission: permission} }
	switch action {
	case "replenishment_requested":
		return "order.replenishment_requested", []recipient{{permission: "orders:process", warehouse: true}}
	case "review":
		return "order.replenishment_approved", []recipient{district("orders:replenish")}
	case "reject":
		return "order.replenishment_rejected", []recipient{district("orders:replenish")}
	case "dispatch":
		return "order.shipment_dispatched", []recipient{district("orders:receive")}
	case "receive":
		// The DCFPs who order from the warehouse learn their stock is in, and the warehouse learns what
		// arrived, with any discrepancy.
		return "order.shipment_received", []recipient{district("orders:replenish"),
			{permission: "orders:process", warehouse: true}}
	}
	return "", nil
}

// productLabel names a product the same way as the inventory reports: brand,
// distribution channel and category, e.g. "Engabu Free Male".
const productLabel = `concat_ws(' ', (SELECT pb.name FROM brands pb WHERE pb.id = c.brand_id),
	(SELECT pt.name FROM product_types pt WHERE pt.id = c.type_id),
	CASE c.category WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' END)`

// record writes a workflow step to order_events, the order's history, and notifies the people
// holding the permission that acts on the step at the notified store, rather than everyone assigned to it.
func (r *Repository) record(ctx context.Context, tx pgx.Tx, before *Order, order Order, actorID, action string) error {
	if err := r.recordAudit(ctx, tx, auditActions[action], before, order); err != nil {
		return err
	}
	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO order_events (order_id, actor_id, action, status, quantity)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		order.ID, actorID, action, order.Status, quantityFor(order, action)).Scan(&eventID); err != nil {
		return err
	}
	typeName, recipients := notification(action)
	if typeName == "" {
		return nil
	}
	var product, fromStore, toStore string
	var unit *string
	if err := tx.QueryRow(ctx, `SELECT coalesce(nullif(`+productLabel+`, ''), o.condom_category || ' condoms', ''),
			um.name, fs.name, ts.name
		FROM orders o
		LEFT JOIN condoms c ON c.id = o.condom_id
		JOIN stores fs ON fs.id = o.ordered_from_store_id
		JOIN stores ts ON ts.id = o.ordered_for_store_id
		LEFT JOIN unit_of_measures um ON um.id = o.unit_of_measure_id
		WHERE o.id = $1`, order.ID).Scan(&product, &unit, &fromStore, &toStore); err != nil {
		return err
	}
	if product == "" {
		product = "condoms"
	}
	data := map[string]any{"product": product, "from_store": fromStore, "to_store": toStore,
		"unit": "units", "quantity": quantityFor(order, action), "quantity_ordered": value(order.QuantityNeeded),
		"quantity_dispatched": value(order.QuantityIssued), "note": noteFor(order, action),
		"transport": transportOf(order)}
	if unit != nil {
		data["unit"] = *unit
	}
	targets := make([]notifications.Target, 0, len(recipients))
	for _, to := range recipients {
		store := order.OrderedForStoreID
		if to.warehouse {
			store = order.OrderedFromStoreID
		}
		targets = append(targets, notifications.Target{Permission: to.permission, StoreID: store})
	}
	return r.notifier.Notify(ctx, tx, notifications.Message{
		Type:           typeName,
		Targets:        targets,
		ActorID:        &actorID,
		Resource:       &notifications.Resource{Type: "order", ID: order.ID},
		Data:           data,
		IdempotencyKey: eventID,
	})
}

// noteFor is the person's words on a step: the rejection reason or the discrepancy note, or "" when
// the step has none.
func noteFor(order Order, action string) string {
	var note *string
	switch action {
	case "reject":
		note = order.RejectionReason
	case "receive":
		note = order.DiscrepancyNote
	}
	if note == nil {
		return ""
	}
	return *note
}

// transportOf describes the dispatch's transport, e.g. "Waybill WB-104, vehicle UAX 123B, driver John
// Okello (0772 000000)", leaving out what the warehouse did not record; "" when it recorded none.
func transportOf(order Order) string {
	var parts []string
	if order.WaybillNumber != nil {
		parts = append(parts, "waybill "+*order.WaybillNumber)
	}
	if order.VehicleRegistration != nil {
		parts = append(parts, "vehicle "+*order.VehicleRegistration)
	}
	driver := ""
	if order.DriverName != nil {
		driver = *order.DriverName
	}
	if order.DriverPhone != nil {
		driver = strings.TrimSpace(driver + " (" + *order.DriverPhone + ")")
	}
	if driver != "" {
		parts = append(parts, "driver "+driver)
	}
	if len(parts) == 0 {
		return ""
	}
	text := strings.Join(parts, ", ")
	return strings.ToUpper(text[:1]) + text[1:]
}

func value(quantity *int32) int32 {
	if quantity == nil {
		return 0
	}
	return *quantity
}

// quantityFor is the quantity a step is about: ordered, approved, issued or counted on arrival.
func quantityFor(order Order, action string) int32 {
	value := order.QuantityNeeded
	switch action {
	case "review":
		value = order.QuantityApproved
	case "dispatch":
		value = order.QuantityIssued
	case "receive":
		value = order.QuantityReceived
	}
	if value == nil {
		return 0
	}
	return *value
}
