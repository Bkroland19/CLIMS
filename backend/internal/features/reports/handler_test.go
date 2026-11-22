package reports

import (
	"testing"
	"time"
)

func TestParseFilter(t *testing.T) {
	// 22 November 2026, 22:30 UTC is already 23 November in Kampala.
	now := time.Date(2026, 11, 22, 22, 30, 0, 0, time.UTC)
	f, err := ParseFilter("", "", "", "7", "80", now)
	if err != nil {
		t.Fatal(err)
	}
	if got := f.From.UTC().Format(time.RFC3339); got != "2026-10-31T21:00:00Z" {
		t.Errorf("default period starts %s, want 1 November in Kampala", got)
	}
	if got := f.To.UTC().Format(time.RFC3339); got != "2026-11-23T21:00:00Z" {
		t.Errorf("default period ends %s, want the end of 23 November in Kampala", got)
	}
	f, err = ParseFilter("2026-11-01", "2026-11-01", "female", "3", "90", now)
	if err != nil || f.To.Sub(f.From) != 24*time.Hour || f.Category != "female" || f.DeadlineDays != 3 || f.Target != 90 {
		t.Fatalf("one-day period: %+v %v", f, err)
	}
	for name, args := range map[string][5]string{
		"bad date":        {"2026-02-30", "", "", "7", "80"},
		"reversed":        {"2026-11-05", "2026-11-01", "", "7", "80"},
		"category":        {"", "", "both", "7", "80"},
		"deadline":        {"", "", "", "0", "80"},
		"target too high": {"", "", "", "7", "101"},
	} {
		if _, err := ParseFilter(args[0], args[1], args[2], args[3], args[4], now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestRate(t *testing.T) {
	if rate(1, 0) != nil {
		t.Error("zero notifications must be Not applicable")
	}
	if got := *rate(2, 3); got != 66.7 {
		t.Errorf("2 of 3 = %v, want 66.7", got)
	}
	if got := *rate(3, 3); got != 100 {
		t.Errorf("3 of 3 = %v", got)
	}
}
