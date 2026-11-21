/**
 * Hotspots for the mock API, in the Go API's shapes (`backend/internal/features/hotspots`):
 * a VHT submits a hotspot, the DCFP verifies then activates it, or rejects it with a reason.
 * Each step is recorded as an event, which `GET /hotspots/notifications` lists newest first.
 *
 * The signed-in user is not known here, so the VHT's own list and the DCFP's district queue
 * are the same list. The real API scopes both to the account.
 *
 * Rules the real API enforces, mirrored here: an action is only available from the states
 * listed in `TRANSITIONS`, and reject needs a reason of at most 1000 characters while the
 * other actions take no body.
 */

import type { Reply } from './fulfilment.mts';

type Body = Record<string, unknown>;
type Status = 'submitted' | 'verified' | 'active' | 'rejected';

interface Hotspot {
  id: string;
  name: string;
  type: string | null;
  village: string | null;
  contact_person_name: string | null;
  contact_person_telephone: string | null;
  has_condom_dispenser: boolean | null;
  dispenser_condition: string | null;
  latitude: number | null;
  longitude: number | null;
  comment: string | null;
  status: Status;
  rejection_reason: string | null;
  district_id: string;
  /** The subcounty the village is in, as the Go API nests it (`subcounty: { id, name }`). */
  subcounty: { id: string; name: string } | null;
  submitted_by_id: string;
  created_at: string;
  /** The Go API's review step when it differs from `status` (only "deactivated" does). */
  review_override?: 'deactivated';
}

interface HotspotEvent {
  id: string;
  hot_spot_id: string;
  action: string;
  status: Status;
  created_at: string;
}

const TRANSITIONS: Record<string, { from: Status[]; to: Status }> = {
  verify: { from: ['submitted'], to: 'verified' },
  activate: { from: ['verified'], to: 'active' },
  reject: { from: ['submitted', 'verified'], to: 'rejected' },
};

const WAKISO = '7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11';
const MUKONO = '0d6c4b1e-5a3f-4e2b-8c7d-9f1a2b3c4d5e';
const KAMPALA = '3e8a9b7c-6d5f-4a1b-9c2d-1e0f9a8b7c6d';

/** A stable UUID-shaped id for the geography below: `g` names the level, `n` the place. */
const placeId = (g: number, n: number) =>
  `00000000-0000-4000-${String(8100 + g)}-${String(n).padStart(12, '0')}`;

/*
 * A slice of Uganda's regions, districts and subcounties, named as the Go API's
 * tables name them, for `GET /locations/regions`, `/districts?region_id=` and
 * `/subcounties?district_id=`. The three districts the hotspot screens have
 * always used keep their ids.
 */
const REGIONS = [
  { id: placeId(1, 1), name: 'Acholi' },
  { id: placeId(1, 2), name: 'Busoga' },
  { id: placeId(1, 3), name: 'Kampala' },
  { id: placeId(1, 4), name: 'North Central' },
  { id: placeId(1, 5), name: 'South Central' },
];

const DISTRICTS_BY_REGION = [
  { id: WAKISO, name: 'Wakiso', region_id: placeId(1, 5) },
  { id: placeId(2, 1), name: 'Mpigi', region_id: placeId(1, 5) },
  { id: MUKONO, name: 'Mukono', region_id: placeId(1, 4) },
  { id: placeId(2, 2), name: 'Luwero', region_id: placeId(1, 4) },
  { id: KAMPALA, name: 'Kampala', region_id: placeId(1, 3) },
  { id: placeId(2, 3), name: 'Gulu', region_id: placeId(1, 1) },
  { id: placeId(2, 4), name: 'Jinja', region_id: placeId(1, 2) },
];

const DISTRICTS = DISTRICTS_BY_REGION.map(({ id, name }) => ({ id, name }));

