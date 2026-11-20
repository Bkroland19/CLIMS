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
  submitted_by_id: string;
  created_at: string;
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
const DISTRICTS = [
  { id: WAKISO, name: 'Wakiso' },
  { id: '0d6c4b1e-5a3f-4e2b-8c7d-9f1a2b3c4d5e', name: 'Mukono' },
  { id: '3e8a9b7c-6d5f-4a1b-9c2d-1e0f9a8b7c6d', name: 'Kampala' },
];
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
      status: 'rejected',
      rejection_reason: 'Already registered as Nansana Stage.',
      created_at: daysAgo(12),
    }),
  ];
  if (dataset !== 'worst') return demo;
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
  ];
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

/** Answers `/hotspots…`, or returns null for any other path. */
export function handleHotspots(method: string, parts: string[], body: Body): Reply | null {
  const [resource, id, segment, action] = parts;
  if (resource !== 'hotspots') return null;
  if (method === 'GET' && id === undefined) return ok(state.hotspots);
  if (method === 'POST' && id === undefined) return submit(body);
  if (method === 'GET' && id === 'notifications') return ok(state.events);
  if (method === 'GET' && id === 'districts') return ok(DISTRICTS);
  if (method === 'POST' && id && segment === 'actions' && action) return act(id, action, body);
  return fail(404, 'Not found');
}
