package users

import "testing"

func TestNormalizePhone(t *testing.T) {
	for input, want := range map[string]string{
		"0772123456":       "0772123456",
		"0772 123 456":     "0772123456",
		"+256772123456":    "0772123456",
		"256-772-123-456":  "0772123456",
		"(0772) 123456":    "0772123456",
		"+44 20 7946 0958": "442079460958",
		"07721":            "",
		"kato.musa":        "",
		"user@example.org": "",
		"0772123456a":      "",
		"":                 "",
	} {
		if got := NormalizePhone(input); got != want {
			t.Errorf("NormalizePhone(%q) = %q, want %q", input, got, want)
		}
	}
}
