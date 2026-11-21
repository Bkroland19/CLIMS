/**
 * MOH administration resources for the mock API: users, roles and
 * permissions, the product catalogue, stores, geography and the audit log.
 *
 * Users, roles and permissions mirror the Go API exactly
 * (`backend/internal/features/{users,rbac}`): the same paths, UUID ids, the
 * `{ users, limit, offset }` page, role objects with permission codes, and
 * validation failures reported under Go field names
 * (`{ "Username": "failed on validation rule: min" }`).
 *
 * The catalogue, stores, geography and audit log are NOT YET IN THE GO API.
 * Their paths and shapes are the contract in `src/features/{catalogue,stores,audit}/api.ts`
 * (Phase 7 of `design/IMPLEMENTATION_PLAN.md`). Replies use the Go API's
 * `{ success, data }` envelope and `{ success: false, message, error }` failures.
 */

export interface Reply {
  status: number;
  body: unknown;
}

type Body = Record<string, unknown>;

interface Role {
  id: string;
  name: string;
  permissions: string[];
}

interface User {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  status: string;
  role_ids: string[];
  /** When they last signed in; null for an account never used. */
  last_login_at: string | null;
  login_count: number;
  created_at: string;
}

interface Unit {
  id: string;
  name: string;
  note: string | null;
}

interface Product {
  id: string;
  category: 'male' | 'female';
  brand: string;
  type: string;
  unit_id: string;
  pieces_per_unit: number;
  minimum_level: number | null;
  active: boolean;
}

interface Store {
  id: string;
  name: string;
  kind: 'national' | 'district';
  organisation: string | null;
  region: string | null;
  district: string | null;
  code: string;
  user_count: number;
  on_hand: { male: number; female: number };
  needs_confirmation: boolean;
}

interface Subcounty {
  id: string;
  name: string;
  facility_count: number;
  hotspot_count: number;
}
interface District {
  id: string;
  name: string;
  store_count: number;
  hotspot_count: number;
  subcounties: Subcounty[];
}
interface Region {
  id: string;
  name: string;
  district_count: number;
  districts: District[];
}
interface Geography {
  synced_at: string | null;
  counts: { regions: number; districts: number; subcounties: number; facilities: number };
  regions: Region[];
}

type AuditAction = 'created' | 'updated' | 'deleted';
interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  record_type: string;
  record_id: string;
  summary: string;
  changes: { field: string; old: string | null; new: string | null }[];
  source: string | null;
}

/** Who the mock says made a change; the mock sign-in is always this person. */
const ACTOR = 'Sarah Nakato';

const ok = (data: unknown, status = 200): Reply => ({ status, body: { success: true, data } });
const fail = (status: number, message: string, error?: Record<string, string>): Reply => ({
  status,
  body: error ? { success: false, message, error } : { success: false, message },
});

