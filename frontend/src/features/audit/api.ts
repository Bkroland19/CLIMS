import { z } from 'zod';

import { parseList, type HttpClient } from '@/lib/api';

/*
 * The audit log: who did what, to which record, what changed, and from where
 * (`backend/internal/features/audit`, `docs/modules/audit.md`).
 *
 *   GET /audit?domain=&exclude_domain=&outcome=&actor_id=&subject_type=&subject_id=&from=&to=&limit=&offset=
 *     → AuditEntry[], newest first. Needs `audit:read`.
 *
 * Every search is itself recorded as `audit.searched`.
 */

export const PAGE_SIZE = 50;

const subjectSchema = z.object({ type: z.string(), id: z.string() });
export type AuditSubject = z.infer<typeof subjectSchema>;

const changeSchema = z.object({ before: z.unknown(), after: z.unknown() });

const entrySchema = z.object({
  id: z.string(),
  /** When it happened, RFC 3339. */
  occurred_at: z.string(),
  /** `<domain>.<event>`, e.g. `hotspot.activated`. */
  action: z.string(),
  outcome: z.enum(['success', 'failure']),
  /** Why it failed, e.g. `wrong_password`. */
  reason: z.string().nullable(),
  /** The signed-in user as they were at the time; null for a system actor or nobody. */
  actor: z
    .object({
      id: z.string(),
      username: z.string().nullable(),
      roles: z.array(z.string()).nullable(),
    })
    .nullable(),
  /** A named job or service client, e.g. `create-admin`. */
  system_actor: z.string().nullable(),
  /** The record acted on. */
  target: subjectSchema.nullable(),
  /** The target and every related record. */
  subjects: z.array(subjectSchema),
  /** The fields that changed, before and after. */
  changes: z.record(z.string(), changeSchema).nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  request_id: z.string().nullable(),
  session_id: z.string().nullable(),
});

export type AuditEntry = z.infer<typeof entrySchema>;

// ---------------------------------------------------------------- areas

/** The page's areas, each one or more action domains (the part before the dot). */
const AREA_DOMAINS = {
  auth: ['auth'],
  access: ['user', 'role', 'access'],
  hotspots: ['hotspot'],
  orders: ['order', 'stockout'],
  inventory: ['inventory'],
  catalogue: ['product', 'brand', 'product_type', 'unit_of_measure'],
  audit: ['audit'],
} as const satisfies Record<string, readonly string[]>;

export type AuditArea = keyof typeof AREA_DOMAINS | 'other';

export const AUDIT_AREAS: readonly AuditArea[] = [
  'auth',
  'access',
  'hotspots',
  'orders',
  'inventory',
  'catalogue',
  'audit',
  'other',
];

const AREA_LABELS: Record<AuditArea, string> = {
  auth: 'Sign-in',
  access: 'Accounts & access',
  hotspots: 'Hotspots',
  orders: 'Orders',
  inventory: 'Inventory',
  catalogue: 'Catalogue',
  audit: 'Audit log reads',
  other: 'Other',
};

export function areaLabel(area: AuditArea): string {
  return AREA_LABELS[area];
}

const KNOWN_DOMAINS = Object.values(AREA_DOMAINS).flat();

export const AUDIT_OUTCOMES = ['success', 'failure'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

// ---------------------------------------------------------------- searching

export interface AuditFilters {
  /** Null is every area except reads of the log itself. */
  area: AuditArea | null;
  outcome: AuditOutcome | null;
  /** First day shown, `YYYY-MM-DD` in the browser's time zone. */
  from: string | null;
  /** Last day shown, inclusive. */
  to: string | null;
  /** A user's ID. */
  actor: string | null;
  /** One record: its target or related-record entries. */
  subject: AuditSubject | null;
}

export const NO_FILTERS: AuditFilters = {
  area: null,
  outcome: null,
  from: null,
  to: null,
  actor: null,
  subject: null,
};

/** The start of a local day as an RFC 3339 time, or null for a malformed date. */
export function startOfDay(date: string, plusDays = 0): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + plusDays);
  return Number.isNaN(day.getTime()) ? null : day.toISOString();
}

