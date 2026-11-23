package inventory

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"clims-backend/internal/features/notifications"
	"clims-backend/internal/features/stock"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Notification types the expiry check sends; each batch is announced once per type.
const (
	BatchExpiring = "inventory.batch_expiring"
	BatchExpired  = "inventory.batch_expired"
)

// NotificationTypes are the inventory notifications; register them once at startup. Both receive
// store, store_id, product, unit, quantity, batch (the number, or ""), batch_label ("batch TGL24155"
// or "a batch with no number"), expiry ("31 Mar 2027") and expiry_date.
func NotificationTypes() []notifications.Type {
	inApp := []string{notifications.ChannelInApp}
	return []notifications.Type{
		{Name: BatchExpiring, Channels: inApp,
			Title: "Stock at {{.store}} expires on {{.expiry}}",
			Body: "{{.store}} holds {{.quantity}} {{.unit}} of {{.product}} in {{.batch_label}}, which expires on " +
				"{{.expiry}}. Dispatch it before newer batches."},
		{Name: BatchExpired, Channels: inApp,
			Title: "Stock at {{.store}} has expired",
			Body: "{{.store}} holds {{.quantity}} {{.unit}} of {{.product}} in {{.batch_label}}, which expired on " +
				"{{.expiry}}. It can no longer be dispatched; record an adjustment once it is disposed of."},
	}
}

// ExpiryAlerts tells the people who manage a store's stock (inventory:manage at the store) when a
// batch it holds comes within stock.ExpiringMonths of its expiry date, and again when it expires.
// Warehouses and district stores alike. A batch with nothing left, or with no expiry date, is not
// announced.
type ExpiryAlerts struct {
	db       *pgxpool.Pool
	notifier notifications.Notifier
	now      func() time.Time
}

// NewExpiryAlerts needs a notifier with NotificationTypes registered.
func NewExpiryAlerts(db *pgxpool.Pool, notifier notifications.Notifier) *ExpiryAlerts {
	return &ExpiryAlerts{db: db, notifier: notifier, now: time.Now}
}

// Watch checks now and then at every interval until ctx ends. A failed check is logged and tried
// again at the next interval; a batch is announced at most once per state whatever the interval.
func (a *ExpiryAlerts) Watch(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if sent, err := a.Check(ctx); err != nil {
			slog.Error("batch expiry check failed", "error", err)
		} else if sent > 0 {
			slog.Info("batch expiry check", "announced", sent)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

type expiringBatch struct {
	id, storeID, store, product, unit string
	number                            *string
	expiry                            time.Time
	onHand                            int64
	expired                           bool
}

// Check announces each batch with stock that is expiring or expired and has not been announced in
// that state yet, and returns how many it found to announce. A store with nobody to tell stores
// nothing, so its batches are announced once someone there manages its stock.
func (a *ExpiryAlerts) Check(ctx context.Context) (int, error) {
	today := stock.Today(a.now())
	rows, err := a.db.Query(ctx, `SELECT x.id, x.store_id, s.name, `+productName+`, coalesce(um.name, 'units'),
			x.batch_number, x.expiry_date, x.on_hand, x.expiry_date < $1::date
		FROM stock_batches x
		JOIN stores s ON s.id = x.store_id
		JOIN condoms c ON c.id = x.condom_id
		LEFT JOIN unit_of_measures um ON um.id = x.unit_of_measure_id
		WHERE x.on_hand > 0 AND x.expiry_date < ($1::date + make_interval(months => $2::int))::date
			AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.idempotency_key = x.id::text
				AND n.type = CASE WHEN x.expiry_date < $1::date THEN $3 ELSE $4 END)
		ORDER BY x.expiry_date, x.id`, today, stock.ExpiringMonths, BatchExpired, BatchExpiring)
	if err != nil {
		return 0, fmt.Errorf("find expiring batches: %w", err)
	}
	batches, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (expiringBatch, error) {
		var b expiringBatch
		err := row.Scan(&b.id, &b.storeID, &b.store, &b.product, &b.unit, &b.number, &b.expiry, &b.onHand, &b.expired)
		return b, err
	})
	if err != nil {
		return 0, fmt.Errorf("find expiring batches: %w", err)
	}
	for i, batch := range batches {
		if err := pgx.BeginFunc(ctx, a.db, func(tx pgx.Tx) error {
			return a.notifier.Notify(ctx, tx, expiryMessage(batch))
		}); err != nil {
			return i, fmt.Errorf("announce batch %s: %w", batch.id, err)
		}
	}
	return len(batches), nil
}

// expiryMessage is the notification for a batch in its current state. The batch ID is the
// idempotency key, so each state is announced once.
func expiryMessage(b expiringBatch) notifications.Message {
	typeName := BatchExpiring
	if b.expired {
		typeName = BatchExpired
	}
	product := b.product
	if product == "" {
		product = "condoms"
	}
	number, label := "", "a batch with no number"
	if b.number != nil {
		number, label = *b.number, "batch "+*b.number
	}
	return notifications.Message{
		Type:     typeName,
		Targets:  []notifications.Target{{Permission: "inventory:manage", StoreID: b.storeID}},
		Resource: &notifications.Resource{Type: "stock_batch", ID: b.id},
		Data: map[string]any{"store": b.store, "store_id": b.storeID, "product": product, "unit": b.unit,
			"quantity": b.onHand, "batch": number, "batch_label": label, "expiry": b.expiry.Format("2 Jan 2006"),
			"expiry_date": b.expiry.Format(time.DateOnly)},
		IdempotencyKey: b.id,
	}
}
