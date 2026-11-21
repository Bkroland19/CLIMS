package users

import (
	"strings"
	"testing"
)

func TestDistrictOfUserUsesStoreThenSubcounty(t *testing.T) {
	for _, want := range []string{
		"COALESCE(st.district_id, sc.district_id)",
		"st.id = du.store_id",
		"sc.id = du.subcounty_id",
		"du.id = $1::uuid",
	} {
		if !strings.Contains(DistrictOfUser, want) {
			t.Errorf("DistrictOfUser missing %q:\n%s", want, DistrictOfUser)
		}
	}
}