/** The API query for a set of filters and a page. */
export function auditQuery(filters: AuditFilters, offset = 0): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.area === null) params.set('exclude_domain', 'audit');
  else if (filters.area === 'other') params.set('exclude_domain', KNOWN_DOMAINS.join(','));
  else params.set('domain', AREA_DOMAINS[filters.area].join(','));
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (filters.actor) params.set('actor_id', filters.actor);
  if (filters.subject) {
    params.set('subject_type', filters.subject.type);
    params.set('subject_id', filters.subject.id);
  }
  const from = filters.from && startOfDay(filters.from);
  // The API's `to` is exclusive: the day after the last one shown.
  const to = filters.to && startOfDay(filters.to, 1);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', String(PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  return params;
}

export async function listAuditLog(
  http: HttpClient,
  filters: AuditFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<AuditEntry[]> {
  return parseList(
    entrySchema,
    await http.get(`/audit?${auditQuery(filters, offset).toString()}`, { signal }),
    'audit log',
  );
}

// ---------------------------------------------------------------- wording

const HOTSPOT_STEPS: Record<string, string> = {
  submitted: 'Hotspot submitted',
  updated: 'Hotspot edited',
  resubmitted: 'Hotspot resubmitted',
  commented: 'Comment on hotspot',
  activated: 'Hotspot activated',
  rejected: 'Hotspot rejected',
  deactivated: 'Hotspot deactivated',
};

const ACTION_LABELS: Record<string, string> = {
  'auth.registered': 'Signed up',
  'auth.login_succeeded': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.refresh_location_changed': 'Session used from a new place',
  'auth.refresh_replayed': 'Reused sign-in token',
  'auth.refresh_refused': 'Session refresh refused',
  'auth.logged_out': 'Signed out',
  'auth.session_revoked': 'Signed out another device',
  'audit.searched': 'Searched the audit log',
  'user.created': 'User created',
  'user.roles_changed': 'Roles changed',
  'user.disabled': 'User deactivated',
  'user.enabled': 'User reactivated',
  'user.store_assigned': 'Store changed',
  'user.sessions_revoked': 'Signed out everywhere',
  'user.identity_linked': 'SSO identity linked',
  'role.permissions_changed': 'Role permissions changed',
  'access.denied': 'Request refused',
  'order.created': 'Order placed',
  'order.fulfilled': 'Order fulfilled',
  'order.requested': 'Stock requested from warehouse',
  'order.reviewed': 'Request reviewed',
  'order.stock_checked': 'Stock checked',
  'order.rejected': 'Request rejected',
  'order.dispatched': 'Request dispatched',
  'order.received': 'Shipment received',
  'stockout.reported': 'Stockout reported',
  'stockout.repeated': 'Stockout reported again',
  'inventory.movement_recorded': 'Stock adjusted',
  ...Object.fromEntries(
    Object.entries(HOTSPOT_STEPS).map(([step, label]) => [`hotspot.${step}`, label]),
  ),
};

const SUBJECT_LABELS: Record<string, string> = {
  user: 'User',
  role: 'Role',
  session: 'Session',
  hotspot: 'Hotspot',
  district: 'District',
  order: 'Order',
  store: 'Store',
  product: 'Product',
  product_type: 'Product type',
  brand: 'Brand',
  unit_of_measure: 'Unit of measure',
  stockout_report: 'Stockout report',
  inventory_movement: 'Stock movement',
};

/** "order_status" → "Order status". */
export function humanize(code: string): string {
  const words = code.replace(/[_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What happened, e.g. "Hotspot activated"; an action the page does not know reads from its name. */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  // `product.created` and the other catalogue items read "Product created".
  return humanize(action);
}

export function subjectLabel(type: string): string {
  return SUBJECT_LABELS[type] ?? humanize(type);
}

/** The start of an ID, enough to tell records apart. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Who did it: the username at the time, a named system actor, or nobody signed in. */
export function actorLabel(entry: Pick<AuditEntry, 'actor' | 'system_actor'>): string {
  if (entry.actor) return entry.actor.username ?? `User ${shortId(entry.actor.id)}`;
  if (entry.system_actor) return `System: ${entry.system_actor}`;
  return 'Not signed in';
}

/** A field value as text: strings as they are, everything else as compact JSON. */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** One line on the entry from its details, e.g. "permission: hotspots:activate". */
export function entrySummary(entry: Pick<AuditEntry, 'reason' | 'details'>): string | null {
  const parts: string[] = [];
  if (entry.reason) parts.push(humanize(entry.reason));
  const details = entry.details ?? {};
  for (const key of ['comment', 'permission', 'reason', 'role', 'quantity', 'selection']) {
    const value = formatValue(details[key]);
    if (value && !(key === 'reason' && entry.reason)) parts.push(`${humanize(key)}: ${value}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
