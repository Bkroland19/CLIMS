'use client';

import { ChevronDown, Copy, Filter, ScrollText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { RowActions } from '@/components/data-table/RowActions';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/copyText';
import type { StatusTone } from '@/lib/status';
import { formatNumber, formatTimestamp } from '@/lib/format';

import {
  actionLabel,
  AUDIT_ACTIONS,
  AUDIT_RECORD_TYPES,
  recordTypeLabel,
  type AuditAction,
  type AuditEntry,
  type AuditFilters,
  type AuditRecordType,
} from './api';
import { useAuditLog } from './queries';

export const AUDIT_PATH = '/moh/audit';

const ACTION_TONES: Record<AuditAction, StatusTone> = {
  created: 'positive',
  updated: 'info',
  deleted: 'negative',
};

function isRecordType(value: string | null): value is AuditRecordType {
  return AUDIT_RECORD_TYPES.some((type) => type === value);
}

function isAction(value: string | null): value is AuditAction {
  return AUDIT_ACTIONS.some((action) => action === value);
}

/** Reads the filters from the address: `?type=<record type>&action=<action>`; anything else means "all". */
export function auditFiltersFrom(params: URLSearchParams): AuditFilters {
  const type = params.get('type');
  const action = params.get('action');
  return {
    recordType: isRecordType(type) ? type : null,
    action: isAction(action) ? action : null,
  };
}

/** The audit log address for a set of filters, leaving out the defaults. */
export function auditHref({ recordType, action }: AuditFilters): string {
  const params = new URLSearchParams();
  if (recordType) params.set('type', recordType);
  if (action) params.set('action', action);
  const query = params.toString();
  return query ? `${AUDIT_PATH}?${query}` : AUDIT_PATH;
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All records' },
  ...AUDIT_RECORD_TYPES.map((type) => ({ value: type, label: recordTypeLabel(type, 'many') })),
] as const;

const ACTION_TABS = [
  { value: 'all', label: 'All' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action, label: actionLabel(action) })),
] as const;

/** Every create, update and delete, filterable by record type and action. NOT YET IN THE GO API. */
export default function AuditLogPage() {
  const router = useRouter();
  const filters = auditFiltersFrom(useSearchParams());
  const log = useAuditLog(filters);
  const isFiltered = filters.recordType !== null || filters.action !== null;

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The audit entries" />
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Record"
          value={filters.recordType ?? 'all'}
          options={TYPE_OPTIONS}
          onValueChange={(value) => {
            router.replace(
              auditHref({ ...filters, recordType: isRecordType(value) ? value : null }),
            );
          }}
        />
        <FilterTabs
          label="Filter by action"
          value={filters.action ?? 'all'}
          hrefFor={(value) => auditHref({ ...filters, action: isAction(value) ? value : null })}
          tabs={ACTION_TABS}
        />
        {log.data ? (
          <p className="text-muted-foreground ml-auto text-sm" aria-live="polite">
            {formatNumber(log.data.length)} {log.data.length === 1 ? 'entry' : 'entries'}
          </p>
        ) : null}
      </div>

      {log.isPending ? (
        <PageSkeleton layout="table" />
      ) : log.isError ? (
        <ErrorState
          title="Could not load the audit log"
          error={log.error}
          onRetry={() => void log.refetch()}
          isRetrying={log.isRefetching}
        />
      ) : log.data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={isFiltered ? 'No entries match these filters' : 'Nothing recorded yet'}
          description={
            isFiltered
              ? 'Choose another record type or action to see the rest.'
              : 'Every create, update and delete in CLIMS will be listed here.'
          }
          action={
            isFiltered ? (
              <Button
                variant="outline"
                onClick={() => {
                  router.replace(AUDIT_PATH);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AuditList
          entries={log.data}
          onlyType={(recordType) => {
            router.replace(auditHref({ ...filters, recordType }));
          }}
        />
      )}
    </div>
  );
}

const ROW_GRID =
  'sm:grid sm:grid-cols-[9rem_minmax(0,10rem)_7rem_minmax(0,1fr)] sm:items-center sm:gap-3';

function AuditList({
  entries,
  onlyType,
}: {
  entries: readonly AuditEntry[];
  onlyType: (recordType: AuditRecordType) => void;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div
        aria-hidden="true"
        className={`bg-primary/5 text-muted-foreground hidden px-4 py-2 pr-24 text-xs font-semibold tracking-wider uppercase ${ROW_GRID}`}
      >
        <span>When</span>
        <span>User</span>
        <span>Action</span>
        <span>Record</span>
      </div>
      <ul className="divide-border divide-y">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <AuditRow entry={entry} />
            <div className="absolute top-2 right-10">
              <RowActions
                label={`Actions for ${recordTypeLabel(entry.record_type).toLowerCase()} ${entry.record_id}`}
                actions={[
                  {
                    label: `Show only ${recordTypeLabel(entry.record_type, 'many').toLowerCase()}`,
                    icon: Filter,
                    onSelect: () => {
                      onlyType(entry.record_type);
                    },
                  },
                  {
                    label: 'Copy record ID',
                    icon: Copy,
                    onSelect: () => {
                      void copyText(entry.record_id, 'record ID');
                    },
                  },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const type = recordTypeLabel(entry.record_type);
  return (
    <details className="group">
      <summary
        className={`focus-visible:ring-ring flex cursor-pointer list-none flex-col gap-1 px-4 py-3 pr-24 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset [&::-webkit-details-marker]:hidden ${ROW_GRID}`}
      >
        <time dateTime={entry.at} className="text-muted-foreground text-xs sm:text-sm">
          {formatTimestamp(entry.at)}
        </time>
        <span className="truncate font-medium">{entry.actor}</span>
        <span>
          <StatusBadge status={actionLabel(entry.action)} tone={ACTION_TONES[entry.action]} />
        </span>
        <span className="min-w-0">
          <span className="font-medium">
            {type} {entry.record_id}
          </span>{' '}
          <span className="text-muted-foreground">— {entry.summary}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground absolute top-4 right-4 size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="bg-secondary/40 flex flex-col gap-3 px-4 py-3 text-sm">
        <p>{entry.summary}</p>
        {entry.changes.length > 0 ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                What changed on {type.toLowerCase()} {entry.record_id}
              </caption>
              <thead className="text-muted-foreground text-xs uppercase">
                <tr>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Field
                  </th>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Old value
                  </th>
                  <th scope="col" className="py-1 font-semibold">
                    New value
                  </th>
                </tr>
              </thead>
              <tbody>
                {entry.changes.map((change) => (
                  <tr key={change.field}>
                    <td className="py-1 pr-4 font-mono text-xs">{change.field}</td>
                    <td className="py-1 pr-4">{change.old ?? '—'}</td>
                    <td className="py-1">{change.new ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {entry.source ? <p className="text-muted-foreground text-xs">{entry.source}</p> : null}
      </div>
    </details>
  );
}