/** A stable UUID-shaped id, so links and tests can refer to records across restarts. */
function uuid(prefix: number, n: number): string {
  return `00000000-0000-4000-${String(8000 + prefix)}-${String(n).padStart(12, '0')}`;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** The Go API's permission catalogue, in the order `GET /permissions` lists it. */
export const PERMISSIONS = [
  'hotspots:activate',
  'hotspots:all_districts',
  'hotspots:read',
  'hotspots:submit',
  'inventory:manage',
  'inventory:read',
  'orders:all_stores',
  'orders:create',
  'orders:deliver',
  'orders:fulfill',
  'orders:process',
  'orders:read',
  'orders:receive',
  'orders:replenish',
  'orders:stockout',
  'roles:assign',
  'roles:manage',
  'roles:read',
  'users:create',
  'users:read',
  'users:update',
];

const ROLE_SEED: readonly [string, string[]][] = [
  ['admin', PERMISSIONS],
  ['moh', ['users:read', 'roles:read']],
  ['nms', []],
  ['jms', []],
  ['dfcp', ['users:read']],
  ['store incharge', []],
  ['hotspot manager', []],
  ['delivery agent', []],
  ['other supplier', []],
  ['healthy facility', []],
  ['vht', []],
];

function seedRoles(): Role[] {
  return ROLE_SEED.map(([name, permissions], index) => ({
    id: uuid(1, index + 1),
    name,
    permissions: [...permissions],
  }));
}

const roleId = (name: string) =>
  uuid(1, ROLE_SEED.findIndex(([candidate]) => candidate === name) + 1);

/** first, last, email, phone, roles, status */
const DEMO_USERS: readonly [string, string, string, string, string[], string][] = [
  ['Sarah', 'Nakato', 's.nakato@health.go.ug', '+256772100200', ['admin'], 'active'],
  ['Ruth', 'Akello', 'r.akello@health.go.ug', '+256772100201', ['moh'], 'active'],
  ['Sarah', 'Namubiru', 's.namubiru@wakiso.go.ug', '+256701220415', ['dfcp'], 'active'],
  ['Harriet', 'Achieng', 'h.achieng@mukono.go.ug', '+256782330118', ['dfcp'], 'active'],
  ['Denis', 'Okot', 'd.okot@gulu.go.ug', '+256772451090', ['dfcp'], 'active'],
  ['Daniel', 'Ochieng', 'd.ochieng@nms.go.ug', '+256772600118', ['nms'], 'active'],
  ['Paul', 'Ssekandi', 'p.ssekandi@jms.co.ug', '+256752118334', ['jms'], 'active'],
  [
    'Joseph',
    'Ssemwogerere',
    'j.ssemwogerere@example.org',
    '+256776902331',
    ['vht', 'hotspot manager'],
    'active',
  ],
  ['Grace', 'Nakato', 'g.nakato@example.org', '+256772418903', ['hotspot manager'], 'active'],
  ['Ronald', 'Kizza', 'r.kizza@example.org', '+256754220118', ['hotspot manager'], 'active'],
  ['Musa', 'Kato', 'm.kato@example.org', '+256701334920', ['delivery agent'], 'active'],
  ['Peter', 'Okello', 'p.okello@example.org', '+256782105447', ['delivery agent'], 'active'],
  ['Brian', 'Mugisha', 'b.mugisha@example.org', '+256759440812', ['delivery agent'], 'disabled'],
];

/** Days since each demo user last signed in, in `DEMO_USERS` order; null: never. */
const LAST_SEEN_DAYS: readonly (number | null)[] = [
  0,
  1,
  3,
  12,
  40,
  2,
  130,
  null,
  5,
  0,
  200,
  null,
  60,
];

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();

function seedUsers(dataset: string): User[] {
  if (dataset === 'empty') return [];
  const rows = DEMO_USERS.map(
    ([firstname, lastname, email, phone_number, roles, status], index) => ({
      last_login_at:
        LAST_SEEN_DAYS[index] === null ? null : daysAgo((LAST_SEEN_DAYS[index] ?? 0) + 0.2),
      login_count: LAST_SEEN_DAYS[index] === null ? 0 : 7 + ((index * 37) % 400),
      created_at: daysAgo(420 - index * 25),
      id: uuid(2, index + 1),
      username: `${firstname}.${lastname}`.toLowerCase(),
      email,
      firstname,
      lastname,
      phone_number,
      status,
      role_ids: roles.map(roleId),
    }),
  );
  if (dataset !== 'worst') return rows;
  return [
    {
      id: uuid(2, 900),
      username: 'averyveryveryverylongusernamethatdoesnotbreak',
      email:
        'an.unbreakably.long.email.address.for.testing.overflow@regional-referral-hospital.example.org',
      firstname: 'Wolfeschlegelstei',
      lastname: 'Kyomuhendo-Tibamwe',
      phone_number: '',
      status: 'disabled',
      role_ids: ROLE_SEED.map(([name]) => roleId(name)),
      last_login_at: daysAgo(3650),
      login_count: 1_234_567,
      created_at: daysAgo(4000),
    },
    {
      id: uuid(2, 901),
      username: 'x',
      email: 'x@example.org',
      firstname: '',
      lastname: '',
      phone_number: '+256700000000',
      status: 'active',
      role_ids: [],
      last_login_at: null,
      login_count: 0,
      created_at: daysAgo(0),
    },
    ...rows,
  ];
}

function seedUnits(dataset: string): Unit[] {
  if (dataset === 'empty') return [];
  return [
    {
      id: 'unit-piece',
      name: 'Piece',
      note: 'A single condom. Every order and stock count uses this.',
    },
    { id: 'unit-box', name: 'Box', note: 'Retail box' },
    { id: 'unit-carton', name: 'Carton', note: 'Shipping carton from the warehouse' },
  ];
}

function seedProducts(dataset: string): Product[] {
  if (dataset === 'empty') return [];
  const product = (
    n: number,
    category: Product['category'],
    brand: string,
    unit_id: string,
    pieces_per_unit: number,
    minimum_level: number | null,
    active = true,
    type = 'Standard',
  ): Product => ({
    id: `CND-${String(n).padStart(3, '0')}`,
    category,
    brand,
    type,
    unit_id,
    pieces_per_unit,
    minimum_level,
    active,
  });
  const rows = [
    product(1, 'male', 'Engabu', 'unit-piece', 1, 5000),
    product(2, 'male', 'Engabu', 'unit-box', 144, null),
    product(3, 'male', 'Engabu', 'unit-carton', 4320, null),
    product(4, 'female', 'FC2', 'unit-piece', 1, 500),
    product(5, 'female', 'FC2', 'unit-box', 100, null),
    product(6, 'male', 'Protector Plus', 'unit-piece', 1, null, false, 'Studded'),
  ];
  if (dataset === 'worst') {
    rows.unshift(
      product(
        99,
        'female',
        'A brand name long enough to wrap the cell several',
        'unit-carton',
        99999,
        9999999,
        true,
        'Ultra-thin extra-lubricated',
      ),
    );
  }
  return rows;
}

function seedStores(dataset: string): Store[] {
  if (dataset === 'empty') return [];
  const district = (
    id: string,
    name: string,
    region: string,
    code: string,
    user_count: number,
    male: number,
    female: number,
  ): Store => ({
    id,
    name: `${name} district store`,
    kind: 'district',
    organisation: null,
    region,
    district: name,
    code,
    user_count,
    on_hand: { male, female },
    needs_confirmation: false,
  });
  return [
    {
      id: 'store-jms',
      name: 'JMS · Kampala',
      kind: 'national',
      organisation: 'Joint Medical Store',
      region: 'Central',
      district: 'Kampala',
      code: 'jms',
      user_count: 1,
      on_hand: { male: 1_840_000, female: 52_000 },
      needs_confirmation: false,
    },
    {
      id: 'store-nms',
      name: 'NMS · Entebbe',
      kind: 'national',
      organisation: 'National Medical Stores',
      region: 'Central',
      district: 'Wakiso',
      code: 'nms',
      user_count: 1,
      on_hand: { male: 2_960_000, female: 118_000 },
      needs_confirmation: true,
    },
    district('store-wakiso', 'Wakiso', 'Central', 'aXmBzv61LbM', 4, 14_400, 600),
    district('store-mukono', 'Mukono', 'Central', 'ccs8Ldr4qRf', 1, 3_900, 210),
    district('store-gulu', 'Gulu', 'Northern', 'x75Yh65MaUa', 1, 7_250, 0),
    district('store-mbarara', 'Mbarara', 'Western', 'ztIyIYAzFKp', 0, 11_600, 540),
  ];
}

function seedGeography(dataset: string): Geography {
  if (dataset === 'empty') {
    return {
      synced_at: null,
      counts: { regions: 0, districts: 0, subcounties: 0, facilities: 0 },
      regions: [],
    };
  }
  const sub = (id: string, name: string, facility_count: number, hotspot_count = 0): Subcounty => ({
    id,
    name,
    facility_count,
    hotspot_count,
  });
  const today6am = new Date();
  today6am.setUTCHours(3, 0, 0, 0); // 06:00 in Kampala
  return {
    synced_at: today6am.toISOString(),
    counts: { regions: 4, districts: 146, subcounties: 2184, facilities: 7412 },
    regions: [
      {
        id: 'region-central',
        name: 'Central',
        district_count: 27,
        districts: [
          {
            id: 'district-wakiso',
            name: 'Wakiso',
            store_count: 1,
            hotspot_count: 9,
            subcounties: [
              sub('sc-katabi', 'Katabi TC', 14, 3),
              sub('sc-kajjansi', 'Kajjansi TC', 11, 2),
              sub('sc-nansana', 'Nansana Municipality', 22, 2),
              sub('sc-kira', 'Kira Municipality', 19, 1),
              sub('sc-ssisa', 'Ssisa', 9, 1),
              sub('sc-busukuma', 'Busukuma', 7),
            ],
          },
          {
            id: 'district-kampala',
            name: 'Kampala',
            store_count: 0,
            hotspot_count: 0,
            subcounties: [
              sub('sc-central', 'Central Division', 41),
              sub('sc-kawempe', 'Kawempe Division', 58),
            ],
          },
          {
            id: 'district-mukono',
            name: 'Mukono',
            store_count: 1,
            hotspot_count: 0,
            subcounties: [sub('sc-mukono', 'Mukono Municipality', 18), sub('sc-goma', 'Goma', 12)],
          },
        ],
      },
      {
        id: 'region-eastern',
        name: 'Eastern',
        district_count: 43,
        districts: [
          {
            id: 'district-mbale',
            name: 'Mbale',
            store_count: 0,
            hotspot_count: 0,
            subcounties: [sub('sc-industrial', 'Industrial Division', 16)],
          },
        ],
      },
      {
        id: 'region-northern',
        name: 'Northern',
        district_count: 41,
        districts: [
          {
            id: 'district-gulu',
            name: 'Gulu',
            store_count: 1,
            hotspot_count: 0,
            subcounties: [sub('sc-bardege', 'Bardege-Layibi Division', 13)],
          },
        ],
      },
      {
        id: 'region-western',
        name: 'Western',
        district_count: 35,
        districts: [
          {
            id: 'district-mbarara',
            name: 'Mbarara',
            store_count: 1,
            hotspot_count: 0,
            subcounties: [sub('sc-kakoba', 'Kakoba Division', 15)],
          },
        ],
      },
    ],
  };
}

function seedAudit(dataset: string): AuditEntry[] {
  if (dataset === 'empty') return [];
  let n = 0;
  const entry = (
    minutes: number,
    actor: string,
    action: AuditAction,
    record_type: string,
    record_id: string,
    summary: string,
    changes: AuditEntry['changes'] = [],
  ): AuditEntry => {
    n += 1;
    return {
      id: `audit-${String(n).padStart(4, '0')}`,
      at: minutesAgo(minutes),
      actor,
      action,
      record_type,
      record_id,
      summary,
      changes,
      source: actor === 'System' ? null : 'Chrome on Android',
    };
  };
  const status = (old: string | null, next: string) => [{ field: 'order_status', old, new: next }];
  return [
    entry(
      12,
      'Sarah Namubiru',
      'updated',
      'order',
      'ORD-1042',
      'Confirmed the order',
      status('review', 'confirmed'),
    ),
    entry(
      25,
      'Grace Nakato',
      'created',
      'order',
      'ORD-1043',
      'Notified a stockout at Kireka Truck Stop Lodge',
    ),
    entry(
      48,
      'Sarah Namubiru',
      'updated',
      'order',
      'ORD-1039',
      'Put on hold: not enough female condoms',
      status('review', 'on_hold'),
    ),
    entry(
      70,
      'Musa Kato',
      'updated',
      'order',
      'ORD-1036',
      'Delivered to the hotspot',
      status('in_transit', 'delivered'),
    ),
    entry(
      95,
      'Daniel Ochieng',
      'updated',
      'warehouse_order',
      'WR-2207',
      'Accepted the district request',
      [{ field: 'request_status', old: 'sent', new: 'queued' }],
    ),
    entry(
      130,
      'Sarah Namubiru',
      'created',
      'warehouse_order',
      'WR-2208',
      'Requested stock from NMS',
    ),
    entry(200, 'Joseph Ssemwogerere', 'created', 'hotspot', 'HS-0231', 'Mapped and activated', [
      { field: 'status', old: null, new: 'active' },
    ]),
    entry(
      360,
      'System',
      'updated',
      'hotspot',
      'HS-0198',
      'Marked inactive after 60 days without an order',
      [{ field: 'status', old: 'active', new: 'inactive' }],
    ),
    entry(
      1_440 + 300,
      'Ruth Akello',
      'updated',
      'role',
      'dfcp',
      'Granted “List users and view user accounts”',
      [{ field: 'permission', old: null, new: 'users:read' }],
    ),
    entry(
      1_440 * 6,
      'Ruth Akello',
      'created',
      'user',
      'Grace Nakato',
      'Created as hotspot manager',
      [{ field: 'status', old: null, new: 'active' }],
    ),
    entry(
      1_440 * 18,
      'Sarah Namubiru',
      'updated',
      'user',
      'Brian Mugisha',
      'Deactivated: left the rider pool',
      [{ field: 'status', old: 'active', new: 'disabled' }],
    ),
    entry(1_440 * 20, 'Ruth Akello', 'updated', 'product', 'CND-006', 'Deactivated', [
      { field: 'active', old: 'true', new: 'false' },
    ]),
    entry(
      1_440 * 25,
      'Ruth Akello',
      'deleted',
      'unit',
      'Dozen',
      'Removed unit of measure “Dozen”, used by no product',
    ),
    entry(
      1_440 * 31,
      'Sarah Namubiru',
      'created',
      'monthly_report',
      'RPT-2609-WAK',
      'Submitted the September report',
    ),
  ];
}

/** One server session, in the shape `GET /auth/sessions` and `GET /users/:id/sessions` reply with. */
interface DeviceSession {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  refreshed_at: string | null;
  refresh_count: number;
  current: boolean;
}

const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'okhttp/4.12.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
] as const;

