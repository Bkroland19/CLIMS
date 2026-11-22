package stock

import (
	"testing"
	"time"
)

func date(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return d
}

func TestToday(t *testing.T) {
	// 21:30 UTC on 30 November is already 1 December in Kampala.
	if got := Today(time.Date(2026, 11, 30, 21, 30, 0, 0, time.UTC)); got != date("2026-12-01") {
		t.Fatalf("today = %s", got)
	}
}

func TestBand(t *testing.T) {
	today := date("2026-11-22")
	for expiry, want := range map[string]string{
		"2026-11-21": "expired",
		"2026-11-22": "under_1_month", // expires today: still usable, but red
		"2026-12-21": "under_1_month",
		"2026-12-22": "under_3_months", // exactly one calendar month left
		"2027-02-21": "under_3_months",
		"2027-02-22": "under_6_months",
		"2027-05-22": "ok",
	} {
		e := date(expiry)
		if got := Band(&e, today); got != want {
			t.Errorf("expiry %s: band %s, want %s", expiry, got, want)
		}
	}
	if Band(nil, today) != "unknown" {
		t.Error("a batch without expiry is unknown")
	}
	// Calendar months: from 31 January, one month later is 3 March in Go, so 28 February is near expiry.
	if !NearExpiry(date("2027-02-28"), date("2027-01-31")) {
		t.Error("28 February should be within a month of 31 January")
	}
}

func TestAllocate(t *testing.T) {
	early, late := date("2027-03-01"), date("2027-09-01")
	number := func(s string) *string { return &s }
	shipped := []Shipped{{Number: number("A"), Expiry: &early, Quantity: 30}, {Number: number("B"), Expiry: &late, Quantity: 20}}
	for name, tc := range map[string]struct {
		received int64
		want     []int64
		surplus  bool
	}{
		"as shipped":                   {received: 50, want: []int64{30, 20}},
		"shortfall on the late batch":  {received: 40, want: []int64{30, 10}},
		"shortfall empties late batch": {received: 25, want: []int64{25}},
		"surplus to unknown expiry":    {received: 55, want: []int64{30, 20, 5}, surplus: true},
		"nothing arrived":              {received: 0, want: nil},
	} {
		got := Allocate(shipped, tc.received)
		if len(got) != len(tc.want) {
			t.Errorf("%s: %d lines, want %d", name, len(got), len(tc.want))
			continue
		}
		for i, line := range got {
			if line.Quantity != tc.want[i] {
				t.Errorf("%s: line %d quantity %d, want %d", name, i, line.Quantity, tc.want[i])
			}
		}
		if tc.surplus && (got[len(got)-1].Expiry != nil || got[len(got)-1].Number != nil) {
			t.Errorf("%s: surplus should be unknown expiry", name)
		}
	}
	// A shipment from before batches were recorded arrives as unknown expiry.
	if got := Allocate(nil, 12); len(got) != 1 || got[0].Expiry != nil || got[0].Quantity != 12 {
		t.Errorf("legacy shipment: %+v", got)
	}
}
