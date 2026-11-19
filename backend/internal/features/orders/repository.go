package orders

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Order struct {
	ID                 string    `json:"id"`
	CondomID           string    `json:"condom_id"`
	QuantityNeeded     int32     `json:"quantity_needed"`
	QuantityIssued     *int32    `json:"quantity_issued"`
	Status             string    `json:"order_status"`
	Date               string    `json:"order_date"`
	OrderedByID        string    `json:"ordered_by_id"`
	HandledByID        *string   `json:"handled_by_id"`
	OrderedForStoreID  string    `json:"ordered_for_store_id"`
	OrderedFromStoreID string    `json:"ordered_from_store_id"`
	UnitOfMeasureID    string    `json:"unit_of_measure_id"`
	Comment            *string   `json:"comment"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type scope struct {
	storeID   *string
	allStores bool
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

const columns = `id, condom_id, quantity_needed, quantity_issued, order_status,
to_char(order_date, 'YYYY-MM-DD'), ordered_by_id, handled_by_id, ordered_for_store_id,
ordered_from_store_id, unit_of_measure_id, comment, created_at, updated_at`

func scanOrder(row pgx.Row) (Order, error) {
	var order Order
	err := row.Scan(&order.ID, &order.CondomID, &order.QuantityNeeded, &order.QuantityIssued,
		&order.Status, &order.Date, &order.OrderedByID, &order.HandledByID,
		&order.OrderedForStoreID, &order.OrderedFromStoreID, &order.UnitOfMeasureID,
		&order.Comment, &order.CreatedAt, &order.UpdatedAt)
	return order, err
}

const visibleOrders = `($1::boolean OR $2::uuid IN (ordered_for_store_id, ordered_from_store_id))`

func (r *Repository) list(ctx context.Context, access scope, limit, offset int32) ([]Order, error) {
	rows, err := r.db.Query(ctx, `SELECT `+columns+` FROM orders WHERE `+visibleOrders+
		` ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, access.allStores, access.storeID, limit, offset)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Order, error) {
		return scanOrder(row)
	})
}

func (r *Repository) get(ctx context.Context, access scope, id string) (Order, error) {
	return scanOrder(r.db.QueryRow(ctx, `SELECT `+columns+` FROM orders WHERE `+visibleOrders+
		` AND id = $3`, access.allStores, access.storeID, id))
}

func (r *Repository) create(ctx context.Context, actorID string, input createRequest) (Order, error) {
	return scanOrder(r.db.QueryRow(ctx, `
		INSERT INTO orders (condom_id, quantity_needed, order_date, ordered_by_id,
			ordered_for_store_id, ordered_from_store_id, unit_of_measure_id, comment)
		VALUES ($1, $2, COALESCE($3::text::date, CURRENT_DATE), $4, $5, $6, $7, $8)
		RETURNING `+columns, input.CondomID, input.QuantityNeeded, input.Date, actorID,
		input.OrderedForStoreID, input.OrderedFromStoreID, input.UnitOfMeasureID, input.Comment))
}

func (r *Repository) fulfill(ctx context.Context, access scope, id, actorID string, quantity int32) (Order, error) {
	return scanOrder(r.db.QueryRow(ctx, `
		UPDATE orders SET quantity_issued = $5, order_status = 'fulfilled',
			handled_by_id = $4, updated_at = CURRENT_TIMESTAMP
		WHERE ($1::boolean OR ordered_from_store_id = $2::uuid) AND id = $3
			AND order_status = 'pending'
		RETURNING `+columns, access.allStores, access.storeID, id, actorID, quantity))
}
