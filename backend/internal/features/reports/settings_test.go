package reports

import (
	"testing"
	"time"
)

func TestCycleStart(t *testing.T) {
	// Sunday 22 November 2026 in Kampala.
	now := time.Date(2026, 11, 22, 9, 0, 0, 0, time.UTC)
	for cycle, want := range map[string]string{
		"weekly":    "2026-11-16", // the Monday before
		"monthly":   "2026-11-01",
		"bimonthly": "2026-11-01", // November-December
		"quarterly": "2026-10-01",
		"unknown":   "2026-11-01", // falls back to the month
	} {
		if got := CycleStart(cycle, now).Format(time.DateOnly); got != want {
			t.Errorf("%s: %s, want %s", cycle, got, want)
		}
	}
	// 21:30 UTC on Sunday 31 May is already Monday 1 June in Kampala.
	late := time.Date(2026, 5, 31, 21, 30, 0, 0, time.UTC)
	for cycle, want := range map[string]string{"weekly": "2026-06-01", "bimonthly": "2026-05-01", "quarterly": "2026-04-01"} {
		if got := CycleStart(cycle, late).Format(time.DateOnly); got != want {
			t.Errorf("%s at month end: %s, want %s", cycle, got, want)
		}
	}
	if !ValidCycle("bimonthly") || ValidCycle("daily") {
		t.Error("review cycles are weekly, monthly, bimonthly and quarterly")
	}
}