const DAY_MS = 24 * 60 * 60_000;

function deviceSession(
  n: number,
  agent: string | null,
  ip: string | null,
  startedMinutesAgo: number,
  seenMinutesAgo: number,
  current = false,
): DeviceSession {
  const created = Date.now() - startedMinutesAgo * 60_000;
  return {
    id: uuid(3, n),
    user_agent: agent,
    ip_address: ip,
    created_at: new Date(created).toISOString(),
    last_seen_at: minutesAgo(seenMinutesAgo),
    expires_at: new Date(created + 30 * DAY_MS).toISOString(),
    revoked_at: null,
    refreshed_at: null,
    refresh_count: 0,
    current,
  };
}

/** The signed-in mock user's own devices: this browser, a phone, and one already signed out. */
function seedMySessions(dataset: string): DeviceSession[] {
  const current = deviceSession(1, null, '127.0.0.1', 5, 0, true);
  if (dataset === 'empty') return [current];
  const signedOut = deviceSession(3, AGENTS[2], '102.85.14.7', 4 * 1440, 3 * 1440);
  signedOut.revoked_at = minutesAgo(3 * 1440);
  return [current, deviceSession(2, AGENTS[1], '41.210.143.92', 2 * 1440, 95), signedOut];
}

/** Other users' devices: active accounts hold up to two, by position in the list. */
function seedUserSessions(users: readonly User[], dataset: string): Map<string, DeviceSession[]> {
  const sessions = new Map<string, DeviceSession[]>();
  users.forEach((user, index) => {
    if (user.status !== 'active' || index % 3 === 2) return;
    const count = index % 3 === 0 ? 2 : 1;
    const list = Array.from({ length: count }, (_, k) => {
      const n = 100 + index * 2 + k;
      const agent =
        dataset === 'worst' && k === 0 ? 'x'.repeat(300) : AGENTS[(index + k) % AGENTS.length];
      return deviceSession(
        n,
        agent ?? null,
        k === 0 ? `41.210.${index}.${k + 10}` : null,
        (index + 1) * 300,
        (index + 1) * 17,
      );
    });
    sessions.set(user.id, list);
  });
  return sessions;
}

