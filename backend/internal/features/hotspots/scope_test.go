package hotspots

import "testing"

func TestDistrictMode(t *testing.T) {
	tests := []struct {
		name  string
		scope scope
		want  int
	}{
		{"submitter only sees own submissions", scope{submit: true}, districtNone},
		{"VHT with district read sees active district hotspots", scope{submit: true, readDistrict: true}, districtActive},
		{"DCFP sees every hotspot in the district", scope{activate: true}, districtAll},
		{"activate wins over district read", scope{activate: true, readDistrict: true}, districtAll},
		{"no hotspot permissions", scope{}, districtNone},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.scope.districtMode(); got != tt.want {
				t.Fatalf("districtMode() = %d, want %d", got, tt.want)
			}
			if got := visibleArgs(tt.scope)[2]; got != tt.want {
				t.Fatalf("visibleArgs passes district mode %v as $3, want %d", got, tt.want)
			}
		})
	}
}
