package catalogue

import (
	"strings"

	"clims-backend/internal/pkg/validator"
)

// ProductFields are a product's editable fields. Pointers tell a field that was
// left out of a PATCH apart from one being set.
type ProductFields struct {
	Category      *string `json:"category" validate:"required,oneof=male female"`
	Type          *string `json:"type" validate:"required,oneof=free socially_marketed commercial"`
	BrandID       *string `json:"brand_id" validate:"required,uuid_rfc4122"`
	UnitID        *string `json:"unit_id" validate:"required,uuid_rfc4122"`
	PiecesPerUnit *int32  `json:"pieces_per_unit" validate:"required,min=1,max=100000"`
}

// ProductPatch changes any subset of a product's fields and its active flag.
type ProductPatch struct {
	ProductFields
	Active *bool `json:"active"`
}

// LookupInput creates a brand or unit of measure.
type LookupInput struct {
	Name string  `json:"name"`
	Note *string `json:"note"`
}

// LookupPatch changes any subset of a brand's or unit's fields. An empty note clears it.
type LookupPatch struct {
	Name   *string `json:"name"`
	Note   *string `json:"note"`
	Active *bool   `json:"active"`
}

type brandFields struct {
	Name string  `json:"name" validate:"required,max=60"`
	Note *string `json:"note" validate:"omitempty,max=120"`
}

type unitFields struct {
	Name string  `json:"name" validate:"required,min=2,max=40"`
	Note *string `json:"note" validate:"omitempty,max=120"`
}

// Messages for the rules a form control cannot rule out, written as the form's own copy.
var productMessages = map[string]string{
	"category.required":        "Choose a category.",
	"category.oneof":           "Choose male or female.",
	"type.required":            "Choose a type.",
	"type.oneof":               "Choose free, socially marketed or commercial.",
	"brand_id.required":        "Choose a brand.",
	"brand_id.uuid_rfc4122":    "Choose a brand from the list.",
	"unit_id.required":         "Choose a unit of measure.",
	"unit_id.uuid_rfc4122":     "Choose a unit of measure from the list.",
	"pieces_per_unit.required": "Enter how many condoms one unit holds.",
}

var lookupMessages = map[string]string{
	"name.required": "Enter a name.",
}

func (f *ProductFields) Normalize() {
	f.Category = lowerTrimmed(f.Category)
	f.Type = lowerTrimmed(f.Type)
	f.BrandID = lowerTrimmed(f.BrandID)
	f.UnitID = lowerTrimmed(f.UnitID)
}

// empty reports whether no product field is set.
func (f ProductFields) empty() bool {
	return f.Category == nil && f.Type == nil && f.BrandID == nil && f.UnitID == nil && f.PiecesPerUnit == nil
}

// overlay returns current with every field that patch sets replaced.
func (f ProductFields) overlay(patch ProductFields) ProductFields {
	if patch.Category != nil {
		f.Category = patch.Category
	}
	if patch.Type != nil {
		f.Type = patch.Type
	}
	if patch.BrandID != nil {
		f.BrandID = patch.BrandID
	}
	if patch.UnitID != nil {
		f.UnitID = patch.UnitID
	}
	if patch.PiecesPerUnit != nil {
		f.PiecesPerUnit = patch.PiecesPerUnit
	}
	return f
}

// validate checks a complete product and reports each problem under its field.
func (f ProductFields) validate() validationError {
	if err := validator.Validate.Struct(f); err != nil {
		return validator.FormatErrors(err, productMessages)
	}
	return nil
}

func (in *LookupInput) Normalize() {
	in.Name = collapseSpaces(in.Name)
	in.Note = trimmedOrNil(in.Note)
}

func (p *LookupPatch) Normalize() {
	if p.Name != nil {
		name := collapseSpaces(*p.Name)
		p.Name = &name
	}
	if p.Note != nil {
		// Present but blank clears the note, so keep an empty string rather than nil.
		note := strings.TrimSpace(*p.Note)
		p.Note = &note
	}
}

func (p LookupPatch) empty() bool {
	return p.Name == nil && p.Note == nil && p.Active == nil
}

func lowerTrimmed(value *string) *string {
	if value == nil {
		return nil
	}
	lowered := strings.ToLower(strings.TrimSpace(*value))
	return &lowered
}

func trimmedOrNil(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// collapseSpaces trims a name and turns inner runs of whitespace into one space.
func collapseSpaces(value string) string {
	return strings.Join(strings.Fields(value), " ")
}
