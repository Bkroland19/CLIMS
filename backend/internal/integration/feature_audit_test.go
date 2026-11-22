package integration

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testFeatureAudit checks the audit entries left by the hotspot, order, inventory and catalogue
// tests that ran before it: every step is recorded by its actor, with what changed, and can be
// found under the records it concerns.
func testFeatureAudit(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	check := func(name, query string, args ...any) {
		t.Helper()
		var ok bool
		if err := pool.QueryRow(ctx, query, args...).Scan(&ok); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !ok {
			t.Errorf("audit: %s", name)
		}
	}

	for _, action := range []string{
		"hotspot.submitted", "hotspot.updated", "hotspot.resubmitted", "hotspot.commented",
		"hotspot.activated", "hotspot.rejected", "hotspot.deactivated",
		"order.created", "order.fulfilled", "order.requested", "order.reviewed", "order.stock_checked", "order.rejected",
		"order.dispatched", "order.received", "stockout.reported", "inventory.movement_recorded",
		"product.created", "product.updated", "product.deleted",
		"brand.created", "brand.updated", "brand.deleted", "product_type.created", "product_type.deleted",
		"unit_of_measure.created",
	} {
		check(action+" is recorded by a signed-in actor", `SELECT count(*) > 0 AND bool_and(actor_id IS NOT NULL
			AND outcome = 'success' AND target_id IS NOT NULL) FROM audit_log WHERE action = $1`, action)
	}

	// Hotspots: a submission lists every field as new; a decision records the state change,
	// the DCFP's reason and the district.
	check("a submission records the details as new", `SELECT bool_and(changes->'name'->'before' = 'null'
		AND changes->'review_status'->>'after' = 'submitted') FROM audit_log WHERE action = 'hotspot.submitted'`)
	check("an activation records the change, reason and district", `SELECT bool_and(
		changes->'review_status'->>'after' = 'active' AND changes->'status'->>'after' = 'active'
		AND length(details->>'comment') > 0
		AND EXISTS (SELECT 1 FROM audit_log_subjects s WHERE s.audit_id = a.id AND s.subject_type = 'district'))
		FROM audit_log a WHERE action = 'hotspot.activated'`)
	check("a comment changes nothing but keeps its text", `SELECT bool_and(changes IS NULL AND details ? 'comment')
		FROM audit_log WHERE action = 'hotspot.commented'`)

	// Orders: each step records its status change and both stores and the product. A warehouse
	// request names only a category; it has a product from the warehouse's review onwards.
	check("a dispatch records the status change", `SELECT bool_and(changes->'order_status'->>'before' = 'confirmed'
		AND changes->'order_status'->>'after' = 'dispatched' AND changes ? 'quantity_issued')
		FROM audit_log WHERE action = 'order.dispatched'`)
	// A request names a category, not a product, until the warehouse chooses one at review, so a
	// request rejected before review names no product either.
	check("order entries name the stores and product", `SELECT bool_and((SELECT count(*) FILTER (WHERE s.subject_type = 'store') >= 1
		AND CASE a.action WHEN 'order.rejected' THEN count(*) FILTER (WHERE s.subject_type = 'product') <= 1
			ELSE count(*) FILTER (WHERE s.subject_type = 'product') = 1 END
		FROM audit_log_subjects s WHERE s.audit_id = a.id))
		FROM audit_log a WHERE action LIKE 'order.%' AND action <> 'order.requested'`)
	check("a warehouse request records the category and names no product", `SELECT bool_and(
		changes->'condom_category'->>'after' IN ('male', 'female')
		AND (SELECT count(*) FILTER (WHERE s.subject_type = 'store') = 2
			AND count(*) FILTER (WHERE s.subject_type = 'product') = 0 FROM audit_log_subjects s WHERE s.audit_id = a.id))
		FROM audit_log a WHERE action = 'order.requested'`)
	check("a rejection records its reason", `SELECT bool_and(changes->'order_status'->>'after' = 'rejected'
		AND length(changes->'rejection_reason'->>'after') > 0) FROM audit_log WHERE action = 'order.rejected'`)
	check("a fulfilment is recorded once per order, refused retries are not", `SELECT bool_and(n = 1) FROM (
		SELECT count(*) AS n FROM audit_log WHERE action = 'order.fulfilled' GROUP BY target_id) per_order`)
	check("a stockout report is found under its hotspot", `SELECT bool_and(EXISTS (SELECT 1 FROM audit_log_subjects s
		WHERE s.audit_id = a.id AND s.subject_type = 'hotspot')) FROM audit_log a WHERE action = 'stockout.reported'`)

	// Inventory and catalogue.
	check("a movement records the quantity and its store", `SELECT bool_and(details ? 'quantity' AND details ? 'reason'
		AND EXISTS (SELECT 1 FROM audit_log_subjects s WHERE s.audit_id = a.id AND s.subject_type = 'store'))
		FROM audit_log a WHERE action = 'inventory.movement_recorded'`)
	check("a deletion keeps what was deleted", `SELECT bool_and(changes->'name'->'after' = 'null'
		AND changes->'name'->>'before' IS NOT NULL) FROM audit_log WHERE action = 'brand.deleted'`)
	check("catalogue updates record only real changes", `SELECT bool_and(changes IS NOT NULL AND NOT changes ? 'updated_at')
		FROM audit_log WHERE action IN ('product.updated', 'brand.updated', 'product_type.updated', 'unit_of_measure.updated')`)
}