const state = {
  roles: seedRoles(),
  users: [] as User[],
  mySessions: [] as DeviceSession[],
  userSessions: new Map<string, DeviceSession[]>(),
  units: [] as Unit[],
  products: [] as Product[],
  stores: [] as Store[],
  geography: seedGeography('demo'),
  audit: [] as AuditEntry[],
  nextId: 1000,
};

export function seedAdmin(dataset: string): void {
  state.roles = seedRoles();
  state.users = seedUsers(dataset);
  state.mySessions = seedMySessions(dataset);
  state.userSessions = seedUserSessions(state.users, dataset);
  state.units = seedUnits(dataset);
  state.products = seedProducts(dataset);
  state.stores = seedStores(dataset);
  state.geography = seedGeography(dataset);
  state.audit = seedAudit(dataset);
}

function record(
  action: AuditAction,
  record_type: string,
  record_id: string,
  summary: string,
  changes: AuditEntry['changes'] = [],
): void {
  state.nextId += 1;
  state.audit.unshift({
    id: `audit-${state.nextId}`,
    at: new Date().toISOString(),
    actor: ACTOR,
    action,
    record_type,
    record_id,
    summary,
    changes,
    source: 'Mock API',
  });
}

// ---------------------------------------------------------------- users & roles (Go shapes)

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function userView(user: User) {
  const roles = state.roles.filter((role) => user.role_ids.includes(role.id));
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    phone_number: user.phone_number,
    status: user.status,
    last_login_at: user.last_login_at,
    login_count: user.login_count,
    active_sessions: (state.userSessions.get(user.id) ?? []).filter(
      (session) => !session.revoked_at && session.expires_at > new Date().toISOString(),
    ).length,
    created_at: user.created_at,
    role: roles[0] ?? null,
    roles,
  };
}

