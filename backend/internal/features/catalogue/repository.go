package catalogue

import (
	"context"
	"errors"

	"clims-backend/internal/pkg/validator"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// validationError maps request fields to messages; the handler sends it as a 422.
type validationError map[string]string

func (validationError) Error() string { return "validation failed" }

var (
	errInUse         = errors.New("record is in use")
	errDuplicateName = errors.New("name already exists")
)

// texts are the messages a client shows for a resource's failures.
type texts struct {
	notFound  string
	inUse     string
	duplicate string
}

var productTexts = texts{
	notFound: "Product not found.",
	inUse:    "This product is used by stock or order records. Deactivate it instead.",
}

// lookupKind describes a brand-like table: a unique name, an optional note and an active flag.
type lookupKind struct {
	texts
	path          string // URL segment under /catalogue
	singular      string // used in success messages, e.g. "brand created"
	table         string
	productColumn string // the condoms column that references this table
	// inUse is true when anything references the row aliased t; such rows cannot be deleted.
	inUse    string
	validate func(name string, note *string) validationError
	// Messages for a product that references a missing or inactive row.
	missing  string
	inactive string
}

var brands = lookupKind{
	texts: texts{
		notFound:  "Brand not found.",
		inUse:     "This brand is used by products. Deactivate it instead.",
		duplicate: "A brand with this name already exists.",
	},
	path:          "brands",
	singular:      "brand",
	table:         "brands",
	productColumn: "brand_id",
	inUse:         `EXISTS (SELECT 1 FROM condoms c WHERE c.brand_id = t.id)`,
	validate: func(name string, note *string) validationError {
		return check(brandFields{Name: name, Note: note})
	},
	missing:  "Choose an existing brand.",
	inactive: "This brand is inactive. Choose an active brand.",
}

var units = lookupKind{
	texts: texts{
		notFound:  "Unit of measure not found.",
		inUse:     "This unit of measure is used by products, stock or orders. Deactivate it instead.",
		duplicate: "A unit of measure with this name already exists.",
	},
	path:          "units",
	singular:      "unit of measure",
	table:         "unit_of_measures",
	productColumn: "unit_id",
	inUse: `EXISTS (SELECT 1 FROM condoms c WHERE c.unit_id = t.id)
		OR EXISTS (SELECT 1 FROM orders o WHERE o.unit_of_measure_id = t.id)
		OR EXISTS (SELECT 1 FROM order_store_stock s WHERE s.unit_of_measure_id = t.id)
		OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.unit_of_measure_id = t.id)
		OR (t.legacy_id IS NOT NULL
			AND EXISTS (SELECT 1 FROM condom_inventories ci WHERE btrim(ci.unit_of_measure_id) = t.legacy_id))`,
	validate: func(name string, note *string) validationError {
		return check(unitFields{Name: name, Note: note})
	},
	missing:  "Choose an existing unit of measure.",
	inactive: "This unit of measure is inactive. Choose an active unit.",
}

func check(fields any) validationError {
	if err := validator.Validate.Struct(fields); err != nil {
		return validator.FormatErrors(err, lookupMessages)
	}
	return nil
}

// productInUse is true when stock or order records reference the product aliased c.
// Legacy stock tables still reference products by their legacy ID.
const productInUse = `(EXISTS (SELECT 1 FROM orders o WHERE o.condom_id = c.id)
	OR EXISTS (SELECT 1 FROM order_store_stock s WHERE s.condom_id = c.id)
	OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.condom_id = c.id)
	OR (c.legacy_id IS NOT NULL AND (
		EXISTS (SELECT 1 FROM condom_inventories ci WHERE btrim(ci.condom_id) = c.legacy_id)
		OR EXISTS (SELECT 1 FROM hot_spot_stocks hs WHERE btrim(hs.condom_id) = c.legacy_id))))`

const productSelect = `SELECT c.id, c.category, c.type, b.id, b.name, u.id, u.name, c.pieces_per_unit,
	c.active, ` + productInUse + `, c.created_at, c.updated_at
	FROM condoms c
	LEFT JOIN brands b ON b.id = c.brand_id
	LEFT JOIN unit_of_measures u ON u.id = c.unit_id`

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func scanProduct(row pgx.Row) (Product, error) {
	var p Product
	var brandID, brandName, unitID, unitName *string
	if err := row.Scan(&p.ID, &p.Category, &p.Type, &brandID, &brandName, &unitID, &unitName,
		&p.PiecesPerUnit, &p.Active, &p.InUse, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return Product{}, err
	}
	if brandID != nil && brandName != nil {
		p.Brand = &Ref{ID: *brandID, Name: *brandName}
	}
	if unitID != nil && unitName != nil {
		p.Unit = &Ref{ID: *unitID, Name: *unitName}
	}
	return p, nil
}

// listProducts returns products by category, brand and type; active filters when set.
func (r *Repository) listProducts(ctx context.Context, active *bool) ([]Product, error) {
	rows, err := r.db.Query(ctx, productSelect+`
		WHERE ($1::boolean IS NULL OR c.active = $1)
		ORDER BY c.category NULLS LAST, lower(b.name) NULLS LAST, c.type NULLS LAST, c.created_at, c.id`, active)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Product, error) { return scanProduct(row) })
}

