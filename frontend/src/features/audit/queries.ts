import { useApiQuery } from '@/lib/api';

import { listAuditLog, type AuditFilters } from './api';

/* NOT YET IN THE GO API: reads the mock audit log (see ./api.ts). */

export const auditKeys = {
  all: ['audit-log'] as const,
  list: (filters: AuditFilters) =>
    ['audit-log', filters.recordType ?? 'all', filters.action ?? 'all'] as const,
};

export function useAuditLog(filters: AuditFilters) {
  return useApiQuery(auditKeys.list(filters), (http, signal) =>
    listAuditLog(http, filters, signal),
  );
}
