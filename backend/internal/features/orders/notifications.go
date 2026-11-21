package orders

import (
	"context"

	"clims-backend/internal/features/notifications"

	"github.com/jackc/pgx/v5"
)

// NotificationTypes are the order workflow notifications; register them once at startup.
// Templates receive hotspot, product, unit, quantity, from_store and to_store.
func NotificationTypes() []notifications.Type {
	inApp := []string{notifications.ChannelInApp}
	return []notifications.Type{
		{Name: "order.stockout_reported", Channels: inApp,
			Title: "Stockout at {{.hotspot}}",
			Body:  "{{.hotspot}} reported a stockout of {{.product}}. Send stock or request it from the warehouse."},
		{Name: "order.replenishment_requested", Channels: inApp,
			Title: "Stock request from {{.to_store}}",
			Body:  "{{.to_store}} requested {{.quantity}} {{.unit}} of {{.product}}."},
		{Name: "order.shipment_dispatched", Channels: inApp,
			Title: "Stock on the way from {{.from_store}}",
			Body:  "{{.from_store}} dispatched {{.quantity}} {{.unit}} of {{.product}}. Record the receipt when it arrives."},
		{Name: "order.shipment_received", Channels: inApp,
			Title: "Stock received at {{.to_store}}",
			Body:  "{{.quantity}} {{.unit}} of {{.product}} arrived at {{.to_store}}. Held stockouts can now be sent."},
		{Name: "order.delivery_assigned", Channels: inApp,
			Title: "Delivery to {{.hotspot}}",
			Body:  "Deliver {{.quantity}} {{.unit}} of {{.product}} from {{.from_store}} to {{.hotspot}}."},
		{Name: "order.delivered", Channels: inApp,
			Title: "Stock delivered to {{.hotspot}}",
			Body:  "{{.quantity}} {{.unit}} of {{.product}} were delivered to {{.hotspot}}."},
	}
}

// notification picks the type for a workflow step and the permission that acts on
// it at the notified store. The second result is false for steps that notify nobody.
func notification(action string, toStore bool) (string, string, bool) {
	switch {
	case action == "stockout_reported":
		return "order.stockout_reported", "orders:process", true
	case action == "replenishment_requested":
		return "order.replenishment_requested", "orders:process", true
	case action == "dispatch" && toStore:
		return "order.shipment_dispatched", "orders:receive", true
	case action == "dispatch":
		return "order.delivery_assigned", "", true
	case action == "receive":
		return "order.shipment_received", "orders:process", true
	case action == "deliver":
		return "order.delivered", "", true
	}
	return "", "", false
}

// productLabel names a product the same way as the inventory reports: brand,
// distribution channel and category, e.g. "Engabu Free Male".
const productLabel = `concat_ws(' ', (SELECT pb.name FROM brands pb WHERE pb.id = c.brand_id),
	CASE c.type WHEN 'free' THEN 'Free' WHEN 'socially_marketed' THEN 'Socially marketed'
		WHEN 'commercial' THEN 'Commercial' END,
	CASE c.category WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' END)`

// record writes a workflow step to order_events, the order's history, and notifies
// the people concerned. A store is notified through the people holding the permission
// that acts on the step there, rather than everyone assigned to it.
func (r *Repository) record(ctx context.Context, tx pgx.Tx, order Order, actorID, action string, notifyStore, notifyUser *string) error {
	// The notify columns keep the deprecated /orders/notifications inbox working until
	// clients use the central one.
	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO order_events (order_id, actor_id, action, status, notify_store_id, notify_user_id)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		order.ID, actorID, action, order.Status, notifyStore, notifyUser).Scan(&eventID); err != nil {
		return err
	}
	typeName, permission, notifies := notification(action, notifyStore != nil)
	if !notifies || (notifyStore == nil && notifyUser == nil) {
		return nil
	}
	var target notifications.Target
	if notifyStore != nil {
		target = notifications.Target{Permission: permission, StoreID: *notifyStore}
	} else {
		target = notifications.Target{UserIDs: []string{*notifyUser}}
	}

	// A replenishment request names its alert's hotspot through the parent order.
	var hotspot, product, fromStore, toStore string
	var unit *string
	if err := tx.QueryRow(ctx, `SELECT coalesce(h.name, ph.name, 'a hotspot'),
			`+productLabel+`,
			um.name, fs.name, ts.name
		FROM orders o
		JOIN condoms c ON c.id = o.condom_id
		JOIN stores fs ON fs.id = o.ordered_from_store_id
		JOIN stores ts ON ts.id = o.ordered_for_store_id
		LEFT JOIN unit_of_measures um ON um.id = o.unit_of_measure_id
		LEFT JOIN hot_spots h ON h.id = o.hot_spot_id
		LEFT JOIN orders p ON p.id = o.parent_order_id
		LEFT JOIN hot_spots ph ON ph.id = p.hot_spot_id
		WHERE o.id = $1`, order.ID).Scan(&hotspot, &product, &unit, &fromStore, &toStore); err != nil {
		return err
	}
	if product == "" {
		product = "condoms"
	}
	data := map[string]any{"hotspot": hotspot, "product": product, "from_store": fromStore, "to_store": toStore,
		"unit": "units", "quantity": quantityFor(order, action)}
	if unit != nil {
		data["unit"] = *unit
	}
	return r.notifier.Notify(ctx, tx, notifications.Message{
		Type:           typeName,
		Targets:        []notifications.Target{target},
		ActorID:        &actorID,
		Resource:       &notifications.Resource{Type: "order", ID: order.ID},
		Data:           data,
		IdempotencyKey: eventID,
	})
}

// quantityFor is the quantity a step is about: requested, issued or counted on arrival.
func quantityFor(order Order, action string) int32 {
	value := order.QuantityNeeded
	switch action {
	case "dispatch", "deliver":
		value = order.QuantityIssued
	case "receive":
		value = order.QuantityReceived
	}
	if value == nil {
		return 0
	}
	return *value
}
