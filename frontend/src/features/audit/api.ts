import { z } from 'zod';

import { parseList, type HttpClient } from '@/lib/api';

/*
 * The audit log: every create, update and delete in CLIMS, with who did it
 * and what changed.
 *
 * NOT YET IN THE GO API. This path and shape are the contract the web client
 * is written against and the mock API (`dev/mock/admin.mts`) serves; Phase 7
 * of `design/IMPLEMENTATION_PLAN.md` lists it for the backend. The screen
 * shows a sample-data notice until it exists.
 *
 *   GET /audit-log?record_type=<type>&action=<action>  → AuditEntry[], newest first
 *
 * Both filters are optional; the server applies them.
 */

export const AUDIT_ACTIONS = ['created', 'updated', 'deleted'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_RECORD_TYPES = [
  'order',
  'warehouse_order',
  'hotspot',
  'user',
  'role',
  'product',
  'unit',
  'monthly_report',
] as const;
export type AuditRecordType = (typeof AUDIT_RECORD_TYPES)[number];

const changeSchema = z.object({
  field: z.string(),
  old: z.string().nullable(),
  new: z.string().nullable(),
});

const entrySchema = z.object({
  id: z.string(),
  /** When it happened, ISO 8601 in UTC. */
  at: z.string(),
  /** Who did it: a person's name, or "System". */
  actor: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  record_type: z.enum(AUDIT_RECORD_TYPES),
  /** The record's own reference, e.g. `ORD-1042` or a person's name. */
  record_id: z.string(),
  summary: z.string(),
  changes: z.array(changeSchema),
  /** Where the change came from, e.g. "Chrome on Android". */
  source: z.string().nullable(),
});

export type AuditEntry = z.infer<typeof entrySchema>;

export interface AuditFilters {
  recordType: AuditRecordType | null;
  action: AuditAction | null;
}

export async function listAuditLog(
  http: HttpClient,
  { recordType, action }: AuditFilters,
  signal?: AbortSignal,
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (recordType) params.set('record_type', recordType);
  if (action) params.set('action', action);
  const query = params.toString();
  return parseList(
    entrySchema,
    await http.get(query ? `/audit-log?${query}` : '/audit-log', { signal }),
    'audit log',
  );
}

const RECORD_TYPE_LABELS: Record<AuditRecordType, { one: string; many: string }> = {
  order: { one: 'Order', many: 'Orders' },
  warehouse_order: { one: 'Warehouse order', many: 'Warehouse orders' },
  hotspot: { one: 'Hotspot', many: 'Hotspots' },
  user: { one: 'User', many: 'Users' },
  role: { one: 'Role', many: 'Roles' },
  product: { one: 'Product', many: 'Products' },
  unit: { one: 'Unit', many: 'Units' },
  monthly_report: { one: 'Monthly report', many: 'Monthly reports' },
};

export function recordTypeLabel(type: AuditRecordType, form: 'one' | 'many' = 'one'): string {
  return RECORD_TYPE_LABELS[type][form];
}

const ACTION_LABELS: Record<AuditAction, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
};

export function actionLabel(action: AuditAction): string {
  return ACTION_LABELS[action];
}
