package hotspots

import "testing"

func TestValidate(t *testing.T) {
	text := func(s string) *string { return &s }
	number := func(f float64) *float64 { return &f }
	district := "7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11"
	yes, no := new(bool), new(bool)
	*yes = true
	for name, tc := range map[string]struct {
		in    Submission
		valid bool
	}{
		"minimal":            {Submission{Name: " Lake view bar ", DistrictID: district}, true},
		"full":               {Submission{Name: "Bar", DistrictID: district, Village: text("Seja"), Latitude: number(0.3), Longitude: number(32.6)}, true},
		"blank name":         {Submission{Name: "  ", DistrictID: district}, false},
		"long name":          {Submission{Name: "This hotspot name is far too long for the column", DistrictID: district}, false},
		"bad district":       {Submission{Name: "Bar", DistrictID: "kampala"}, false},
		"long telephone":     {Submission{Name: "Bar", DistrictID: district, ContactPersonTelephone: text("0700 000 000 000 0")}, false},
		"latitude only":      {Submission{Name: "Bar", DistrictID: district, Latitude: number(0.3)}, false},
		"latitude too high":  {Submission{Name: "Bar", DistrictID: district, Latitude: number(91), Longitude: number(32)}, false},
		"dispenser":          {Submission{Name: "Bar", DistrictID: district, HasCondomDispenser: yes, DispenserCondition: text("Good")}, true},
		"no dispenser":       {Submission{Name: "Bar", DistrictID: district, HasCondomDispenser: no}, true},
		"dispenser no state": {Submission{Name: "Bar", DistrictID: district, HasCondomDispenser: yes}, false},
		"condition only":     {Submission{Name: "Bar", DistrictID: district, HasCondomDispenser: no, DispenserCondition: text("Good")}, false},
		"unknown condition":  {Submission{Name: "Bar", DistrictID: district, HasCondomDispenser: yes, DispenserCondition: text("Fine")}, false},
		"long type":          {Submission{Name: "Bar", DistrictID: district, Type: text("A venue type that is much longer than forty")}, false},
	} {
		if got := validate(&tc.in) == ""; got != tc.valid {
			t.Errorf("%s: valid=%v want %v", name, got, tc.valid)
		}
	}
	in := Submission{Name: " Bar ", DistrictID: district, Village: text("  ")}
	if validate(&in) != "" || in.Name != "Bar" || in.Village != nil {
		t.Fatalf("not normalized: %+v", in)
	}
}
