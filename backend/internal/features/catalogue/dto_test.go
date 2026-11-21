package catalogue

import "testing"

func ptr[T any](value T) *T { return &value }

func completeFields() ProductFields {
	return ProductFields{
		Category: ptr("male"), Type: ptr("free"), PiecesPerUnit: ptr(int32(144)),
		BrandID: ptr("0b9f3c52-6a8e-4c1e-9f41-2d6d1c0e7a10"), UnitID: ptr("6f2d8e14-3b7a-4f5c-8e2d-9a1b3c4d5e6f"),
	}
}

func TestProductNormalizeLowercasesCodes(t *testing.T) {
	fields := ProductFields{Category: ptr(" Male "), Type: ptr("SOCIALLY_MARKETED"), BrandID: ptr(" 0B9F3C52-6A8E-4C1E-9F41-2D6D1C0E7A10 ")}
	fields.Normalize()
	if *fields.Category != "male" || *fields.Type != "socially_marketed" || *fields.BrandID != "0b9f3c52-6a8e-4c1e-9f41-2d6d1c0e7a10" {
		t.Fatalf("not normalized: %+v", fields)
	}
	if fields.UnitID != nil || fields.PiecesPerUnit != nil {
		t.Fatal("normalizing set fields that were left out")
	}
}

func TestOverlayKeepsFieldsThePatchLeavesOut(t *testing.T) {
	current := completeFields()
	merged := current.overlay(ProductFields{PiecesPerUnit: ptr(int32(3))})
	if *merged.PiecesPerUnit != 3 || merged.Category != current.Category || merged.BrandID != current.BrandID {
		t.Fatalf("overlay: %+v", merged)
	}
	if !(ProductFields{}).empty() || merged.empty() {
		t.Fatal("empty misreports")
	}
}

func TestProductValidateUsesFormCopy(t *testing.T) {
	if problems := completeFields().validate(); problems != nil {
		t.Fatalf("complete product rejected: %v", problems)
	}
	incomplete := completeFields()
	incomplete.UnitID, incomplete.PiecesPerUnit = nil, nil
	problems := incomplete.validate()
	if problems["unit_id"] != "Choose a unit of measure." ||
		problems["pieces_per_unit"] != "Enter how many condoms one unit holds." || len(problems) != 2 {
		t.Fatalf("incomplete product: %v", problems)
	}
	invalid := completeFields()
	invalid.Category, invalid.PiecesPerUnit = ptr("unisex"), ptr(int32(0))
	problems = invalid.validate()
	if problems["category"] != "Choose male or female." || problems["pieces_per_unit"] != "Must be at least 1." {
		t.Fatalf("invalid product: %v", problems)
	}
}

func TestLookupRulesDifferByKind(t *testing.T) {
	if problems := units.validate("x", nil); problems["name"] != "Use at least 2 characters." {
		t.Fatalf("unit name: %v", problems)
	}
	if problems := brands.validate("x", nil); problems != nil {
		t.Fatalf("one-letter brand rejected: %v", problems)
	}
	long := "a note that is much longer than the one hundred and twenty characters a catalogue note may hold, so it must be refused here"
	if problems := brands.validate("Engabu", &long); problems["note"] != "Use at most 120 characters." {
		t.Fatalf("long note: %v", problems)
	}
}

func TestLookupNormalize(t *testing.T) {
	input := LookupInput{Name: "  Pack \t of  3 ", Note: ptr("   ")}
	input.Normalize()
	if input.Name != "Pack of 3" || input.Note != nil {
		t.Fatalf("lookup input: %+v", input)
	}
	patch := LookupPatch{Note: ptr("  ")}
	patch.Normalize()
	if patch.Note == nil || *patch.Note != "" || patch.empty() {
		t.Fatalf("a blank note in a patch must clear the note: %+v", patch)
	}
}