const adminRoleId = () => state.roles.find((role) => role.name === 'admin')?.id ?? '';
const activeAdmins = () =>
  state.users.filter((user) => user.status === 'active' && user.role_ids.includes(adminRoleId()));

/** Mirrors `validator.Validate.Struct` on `CreateUserRequest`. */
function validateNewUser(body: Body): Record<string, string> {
  const errors: Record<string, string> = {};
  const rule = (field: string, tag: string) => {
    errors[field] ??= `failed on validation rule: ${tag}`;
  };
  const username = text(body.username).trim();
  const email = text(body.email).trim();
  const password = text(body.password);
  if (!username) rule('Username', 'required');
  else if (username.length < 3) rule('Username', 'min');
  else if (username.length > 50) rule('Username', 'max');
  if (!email) rule('Email', 'required');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rule('Email', 'email');
  else if (email.length > 255) rule('Email', 'max');
  if (!password) rule('Password', 'required');
  else if (password.length < 8) rule('Password', 'min');
  else if (password.length > 72) rule('Password', 'max');
  if (text(body.firstname).length > 20) rule('Firstname', 'max');
  if (text(body.lastname).length > 20) rule('Lastname', 'max');
  if (text(body.phone_number).length > 15) rule('Phone', 'max');
  const roleIds = body.role_ids;
  if (roleIds !== undefined && roleIds !== null) {
    if (!Array.isArray(roleIds) || roleIds.length < 1) rule('RoleIDs', 'min');
    else if (!roleIds.every(isUuid)) rule('RoleIDs', 'uuid_rfc4122');
  }
  return errors;
}

