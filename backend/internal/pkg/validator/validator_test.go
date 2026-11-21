package validator

import (
	"strings"
	"testing"
)

type sample struct {
	Name     string   `json:"name" validate:"required,min=2,max=40"`
	Pieces   *int     `json:"pieces_per_unit" validate:"required,min=1,max=100000"`
	Category string   `json:"category" validate:"required,oneof=male female"`
	RoleIDs  []string `json:"role_ids" validate:"max=2,dive,uuid_rfc4122"`
	Untagged string   `validate:"max=1"`
}

func TestFormatErrorsUsesJSONNamesAndReadableMessages(t *testing.T) {
	big := 100001
	err := Validate.Struct(sample{
		Name: "x", Pieces: &big, Category: "other",
		RoleIDs: []string{"not-a-uuid", "also-not"}, Untagged: "ab",
	})
	got := FormatErrors(err)
	want := map[string]string{
		"name":            "Use at least 2 characters.",
		"pieces_per_unit": "Must be at most 100,000.",
		"category":        "Choose one of: male, female.",
		"role_ids":        "Choose a valid item from the list.",
		"Untagged":        "Use at most 1 character.",
	}
	for field, message := range want {
		if got[field] != message {
			t.Errorf("%s: got %q, want %q", field, got[field], message)
		}
	}
	if len(got) != len(want) {
		t.Errorf("unexpected fields: %v", got)
	}
	for field := range got {
		if strings.Contains(got[field], "validation rule") {
			t.Errorf("%s: message still exposes the rule tag: %q", field, got[field])
		}
	}
}

func TestFormatErrorsOverridesAndRequired(t *testing.T) {
	err := Validate.Struct(sample{Name: "ok", Category: "male"})
	got := FormatErrors(err, map[string]string{"pieces_per_unit.required": "Enter how many condoms one unit holds."})
	if got["pieces_per_unit"] != "Enter how many condoms one unit holds." {
		t.Fatalf("override not applied: %v", got)
	}
	got = FormatErrors(err)
	if got["pieces_per_unit"] != "This field is required." {
		t.Fatalf("default required message: %v", got)
	}
}

func TestFormatNumber(t *testing.T) {
	for in, want := range map[string]string{"1": "1", "999": "999", "1000": "1,000", "10000000": "10,000,000", "-1200": "-1,200", "x": "x"} {
		if got := formatNumber(in); got != want {
			t.Errorf("formatNumber(%q) = %q, want %q", in, got, want)
		}
	}
}
