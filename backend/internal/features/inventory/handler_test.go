package inventory

import "testing"

func TestValidate(t *testing.T) {
	note := func(s string) *string { return &s }
	id := "7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11"
	base := func(reason string, quantity int64, n *string) MovementInput {
		return MovementInput{StoreID: id, CondomID: id, UnitOfMeasureID: id, Reason: reason, Quantity: quantity, Note: n}
	}
	for name, tc := range map[string]struct {
		in    MovementInput
		valid bool
	}{
		"receipt":                {base("receipt", 500, nil), true},
		"negative receipt":       {base("receipt", -5, nil), false},
		"adjustment down":        {base("adjustment", -20, note("Count found 20 damaged")), true},
		"adjustment without why": {base("adjustment", -20, note("  ")), false},
		"zero adjustment":        {base("adjustment", 0, note("No change")), false},
		"dispatch is internal":   {base("dispatch", -5, nil), false},
		"huge":                   {base("receipt", 2_000_000_000, nil), false},
		"bad store":              {MovementInput{StoreID: "jms", CondomID: id, UnitOfMeasureID: id, Reason: "receipt", Quantity: 1}, false},
	} {
		if got := validate(&tc.in) == ""; got != tc.valid {
			t.Errorf("%s: valid=%v want %v", name, got, tc.valid)
		}
	}
}