const SUBCOUNTIES = [
  { id: placeId(3, 1), name: 'Makindye Ssabagabo Municipality', district_id: WAKISO },
  { id: placeId(3, 2), name: 'Katabi Town Council', district_id: WAKISO },
  { id: placeId(3, 3), name: 'Nansana Division', district_id: WAKISO },
  { id: placeId(3, 4), name: 'Busukuma Subcounty', district_id: WAKISO },
  { id: placeId(3, 5), name: 'Buwama Subcounty', district_id: placeId(2, 1) },
  { id: placeId(3, 6), name: 'Goma Division', district_id: MUKONO },
  { id: placeId(3, 7), name: 'Kasawo Subcounty', district_id: MUKONO },
  { id: placeId(3, 8), name: 'Bombo Town Council', district_id: placeId(2, 2) },
  { id: placeId(3, 9), name: 'Central Division (Kampala CCA)', district_id: KAMPALA },
  { id: placeId(3, 10), name: 'Kawempe Division', district_id: KAMPALA },
  { id: placeId(3, 11), name: 'Makindye Division', district_id: KAMPALA },
  { id: placeId(3, 12), name: 'Bungatira Subcounty', district_id: placeId(2, 3) },
  { id: placeId(3, 13), name: 'Buwenge Subcounty', district_id: placeId(2, 4) },
];

const subcounty = (n: number) => {
  const place = SUBCOUNTIES[n - 1];
  return place ? { id: place.id, name: place.name } : null;
};
const VHT = '5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

const ok = (data: unknown, status = 200): Reply => ({ status, body: { success: true, data } });
const fail = (status: number, message: string): Reply => ({
  status,
  body: { success: false, message },
});
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