function handleUsers(
  method: string,
  id: string | undefined,
  sub: string | undefined,
  body: Body,
  query: URLSearchParams,
): Reply {
  if (!id) {
    if (method === 'GET') {
      const limit = Number(query.get('limit') ?? 50);
      const offset = Number(query.get('offset') ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        return fail(400, 'limit must be between 1 and 100');
      if (!Number.isInteger(offset) || offset < 0) return fail(400, 'offset must be nonnegative');
      return ok({ users: state.users.slice(offset, offset + limit).map(userView), limit, offset });
    }
    if (method !== 'POST') return fail(405, 'Method not allowed');
    const errors = validateNewUser(body);
    if (Object.keys(errors).length > 0) return fail(422, 'validation failed', errors);
    const roleIds = Array.isArray(body.role_ids)
      ? body.role_ids.filter((value): value is string => typeof value === 'string')
      : body.role_id
        ? [text(body.role_id)]
        : null;
    if (!roleIds) return fail(422, 'provide either role_id or role_ids');
    if (!roleIds.every((roleIdValue) => state.roles.some((role) => role.id === roleIdValue))) {
      return fail(422, 'unknown role_id');
    }
    const email = text(body.email).trim().toLowerCase();
    if (state.users.some((user) => user.email.toLowerCase() === email)) {
      return fail(409, 'email already exists');
    }
    state.nextId += 1;
    const user: User = {
      id: uuid(2, state.nextId),
      username: text(body.username).trim(),
      email,
      firstname: text(body.firstname),
      lastname: text(body.lastname),
      phone_number: text(body.phone_number),
      status: 'active',
      role_ids: roleIds,
      last_login_at: null,
      login_count: 0,
      created_at: new Date().toISOString(),
    };
    state.users.push(user);
    const names = state.roles.filter((role) => roleIds.includes(role.id)).map((role) => role.name);
    record(
      'created',
      'user',
      `${user.firstname} ${user.lastname}`.trim() || user.username,
      `Created as ${names.join(', ')}`,
      [{ field: 'status', old: null, new: 'active' }],
    );
    return ok({ user_id: user.id }, 201);
  }

  if (!isUuid(id)) return fail(400, 'invalid id');
  const user = state.users.find((candidate) => candidate.id === id);
  if (method === 'GET' && !sub)
    return user ? ok(userView(user)) : fail(404, 'user or role not found');
  if (!user) return fail(404, 'user or role not found');
  const name = `${user.firstname} ${user.lastname}`.trim() || user.username;

  if (sub === 'roles' && method === 'PUT') {
    const roleIds = body.role_ids;
    if (!Array.isArray(roleIds))
      return fail(422, 'validation failed', { RoleIDs: 'failed on validation rule: required' });
    if (!roleIds.every(isUuid))
      return fail(422, 'validation failed', { RoleIDs: 'failed on validation rule: uuid_rfc4122' });
    const ids = roleIds.filter((value): value is string => typeof value === 'string');
    if (!ids.every((value) => state.roles.some((role) => role.id === value)))
      return fail(422, 'unknown role');
    const losesAdmin = user.role_ids.includes(adminRoleId()) && !ids.includes(adminRoleId());
    if (losesAdmin && user.status === 'active' && activeAdmins().length <= 1) {
      return fail(409, 'cannot disable or demote the last active admin');
    }
    const roleNames = (list: string[]) =>
      state.roles
        .filter((role) => list.includes(role.id))
        .map((role) => role.name)
        .join(', ') || null;
    record('updated', 'user', name, 'Changed roles', [
      { field: 'roles', old: roleNames(user.role_ids), new: roleNames(ids) },
    ]);
    user.role_ids = ids;
    return ok(null);
  }

  if (sub === 'sessions') {
    const now = new Date().toISOString();
    const sessions = state.userSessions.get(user.id) ?? [];
    if (method === 'GET') return ok(sessions.filter((session) => session.expires_at > now));
    if (method !== 'DELETE') return fail(405, 'Method not allowed');
    const live = sessions.filter((session) => !session.revoked_at && session.expires_at > now);
    for (const session of live) session.revoked_at = now;
    if (live.length > 0) {
      record('updated', 'user', name, 'Signed out everywhere', [
        { field: 'sessions', old: String(live.length), new: '0' },
      ]);
    }
    return ok({ revoked: live.length });
  }

  if (sub === 'status' && method === 'PATCH') {
    const status = body.status;
    if (status !== 'active' && status !== 'disabled') {
      return fail(422, 'validation failed', { Status: 'failed on validation rule: oneof' });
    }
    if (
      status === 'disabled' &&
      user.status === 'active' &&
      user.role_ids.includes(adminRoleId()) &&
      activeAdmins().length <= 1
    ) {
      return fail(409, 'cannot disable or demote the last active admin');
    }
    record('updated', 'user', name, status === 'active' ? 'Reactivated' : 'Deactivated', [
      { field: 'status', old: user.status, new: status },
    ]);
    user.status = status;
    return ok(null);
  }

  return fail(405, 'Method not allowed');
}

function handleRoles(
  method: string,
  id: string | undefined,
  sub: string | undefined,
  body: Body,
): Reply {
  if (!id) return method === 'GET' ? ok(state.roles) : fail(405, 'Method not allowed');
  if (sub !== 'permissions' || method !== 'PUT') return fail(405, 'Method not allowed');
  if (!isUuid(id)) return fail(400, 'invalid id');
  const role = state.roles.find((candidate) => candidate.id === id);
  if (!role) return fail(404, 'user or role not found');
  const permissions = body.permissions;
  if (!Array.isArray(permissions)) return fail(422, 'permissions must be an array');
  if (permissions.length > 100) return fail(422, 'too many permissions');
  if (role.name === 'admin') return fail(409, 'admin permissions cannot be changed');
  const codes = permissions.filter((value): value is string => typeof value === 'string');
  if (!codes.every((code) => PERMISSIONS.includes(code))) return fail(422, 'unknown permission');
  const granted = codes.filter((code) => !role.permissions.includes(code));
  const revoked = role.permissions.filter((code) => !codes.includes(code));
  for (const code of granted)
    record('updated', 'role', role.name, `Granted ${code}`, [
      { field: 'permission', old: null, new: code },
    ]);
  for (const code of revoked)
    record('updated', 'role', role.name, `Revoked ${code}`, [
      { field: 'permission', old: code, new: null },
    ]);
  role.permissions = [...new Set(codes)];
  return ok(null);
}

// ---------------------------------------------------------------- catalogue (NOT YET IN THE GO API)

function productView(product: Product) {
  const unit = state.units.find((candidate) => candidate.id === product.unit_id);
  const { unit_id, ...rest } = product;
  return { ...rest, unit: { id: unit_id, name: unit?.name ?? unit_id } };
}

function unitView(unit: Unit) {
  return {
    ...unit,
    product_count: state.products.filter((product) => product.unit_id === unit.id).length,
  };
}

const wholeNumber = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;

function handleCatalogue(
  method: string,
  kind: string | undefined,
  id: string | undefined,
  body: Body,
): Reply {
  if (kind === 'units') {
    if (id) return fail(405, 'Method not allowed');
    if (method === 'GET') return ok(state.units.map(unitView));
    if (method !== 'POST') return fail(405, 'Method not allowed');
    const name = text(body.name).trim();
    const note = text(body.note).trim();
    const errors: Record<string, string> = {};
    if (name.length < 2) errors.name = 'Use at least 2 characters.';
    else if (name.length > 40) errors.name = 'Use at most 40 characters.';
    if (note.length > 120) errors.note = 'Use at most 120 characters.';
    if (Object.keys(errors).length > 0) return fail(422, 'validation failed', errors);
    if (state.units.some((unit) => unit.name.toLowerCase() === name.toLowerCase())) {
      return fail(409, 'A unit with this name already exists.', {
        name: 'A unit with this name already exists.',
      });
    }
    state.nextId += 1;
    const unit: Unit = { id: `unit-${state.nextId}`, name, note: note || null };
    state.units.push(unit);
    record('created', 'unit', name, `Added unit of measure “${name}”`);
    return ok(unitView(unit), 201);
  }

  if (kind !== 'products') return fail(404, 'Not found');
  if (!id) {
    if (method === 'GET') return ok(state.products.map(productView));
    if (method !== 'POST') return fail(405, 'Method not allowed');
    const errors: Record<string, string> = {};
    const brand = text(body.brand).trim();
    const type = text(body.type).trim();
    if (body.category !== 'male' && body.category !== 'female')
      errors.category = 'Choose a category.';
    if (!brand || brand.length > 60) errors.brand = 'Enter a brand of at most 60 characters.';
    if (!type || type.length > 60) errors.type = 'Enter a type of at most 60 characters.';
    if (!state.units.some((unit) => unit.id === body.unit_id))
      errors.unit_id = 'Choose a unit of measure.';
    const per = wholeNumber(body.pieces_per_unit, 1, 100_000);
    if (per === null) errors.pieces_per_unit = 'Use a whole number from 1 to 100,000.';
    const minimum =
      body.minimum_level === null ? null : wholeNumber(body.minimum_level, 0, 10_000_000);
    if (body.minimum_level !== null && minimum === null)
      errors.minimum_level = 'Use a whole number from 0 to 10,000,000.';
    if (Object.keys(errors).length > 0 || per === null)
      return fail(422, 'validation failed', errors);
    state.nextId += 1;
    const product: Product = {
      id: `CND-${String(state.products.length + 1).padStart(3, '0')}`,
      category: body.category === 'female' ? 'female' : 'male',
      brand,
      type,
      unit_id: text(body.unit_id),
      pieces_per_unit: per,
      minimum_level: minimum,
      active: true,
    };
    while (state.products.some((existing) => existing.id === product.id)) {
      state.nextId += 1;
      product.id = `CND-${state.nextId}`;
    }
    state.products.push(product);
    const view = productView(product);
    record(
      'created',
      'product',
      product.id,
      `${brand} · ${type} (${view.unit.name}, ${per} per unit)`,
    );
    return ok(view, 201);
  }

  const product = state.products.find((candidate) => candidate.id === id);
  if (!product) return fail(404, 'product not found');
  if (method !== 'PATCH') return fail(405, 'Method not allowed');
  if (typeof body.active !== 'boolean')
    return fail(422, 'validation failed', { active: 'Must be true or false.' });
  if (product.active !== body.active) {
    record('updated', 'product', product.id, body.active ? 'Activated' : 'Deactivated', [
      { field: 'active', old: String(product.active), new: String(body.active) },
    ]);
    product.active = body.active;
  }
  return ok(productView(product));
}

// ---------------------------------------------------------------- the signed-in user (Go shapes)

/**
 * The account every mock sign-in opens: an administrator holding every
 * permission, in the shape `POST /auth/login` and `GET /auth/me` send.
 * `email` is what the visitor typed when it looks like an address.
 */
export function signedInUser(email: string | null = null) {
  const admin = state.roles.find((role) => role.name === 'admin') ?? null;
  return {
    id: 1,
    username: 'sarah.nakato',
    firstname: 'Sarah',
    lastname: 'Nakato',
    email,
    status: 'active',
    role: admin,
    roles: admin ? [admin] : [],
  };
}

/**
 * `GET /auth/me`, `GET /auth/sessions` and `DELETE /auth/sessions/:id`; null for any other path.
 * `userAgent` is the request's, recorded on the current session as the server does at sign-in.
 */
export function handleAuth(
  method: string,
  parts: readonly string[],
  userAgent: string | null = null,
): Reply | null {
  const [resource, first, second] = parts;
  if (resource !== 'auth') return null;
  if (first === 'me' && method === 'GET') return ok(signedInUser());
  if (first !== 'sessions') return null;
  const now = new Date().toISOString();
  if (!second) {
    if (method !== 'GET') return fail(405, 'Method not allowed');
    const current = state.mySessions.find((session) => session.current);
    if (current && userAgent) current.user_agent = userAgent;
    return ok(state.mySessions.filter((session) => session.expires_at > now));
  }
  if (method !== 'DELETE') return fail(405, 'Method not allowed');
  if (!isUuid(second)) return fail(400, 'invalid id');
  const session = state.mySessions.find(
    (candidate) => candidate.id === second && !candidate.revoked_at && candidate.expires_at > now,
  );
  if (!session) return fail(404, 'session not found');
  session.revoked_at = now;
  return ok(null);
}

// ---------------------------------------------------------------- entry point

const RESOURCES = new Set([
  'users',
  'roles',
  'permissions',
  'catalogue',
  'stores',
  'geography',
  'audit-log',
]);

/**
 * Answers a request for one of the administration resources, or returns null
 * when the path is not one of them. `parts` is the path after `/api/v1`, split
 * on `/`; `query` is the request's query string.
 */
export function handleAdmin(
  method: string,
  parts: readonly string[],
  body: Body,
  query: URLSearchParams = new URLSearchParams(),
): Reply | null {
  const [resource = '', first, second] = parts;
  if (!RESOURCES.has(resource)) return null;
  switch (resource) {
    case 'users':
      return handleUsers(method, first, second, body, query);
    case 'roles':
      return handleRoles(method, first, second, body);
    case 'permissions':
      return method === 'GET' ? ok(PERMISSIONS) : fail(405, 'Method not allowed');
    case 'catalogue':
      return handleCatalogue(method, first, second, body);
    case 'stores':
      return method === 'GET' && !first ? ok(state.stores) : fail(405, 'Method not allowed');
    case 'geography':
      if (first === 'sync' && method === 'POST') {
        state.geography.synced_at = new Date().toISOString();
        return ok({ synced_at: state.geography.synced_at, changes: 0 });
      }
      return method === 'GET' && !first ? ok(state.geography) : fail(405, 'Method not allowed');
    default: {
      if (method !== 'GET') return fail(405, 'Method not allowed');
      const type = query.get('record_type');
      const action = query.get('action');
      return ok(
        state.audit
          .filter(
            (entry) =>
              (!type || entry.record_type === type) && (!action || entry.action === action),
          )
          .sort((a, b) => b.at.localeCompare(a.at)),
      );
    }
  }
}
