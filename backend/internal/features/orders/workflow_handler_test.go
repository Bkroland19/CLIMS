package orders

import (
	"strings"
	"testing"
)

func TestTrimComment(t *testing.T) {
	text := func(value string) *string { return &value }
	cases := []struct {
		name  string
		in    *string
		want  *string
		valid bool
	}{
		{"absent", nil, nil, true},
		{"blank is dropped", text("  \n "), nil, true},
		{"trimmed", text("  Out since Monday "), text("Out since Monday"), true},
		{"at the limit", text(strings.Repeat("a", 4000)), text(strings.Repeat("a", 4000)), true},
		{"too long", text(strings.Repeat("a", 4001)), nil, false},
	}
	for _, tc := range cases {
		got, valid := trimComment(tc.in)
		if valid != tc.valid || (tc.valid && (got == nil) != (tc.want == nil)) || (tc.valid && got != nil && *got != *tc.want) {
			t.Errorf("%s: got %v %v", tc.name, got, valid)
		}
	}
}

func TestValidActionInput(t *testing.T) {
	count := func(value int32) *int32 { return &value }
	note := func(value string) *string { return &value }
	cases := []struct {
		action string
		input  ActionInput
		valid  bool
	}{
		{"review", ActionInput{}, true},
		{"check-stock", ActionInput{}, true},
		{"dispatch", ActionInput{}, true},
		{"dispatch", ActionInput{QuantityIssued: count(5)}, true},
		{"dispatch", ActionInput{QuantityIssued: count(0)}, false},
		{"review", ActionInput{QuantityIssued: count(5)}, false},
		{"receive", ActionInput{}, false}, // the counted quantity is required
		{"receive", ActionInput{QuantityReceived: count(0)}, true},
		{"receive", ActionInput{QuantityReceived: count(-1)}, false},
		{"receive", ActionInput{QuantityReceived: count(9), DiscrepancyNote: note("  One carton damaged ")}, true},
		{"receive", ActionInput{QuantityReceived: count(9), DiscrepancyNote: note("   ")}, false},
		{"dispatch", ActionInput{QuantityReceived: count(9)}, false},
		{"dispatch", ActionInput{DiscrepancyNote: note("Short")}, false},
	}
	for i, tc := range cases {
		input := tc.input
		if got := validActionInput(tc.action, &input); got != tc.valid {
			t.Errorf("case %d (%s): got %v, want %v", i, tc.action, got, tc.valid)
		}
	}
}