let sequence = 0;
function uuid(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function hotspot(
  fields: Partial<Hotspot> & Pick<Hotspot, 'name' | 'status' | 'created_at'>,
): Hotspot {
  return {
    id: uuid(),
    type: null,
    village: null,
    contact_person_name: null,
    contact_person_telephone: null,
    has_condom_dispenser: null,
    dispenser_condition: null,
    latitude: null,
    longitude: null,
    comment: null,
    rejection_reason: null,
    district_id: WAKISO,
    subcounty: null,
    submitted_by_id: VHT,
    ...fields,
  };
}

function seedHotspots(dataset: string): Hotspot[] {
  if (dataset === 'empty') return [];
  const demo = [
    hotspot({
      name: 'Kajjansi Weekly Market',
      type: 'Market',
      village: 'Kajjansi',
      subcounty: subcounty(1),
      contact_person_name: 'Nansubuga Aisha',
      contact_person_telephone: '+256772555010',
      has_condom_dispenser: false,
      latitude: 0.2167,
      longitude: 32.55,
      status: 'submitted',
      created_at: daysAgo(1),
    }),
    hotspot({
      name: 'Bwebajja Nite Spot',
      type: 'Bar',
      village: 'Bwebajja',
      subcounty: subcounty(1),
      contact_person_name: 'Kato Musa',
      contact_person_telephone: '+256701333444',
      has_condom_dispenser: true,
      dispenser_condition: 'Poor',
      latitude: 0.2383,
      longitude: 32.5394,
      status: 'verified',
      created_at: daysAgo(4),
    }),
    hotspot({
      name: 'Kasenyi Landing Site',
      type: 'Landing site',
      village: 'Kasenyi',
      subcounty: subcounty(2),
      contact_person_name: 'Okello James',
      contact_person_telephone: '+256700000002',
      has_condom_dispenser: true,
      dispenser_condition: 'Good',
      latitude: 0.0831,
      longitude: 32.5806,
      status: 'active',
      created_at: daysAgo(30),
    }),
    hotspot({
      name: 'Nansana Taxi Park',
      type: 'Taxi park',
      village: 'Nansana',
      subcounty: subcounty(3),
      status: 'rejected',
      rejection_reason: 'Already registered as Nansana Stage.',
      created_at: daysAgo(12),
    }),
  ];
  if (dataset !== 'worst') return [...demo, ...mapHotspots()];
  // The values that break layouts come first, because the first rows are what is on screen.
  return [
    hotspot({ name: 'Unplaced hotspot', status: 'submitted', created_at: daysAgo(0) }),
    hotspot({
      name: 'Null Island',
      latitude: 0,
      longitude: 0,
      status: 'active',
      created_at: daysAgo(2),
    }),
    hotspot({
      name: 'A hotspot name that runs to forty chars',
      type: 'Lodge with a long type',
      village: 'Twenty-char village',
      comment: 'x'.repeat(100),
      latitude: 89.9,
      longitude: 179.9,
      status: 'verified',
      created_at: daysAgo(3),
    }),
    ...demo,
    ...mapHotspots(),
  ];
}

/*
 * A few hundred hotspots around five towns, for the map's clusters, heatmap and
 * filters. Generated from a fixed seed, so every run draws the same map. Wakiso
 * and Kampala are left alone: other screens' tests rely on what those hold.
 */
const MAP_TOWNS = [
  {
    district: placeId(2, 3),
    centre: [2.7746, 32.299],
    count: 90,
    villages: ['Laroo', 'Pece', 'Bardege', 'Layibi', 'Koro', 'Unyama', 'Awach', 'Bobi', 'Lalogi'],
  },
  {
    district: placeId(2, 4),
    centre: [0.4244, 33.2042],
    count: 110,
    villages: ['Bugembe', 'Walukuba', 'Masese', 'Mpumudde', 'Budondo', 'Kakira', 'Mafubira'],
  },
  {
    district: MUKONO,
    centre: [0.3533, 32.7553],
    count: 80,
    villages: ['Seeta', 'Namilyango', 'Goma', 'Kyetume', 'Nakisunga', 'Ntenjeru', 'Katosi'],
  },
  {
    district: placeId(2, 2),
    centre: [0.8492, 32.4731],
    count: 50,
    villages: ['Bombo', 'Wobulenzi', 'Kasana', 'Zirobwe', 'Kikyusa', 'Katikamu'],
  },
  {
    district: placeId(2, 1),
    centre: [0.225, 32.3136],
    count: 40,
    villages: ['Buwama', 'Kammengo', 'Nkozi', 'Kituntu', 'Muduuma'],
  },
] as const;

const VENUES = [
  'Bar',
  'Bar',
  'Lodge',
  'Guest House',
  'Boda Stage',
  'Landing Site',
  'Market',
  'Restaurant',
  'Massage Parlour',
  'Night Club',
  'New',
  'Old',
];
const CONTACTS = ['Achen Grace', 'Okot Denis', 'Nabirye Sarah', 'Waiswa Peter', 'Namubiru Joan'];

function mapHotspots(): Hotspot[] {
  // mulberry32: a tiny seeded generator.
  let seed = 20261121;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  // Points cluster around the town and a few trading centres near it.
  const spread = () => (random() + random() + random() - 1.5) * 0.09;

  // Two positions the map must not draw, as seen in real data: latitude and
  // longitude swapped, and a phone emulator's default location in California.
  const misplaced = [
    hotspot({
      name: 'Walukuba Lodge 111',
      type: 'Lodge',
      village: 'Walukuba',
      district_id: placeId(2, 4),
      latitude: 33.2042,
      longitude: 0.4244,
      status: 'active',
      created_at: daysAgo(90),
    }),
    hotspot({
      name: 'Kakira Market 112',
      type: 'Market',
      village: 'Kakira',
      district_id: placeId(2, 4),
      latitude: 37.4221,
      longitude: -122.0839,
      status: 'submitted',
      created_at: daysAgo(6),
    }),
  ];

  return MAP_TOWNS.flatMap((town) => {
    const centres = Array.from({ length: 4 }, () => [
      town.centre[0] + spread() * 2,
      town.centre[1] + spread() * 2,
    ]);
    return Array.from({ length: town.count }, (_, index) => {
      const village = pick(town.villages);
      const venue = pick(VENUES);
      const roll = random();
      const status: Status =
        roll < 0.78 ? 'active' : roll < 0.88 ? 'active' : roll < 0.96 ? 'submitted' : 'rejected';
      const has = random();
      const centre = index % 3 === 0 ? town.centre : pick(centres);
      const placed = random() > 0.08;
      return hotspot({
        name: `${village} ${venue === 'New' || venue === 'Old' ? 'Hotspot' : venue} ${String(index + 1)}`,
        type: venue,
        village,
        district_id: town.district,
        subcounty: null,
        contact_person_name: pick(CONTACTS),
        contact_person_telephone: `+2567${String(Math.floor(10_000_000 + random() * 89_999_999))}`,
        has_condom_dispenser: has < 0.4 ? true : has < 0.9 ? false : null,
        dispenser_condition: has < 0.4 ? pick(['Good', 'Good', 'Good', 'Poor', 'Broken']) : null,
        latitude: placed ? Number((centre[0] + spread()).toFixed(5)) : null,
        longitude: placed ? Number((centre[1] + spread()).toFixed(5)) : null,
        status,
        review_override: roll >= 0.78 && roll < 0.88 ? 'deactivated' : undefined,
        created_at: daysAgo(10 + Math.floor(random() * 700)),
      });
    });
  }).concat(misplaced);
}

const state = { hotspots: [] as Hotspot[], events: [] as HotspotEvent[] };

function record(target: Hotspot, action: string, createdAt: string): void {
  state.events.unshift({
    id: uuid(),
    hot_spot_id: target.id,
    action,
    status: target.status,
    created_at: createdAt,
  });
}

export function seedHotspotsMock(dataset: string): void {
  sequence = 0;
  state.hotspots = seedHotspots(dataset);
  state.events = [];
  for (const target of [...state.hotspots].reverse())
    record(target, 'submitted', target.created_at);
}

const text = (value: unknown, limit: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
};
const coordinate = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function submit(body: Body): Reply {
  const name = text(body.name, 40);
  if (!name) return fail(422, 'name is required');
  if (!DISTRICTS.some((district) => district.id === body.district_id)) {
    return fail(422, 'district_id must name a district');
  }
  const created = hotspot({
    name,
    district_id: String(body.district_id),
    type: text(body.type, 40),
    village: text(body.village, 20),
    contact_person_name: text(body.contact_person_name, 40),
    contact_person_telephone: text(body.contact_person_telephone, 15),
    has_condom_dispenser:
      typeof body.has_condom_dispenser === 'boolean' ? body.has_condom_dispenser : null,
    dispenser_condition:
      body.has_condom_dispenser === true ? text(body.dispenser_condition, 20) : null,
    latitude: coordinate(body.latitude),
    longitude: coordinate(body.longitude),
    comment: text(body.comment, 100),
    status: 'submitted',
    created_at: new Date().toISOString(),
  });
  state.hotspots.unshift(created);
  record(created, 'submitted', created.created_at);
  return ok(created, 201);
}

function act(id: string, action: string, body: Body): Reply {
  const transition = TRANSITIONS[action];
  if (!transition) return fail(404, 'unknown hotspot action');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
  if ((action === 'reject') !== Boolean(reason) || (reason && reason.length > 1000)) {
    return fail(
      422,
      'reject requires a reason of at most 1000 characters; other actions take no body',
    );
  }
  const target = state.hotspots.find((candidate) => candidate.id === id);
  if (!target) return fail(404, 'hotspot not found');
  if (!transition.from.includes(target.status)) {
    return fail(409, 'action is unavailable in the current hotspot state');
  }
  target.status = transition.to;
  if (action === 'reject') target.rejection_reason = reason;
  record(target, action, new Date().toISOString());
  return ok(target);
}

const REGION_OF = new Map(DISTRICTS_BY_REGION.map((place) => [place.id, place.region_id]));

/**
 * A hotspot as both the Go API sends it (`review_status`, nested `region`,
 * `district` and `contact_person`) and as the earlier screens read it (the review
 * step in `status`, flat contact fields), so either kind of screen works here.
 */
function present(item: Hotspot) {
  const district = DISTRICTS.find((place) => place.id === item.district_id) ?? null;
  const region = REGIONS.find((place) => place.id === REGION_OF.get(item.district_id)) ?? null;
  return {
    ...item,
    review_override: undefined,
    review_status: item.review_override ?? (item.status === 'verified' ? 'submitted' : item.status),
    region,
    district,
    contact_person: item.contact_person_name
      ? {
          id: `${item.id}-contact`,
          name: item.contact_person_name,
          phone_number: item.contact_person_telephone,
        }
      : null,
    updated_at: item.created_at,
  };
}

/** A page of hotspots, optionally one district's, as `GET /hotspots?district_id=&limit=&offset=`. */
function listHotspots(query: URLSearchParams): Reply {
  const districtId = query.get('district_id');
  const limit = Number(query.get('limit') ?? 50);
  const offset = Number(query.get('offset') ?? 0);
  const matching = districtId
    ? state.hotspots.filter((item) => item.district_id === districtId)
    : state.hotspots;
  return ok(matching.slice(offset, offset + limit).map(present));
}

/** `GET /hotspots/{id}`: the hotspot and its comment thread. */
function hotspotDetail(id: string): Reply {
  const target = state.hotspots.find((item) => item.id === id);
  if (!target) return fail(404, 'hotspot not found');
  const comments = [
    ...(target.comment
      ? [
          {
            id: `${id}-c1`,
            user_id: VHT,
            action: 'comment',
            comment: target.comment,
            created_at: target.created_at,
          },
        ]
      : []),
    ...(target.rejection_reason
      ? [
          {
            id: `${id}-c2`,
            user_id: null,
            action: 'rejected',
            comment: target.rejection_reason,
            created_at: target.created_at,
          },
        ]
      : []),
  ];
  return ok({ ...present(target), comments });
}

/** `GET /hotspots/{id}/events`: the hotspot's steps, oldest first. */
function hotspotEvents(id: string): Reply {
  if (!state.hotspots.some((item) => item.id === id)) return fail(404, 'hotspot not found');
  return ok(state.events.filter((event) => event.hot_spot_id === id).reverse());
}

/** Answers `GET /locations/regions`, `/districts?region_id=` and `/subcounties?district_id=`. */
function lookupLocations(kind: string | undefined, query: URLSearchParams): Reply {
  if (kind === 'regions') return ok(REGIONS);
  if (kind === 'districts') {
    const regionId = query.get('region_id');
    if (!regionId) return ok(DISTRICTS);
    return ok(
      DISTRICTS_BY_REGION.filter((place) => place.region_id === regionId).map(({ id, name }) => ({
        id,
        name,
      })),
    );
  }
  if (kind === 'subcounties') {
    const districtId = query.get('district_id');
    if (!districtId) return fail(400, 'district_id is required and must be a nonzero UUID');
    return ok(SUBCOUNTIES.filter((place) => place.district_id === districtId));
  }
  return fail(404, 'Not found');
}

/** Answers `/hotspots…` and `/locations…`, or returns null for any other path. */
export function handleHotspots(
  method: string,
  parts: string[],
  body: Body,
  query: URLSearchParams,
): Reply | null {
  const [resource, id, segment, action] = parts;
  if (resource === 'locations' && method === 'GET') return lookupLocations(id, query);
  if (resource !== 'hotspots') return null;
  if (method === 'GET' && id === undefined) return listHotspots(query);
  if (method === 'POST' && id === undefined) return submit(body);
  if (method === 'GET' && id === 'notifications') return ok(state.events);
  if (method === 'GET' && id && segment === undefined) return hotspotDetail(id);
  if (method === 'GET' && id && segment === 'events') return hotspotEvents(id);
  if (method === 'POST' && id && segment === 'actions' && action) return act(id, action, body);
  return fail(404, 'Not found');
}