func getProduct(ctx context.Context, q querier, id string) (Product, error) {
	return scanProduct(q.QueryRow(ctx, productSelect+` WHERE c.id = $1`, id))
}

func (r *Repository) createProduct(ctx context.Context, fields ProductFields) (Product, error) {
	if problems := fields.validate(); problems != nil {
		return Product{}, problems
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	problems := validationError{}
	if err = checkReference(ctx, tx, brands, "brand_id", fields.BrandID, nil, problems); err != nil {
		return Product{}, err
	}
	if err = checkReference(ctx, tx, units, "unit_id", fields.UnitID, nil, problems); err != nil {
		return Product{}, err
	}
	if len(problems) > 0 {
		return Product{}, problems
	}
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO condoms (category, type, brand_id, unit_id, pieces_per_unit)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		fields.Category, fields.Type, fields.BrandID, fields.UnitID, fields.PiecesPerUnit).Scan(&id); err != nil {
		return Product{}, err
	}
	product, err := getProduct(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	return product, tx.Commit(ctx)
}

// updateProduct applies a patch. Deactivating alone is always allowed, so incomplete
// legacy products can be retired; any other change, or activating, needs the result
// to be a complete product.
func (r *Repository) updateProduct(ctx context.Context, id string, patch ProductPatch) (Product, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var current ProductFields
	var active bool
	if err = tx.QueryRow(ctx, `SELECT category, type, brand_id, unit_id, pieces_per_unit, active
		FROM condoms WHERE id = $1 FOR UPDATE`, id).Scan(
		&current.Category, &current.Type, &current.BrandID, &current.UnitID, &current.PiecesPerUnit, &active); err != nil {
		return Product{}, err
	}
	merged := current.overlay(patch.ProductFields)
	nextActive := active
	if patch.Active != nil {
		nextActive = *patch.Active
	}
	if !patch.ProductFields.empty() || (nextActive && !active) {
		problems := merged.validate()
		if problems == nil {
			problems = validationError{}
		}
		// A brand or unit that is already on the product may stay even if it was deactivated since.
		if _, invalid := problems["brand_id"]; !invalid {
			if err = checkReference(ctx, tx, brands, "brand_id", patch.BrandID, current.BrandID, problems); err != nil {
				return Product{}, err
			}
		}
		if _, invalid := problems["unit_id"]; !invalid {
			if err = checkReference(ctx, tx, units, "unit_id", patch.UnitID, current.UnitID, problems); err != nil {
				return Product{}, err
			}
		}
		if len(problems) > 0 {
			return Product{}, problems
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE condoms SET category = $2, type = $3, brand_id = $4, unit_id = $5,
		pieces_per_unit = $6, active = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		id, merged.Category, merged.Type, merged.BrandID, merged.UnitID, merged.PiecesPerUnit, nextActive); err != nil {
		return Product{}, err
	}
	product, err := getProduct(ctx, tx, id)
	if err != nil {
		return Product{}, err
	}
	return product, tx.Commit(ctx)
}

func (r *Repository) deleteProduct(ctx context.Context, id string) error {
	return r.deleteUnlessInUse(ctx, `SELECT `+productInUse+` FROM condoms c WHERE c.id = $1 FOR UPDATE`,
		`DELETE FROM condoms WHERE id = $1`, id)
}

// checkReference records a problem under field when id names a brand or unit that does not
// exist or is inactive. An unchanged reference (equal to current) is not checked.
func checkReference(ctx context.Context, q querier, kind lookupKind, field string, id, current *string,
	problems validationError) error {
	if id == nil || (current != nil && *current == *id) {
		return nil
	}
	var active bool
	err := q.QueryRow(ctx, `SELECT active FROM `+kind.table+` WHERE id = $1 FOR SHARE`, *id).Scan(&active)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		problems[field] = kind.missing
	case err != nil:
		return err
	case !active:
		problems[field] = kind.inactive
	}
	return nil
}

func lookupSelect(kind lookupKind) string {
	return `SELECT t.id, t.name, t.note, t.active, (` + kind.inUse + `),
		(SELECT count(*) FROM condoms c WHERE c.` + kind.productColumn + ` = t.id),
		t.created_at, t.updated_at
		FROM ` + kind.table + ` t`
}

func scanLookup(row pgx.Row) (Lookup, error) {
	var l Lookup
	err := row.Scan(&l.ID, &l.Name, &l.Note, &l.Active, &l.InUse, &l.ProductCount, &l.CreatedAt, &l.UpdatedAt)
	return l, err
}

func (r *Repository) listLookups(ctx context.Context, kind lookupKind, active *bool) ([]Lookup, error) {
	rows, err := r.db.Query(ctx, lookupSelect(kind)+`
		WHERE ($1::boolean IS NULL OR t.active = $1)
		ORDER BY lower(t.name), t.id`, active)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Lookup, error) { return scanLookup(row) })
}

