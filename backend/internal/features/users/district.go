package users

// DistrictOfUser is SQL selecting the district a user works in, where $1 is the user's ID: the
// district of their assigned store, or else of their assigned subcounty. Field workers such as
// VHTs often have a subcounty but no store, so both are consulted (3, 12).
const DistrictOfUser = `(SELECT COALESCE(st.district_id, sc.district_id) FROM users du
	LEFT JOIN stores st ON st.id = du.store_id
	LEFT JOIN subcounties sc ON sc.id = du.subcounty_id
	WHERE du.id = $1::uuid)`
