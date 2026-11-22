// Package catalogue manages the condom catalogue: products and the product
// types, brands and units of measure they reference. Records are deactivated rather than deleted
// once anything uses them, so stock and order history keep their meaning.
package catalogue

import "time"

const (
	CategoryMale   = "male"
	CategoryFemale = "female"
)

// Ref is a linked catalogue record embedded in another resource.
type Ref struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Product is a condom product. Converted legacy products may lack any of the
// nullable fields; the API requires them for new products and before a
// product is activated or edited.
type Product struct {
	ID            string    `json:"id"`
	Category      *string   `json:"category"`
	Type          *Ref      `json:"type"`
	Brand         *Ref      `json:"brand"`
	Unit          *Ref      `json:"unit"`
	PiecesPerUnit *int32    `json:"pieces_per_unit"`
	Active        bool      `json:"active"`
	InUse         bool      `json:"in_use"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Lookup is a product type, a brand or a unit of measure; all have the same shape and rules.
type Lookup struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Note         *string   `json:"note"`
	Active       bool      `json:"active"`
	InUse        bool      `json:"in_use"`
	ProductCount int64     `json:"product_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