func getLookup(ctx context.Context, q querier, kind lookupKind, id string) (Lookup, error) {
	return scanLookup(q.QueryRow(ctx, lookupSelect(kind)+` WHERE t.id = $1`, id))
}

func (r *Repository) createLookup(ctx context.Context, kind lookupKind, input LookupInput) (Lookup, error) {
	if problems := kind.validate(input.Name, input.Note); problems != nil {
		return Lookup{}, problems
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return Lookup{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO `+kind.table+` (name, note) VALUES ($1, $2) RETURNING id`,
		input.Name, input.Note).Scan(&id); err != nil {
		return Lookup{}, duplicateName(err)
	}
	lookup, err := getLookup(ctx, tx, kind, id)
	if err != nil {
		return Lookup{}, err
	}
	return lookup, tx.Commit(ctx)
}

func (r *Repository) updateLookup(ctx context.Context, kind lookupKind, id string, patch LookupPatch) (Lookup, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return Lookup{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var name string
	var note *string
	var active bool
	if err = tx.QueryRow(ctx, `SELECT name, note, active FROM `+kind.table+` WHERE id = $1 FOR UPDATE`, id).Scan(
		&name, &note, &active); err != nil {
		return Lookup{}, err
	}
	if patch.Name != nil {
		name = *patch.Name
	}
	if patch.Note != nil {
		note = trimmedOrNil(patch.Note)
	}
	if patch.Active != nil {
		active = *patch.Active
	}
	// Legacy names that predate the rules stay valid until someone edits them.
	if patch.Name != nil || patch.Note != nil {
		if problems := kind.validate(name, note); problems != nil {
			return Lookup{}, problems
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE `+kind.table+` SET name = $2, note = $3, active = $4,
		updated_at = CURRENT_TIMESTAMP WHERE id = $1`, id, name, note, active); err != nil {
		return Lookup{}, duplicateName(err)
	}
	lookup, err := getLookup(ctx, tx, kind, id)
	if err != nil {
		return Lookup{}, err
	}
	return lookup, tx.Commit(ctx)
}

func (r *Repository) deleteLookup(ctx context.Context, kind lookupKind, id string) error {
	return r.deleteUnlessInUse(ctx, `SELECT (`+kind.inUse+`) FROM `+kind.table+` t WHERE t.id = $1 FOR UPDATE`,
		`DELETE FROM `+kind.table+` WHERE id = $1`, id)
}

// deleteUnlessInUse locks the row, refuses when inUseQuery says it is referenced, then deletes it.
// A foreign key violation means a reference appeared after the check, which is also in use.
func (r *Repository) deleteUnlessInUse(ctx context.Context, inUseQuery, deleteQuery, id string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var inUse bool
	if err = tx.QueryRow(ctx, inUseQuery, id).Scan(&inUse); err != nil {
		return err
	}
	if inUse {
		return errInUse
	}
	if _, err = tx.Exec(ctx, deleteQuery, id); err != nil {
		var dbError *pgconn.PgError
		if errors.As(err, &dbError) && dbError.Code == "23503" {
			return errInUse
		}
		return err
	}
	return tx.Commit(ctx)
}

// duplicateName turns a violation of a case-insensitive name index into errDuplicateName.
func duplicateName(err error) error {
	var dbError *pgconn.PgError
	if errors.As(err, &dbError) && dbError.Code == "23505" &&
		(dbError.ConstraintName == "brands_name_key" || dbError.ConstraintName == "unit_of_measures_name_key") {
		return errDuplicateName
	}
	return err
}
