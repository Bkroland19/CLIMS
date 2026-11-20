package hotspots

import (
	"testing"

	"clims-backend/internal/pkg/validator"
)

func validSubmission() SubmitRequest {
	latitude, longitude, dispenser := 0.3476, 32.5825, true
	return SubmitRequest{Details: Details{
		Name: "  Mama's   Bar ", Type: "Bar",
		RegionID:    "11111111-1111-4111-8111-111111111111",
		DistrictID:  "22222222-2222-4222-8222-222222222222",
		SubcountyID: "33333333-3333-4333-8333-333333333333",
		Village:     " Kabaale ", Latitude: &latitude, Longitude: &longitude,
		ContactPersonName: "Jane", ContactPersonPhone: "+256 700-123 456",
		HasCondomDispenser: &dispenser,
	}}
}

func TestSubmissionNormalizesAndValidates(t *testing.T) {
	blank := "   "
	request := validSubmission()
	request.Note = &blank
	request.DispenserCondition = &blank
	request.Normalize()
	if err := validator.Validate.Struct(request); err != nil {
		t.Fatalf("valid submission rejected: %v", err)
	}
	if request.Name != "Mama's   Bar" || request.Village != "Kabaale" {
		t.Fatalf("text not trimmed: %q %q", request.Name, request.Village)
	}
	if request.ContactPersonPhone != "+256700123456" {
		t.Fatalf("phone separators kept: %q", request.ContactPersonPhone)
	}
	if request.Note != nil || request.DispenserCondition != nil {
		t.Fatal("blank optional text should become nil")
	}
}

func TestSubmissionRejectsMissingOrInvalidFields(t *testing.T) {
	outOfRange := 91.0
	cases := map[string]func(*SubmitRequest){
		"Name":               func(r *SubmitRequest) { r.Name = " " },
		"Type":               func(r *SubmitRequest) { r.Type = "" },
		"Village":            func(r *SubmitRequest) { r.Village = "" },
		"RegionID":           func(r *SubmitRequest) { r.RegionID = "not-a-uuid" },
		"SubcountyID":        func(r *SubmitRequest) { r.SubcountyID = "" },
		"Latitude":           func(r *SubmitRequest) { r.Latitude = &outOfRange },
		"Longitude":          func(r *SubmitRequest) { r.Longitude = nil },
		"ContactPersonName":  func(r *SubmitRequest) { r.ContactPersonName = "" },
		"ContactPersonPhone": func(r *SubmitRequest) { r.ContactPersonPhone = "07-12" },
		"HasCondomDispenser": func(r *SubmitRequest) { r.HasCondomDispenser = nil },
	}
	for field, mutate := range cases {
		request := validSubmission()
		mutate(&request)
		request.Normalize()
		err := validator.Validate.Struct(request)
		if _, reported := validator.FormatErrors(err)[field]; err == nil || !reported {
			t.Errorf("%s: expected a validation error, got %v", field, err)
		}
	}
}

func TestZeroCoordinatesAreAllowed(t *testing.T) {
	zero := 0.0
	request := validSubmission()
	request.Latitude, request.Longitude = &zero, &zero
	request.Normalize()
	if err := validator.Validate.Struct(request); err != nil {
		t.Fatalf("coordinates of 0 should be valid: %v", err)
	}
}
