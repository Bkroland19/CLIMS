package reports

import (
	"strings"
	"testing"
	"time"
)

func TestWriteCSV(t *testing.T) {
	table := Table{Title: "Store stock", Period: "Stock on 2026-11-22", Scope: "National", Product: "Male condoms",
		RuleVersion: "v", DataUpdatedAt: time.Date(2026, 11, 22, 9, 30, 0, 0, time.UTC), Definitions: []string{blankRule},
		Columns: cols("store", "Store", "usable", "Usable", "months_of_stock", "Months of stock", "reconciled", "Reconciled",
			"expiry_date", "Expiry date", "received_at", "Acknowledged"),
		Rows: []map[string]any{
			{"store": "=HYPERLINK(\"x\")", "usable": float64(0), "months_of_stock": nil, "reconciled": true,
				"expiry_date": "2027-01-31T00:00:00Z", "received_at": "2026-11-21T22:15:00Z"},
		}}
	var out strings.Builder
	if err := writeCSV(&out, table); err != nil {
		t.Fatal(err)
	}
	got := out.String()
	for _, want := range []string{
		"Data updated,2026-11-22 12:30\n", // Kampala time
		"Store,Usable,Months of stock,Reconciled,Expiry date,Acknowledged\n",
		// formula text is neutralised, zero stays 0, null is blank, the date keeps its day, times are Kampala
		"\"'=HYPERLINK(\"\"x\"\")\",0,,Yes,2027-01-31,2026-11-22 01:15\n",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("CSV lacks %q:\n%s", want, got)
		}
	}
	if cell(float64(-3)) != "-3" || safeCells([]string{"-3"})[0] != "-3" {
		t.Error("negative numbers are not formulas")
	}
}
