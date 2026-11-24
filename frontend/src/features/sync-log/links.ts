import {
  NO_FILTERS,
  SYNC_ACTIONS,
  SYNC_STATUSES,
  type SyncAction,
  type SyncLogFilters,
  type SyncStatus,
} from './api';

export const SYNC_LOG_PATH = '/moh/audit/sync-log';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isStatus = (value: string | null): value is SyncStatus =>
  SYNC_STATUSES.some((status) => status === value);
const isAction = (value: string | null): value is SyncAction =>
  SYNC_ACTIONS.some((action) => action === value);
const day = (value: string | null): string | null => (value && DAY.test(value) ? value : null);

/**
 * Reads the filters from the address:
 * `?status=&action=&user=<user id>&from=YYYY-MM-DD&to=YYYY-MM-DD`. Anything malformed is left out.
 */
export function syncLogFiltersFrom(params: URLSearchParams): SyncLogFilters {
  const status = params.get('status');
  const action = params.get('action');
  const user = params.get('user');
  return {
    status: isStatus(status) ? status : null,
    action: isAction(action) ? action : null,
    user: user && UUID.test(user) ? user : null,
    from: day(params.get('from')),
    to: day(params.get('to')),
  };
}

/** The sync log address for a set of filters, leaving out the defaults. */
export function syncLogHref(filters: Partial<SyncLogFilters> = {}): string {
  const { status, action, user, from, to } = { ...NO_FILTERS, ...filters };
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (action) params.set('action', action);
  if (user) params.set('user', user);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `${SYNC_LOG_PATH}?${query}` : SYNC_LOG_PATH;
}
