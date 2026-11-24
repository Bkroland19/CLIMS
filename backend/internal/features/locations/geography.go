package locations

import (
	"context"

	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

// GeographySource says where the regions, districts and subcounties come from: there is no sync, so
// they change only through migrations.
const GeographySource = "Regions, districts and subcounties carry DHIS2 UIDs. Migration 16 loaded them from the " +
	"legacy organisation units, and they change only through migrations: CLIMS does not sync them from DHIS2."

// HotspotCounts are every hotspot recorded in a place, and those active.
type HotspotCounts struct {
	Hotspots       int64 `json:"hotspot_count"`
	ActiveHotspots int64 `json:"active_hotspot_count"`
}

type GeographySubcounty struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	HotspotCounts
}

type GeographyDistrict struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Stores int64  `json:"store_count"`
	HotspotCounts
	// Hotspots in the district with no subcounty, mostly converted legacy records.
	HotspotsWithoutSubcounty int64                `json:"hotspots_without_subcounty"`
	Subcounties              []GeographySubcounty `json:"subcounties"`
}

type GeographyRegion struct {
	ID        string              `json:"id"`
	Name      string              `json:"name"`
	Districts []GeographyDistrict `json:"districts"`
}

type GeographyCounts struct {
	Regions     int64 `json:"regions"`
	Districts   int64 `json:"districts"`
	Subcounties int64 `json:"subcounties"`
	Stores      int64 `json:"stores"`
	HotspotCounts
	// Hotspots with no district, which no district counts.
	HotspotsWithoutDistrict int64 `json:"hotspots_without_district"`
}

// Geography is every region, district and subcounty with the stores and hotspots in each.
type Geography struct {
	Source  string            `json:"source"`
	Counts  GeographyCounts   `json:"counts"`
	Regions []GeographyRegion `json:"regions"`
}

// Geography returns the place tree with counts. Unlike the place lookups it counts hotspots in every
// district and subcounty, including inactive and rejected ones, so it needs hotspots:all_districts:
// someone who sees only their district's active hotspots must not learn where the rest are.
func (h *Handler) Geography(c fiber.Ctx) error {
	geography, err := h.geography(c.Context())
	if err != nil {
		return lookupError(c, err)
	}
	return response.Success(c, 200, "geography retrieved", geography)
}

func (h *Handler) geography(ctx context.Context) (Geography, error) {
	out := Geography{Source: GeographySource, Regions: []GeographyRegion{}}
	t := &out.Counts
	if err := h.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM regions), (SELECT count(*) FROM districts),
			(SELECT count(*) FROM subcounties), (SELECT count(*) FROM stores),
			(SELECT count(*) FROM hot_spots), (SELECT count(*) FROM hot_spots WHERE status = 'active'),
			(SELECT count(*) FROM hot_spots WHERE district_id IS NULL)`).Scan(&t.Regions, &t.Districts,
		&t.Subcounties, &t.Stores, &t.Hotspots, &t.ActiveHotspots, &t.HotspotsWithoutDistrict); err != nil {
		return Geography{}, err
	}

	subcounties := map[string][]GeographySubcounty{}
	rows, err := h.db.Query(ctx, `SELECT sc.district_id, sc.id, sc.name, count(h.id), count(h.id) FILTER (WHERE h.status = 'active')
		FROM subcounties sc LEFT JOIN hot_spots h ON h.subcounty_id = sc.id
		GROUP BY sc.district_id, sc.id, sc.name ORDER BY sc.name, sc.id`)
	if err != nil {
		return Geography{}, err
	}
	var districtID string
	var sc GeographySubcounty
	if _, err = pgx.ForEachRow(rows, []any{&districtID, &sc.ID, &sc.Name, &sc.Hotspots, &sc.ActiveHotspots}, func() error {
		subcounties[districtID] = append(subcounties[districtID], sc)
		return nil
	}); err != nil {
		return Geography{}, err
	}

	rows, err = h.db.Query(ctx, `SELECT r.id, r.name, d.id, d.name,
			(SELECT count(*) FROM stores s WHERE s.district_id = d.id),
			(SELECT count(*) FROM hot_spots h WHERE h.district_id = d.id),
			(SELECT count(*) FROM hot_spots h WHERE h.district_id = d.id AND h.status = 'active'),
			(SELECT count(*) FROM hot_spots h WHERE h.district_id = d.id AND h.subcounty_id IS NULL)
		FROM regions r JOIN districts d ON d.region_id = r.id ORDER BY r.name, r.id, d.name, d.id`)
	if err != nil {
		return Geography{}, err
	}
	var regionID, regionName string
	var d GeographyDistrict
	if _, err = pgx.ForEachRow(rows, []any{&regionID, &regionName, &d.ID, &d.Name, &d.Stores, &d.Hotspots,
		&d.ActiveHotspots, &d.HotspotsWithoutSubcounty}, func() error {
		district := d
		district.Subcounties = subcounties[d.ID]
		if district.Subcounties == nil {
			district.Subcounties = []GeographySubcounty{}
		}
		if n := len(out.Regions); n == 0 || out.Regions[n-1].ID != regionID {
			out.Regions = append(out.Regions, GeographyRegion{ID: regionID, Name: regionName, Districts: []GeographyDistrict{}})
		}
		region := &out.Regions[len(out.Regions)-1]
		region.Districts = append(region.Districts, district)
		return nil
	}); err != nil {
		return Geography{}, err
	}
	// Regions without districts still appear.
	rows, err = h.db.Query(ctx, `SELECT r.id, r.name FROM regions r
		WHERE NOT EXISTS (SELECT 1 FROM districts d WHERE d.region_id = r.id) ORDER BY r.name, r.id`)
	if err != nil {
		return Geography{}, err
	}
	empty, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Place])
	if err != nil {
		return Geography{}, err
	}
	for _, r := range empty {
		out.Regions = append(out.Regions, GeographyRegion{ID: r.ID, Name: r.Name, Districts: []GeographyDistrict{}})
	}
	return out, nil
}
