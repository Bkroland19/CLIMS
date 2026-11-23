'use client';

import { Copy, Filter } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/copyText';
import type { StatusTone } from '@/lib/status';
import { formatTimestamp } from '@/lib/format';

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
      <FilterTabs
        label="Filter by action"
        value={filters.action ?? 'all'}
        hrefFor={(value) => auditHref({ ...filters, action: isAction(value) ? value : null })}
        tabs={ACTION_TABS}
      />
      <DataTable
        label="Audit log"
        columns={AUDIT_COLUMNS}
        rows={log.data}
        getRowId={(entry) => entry.id}
        isLoading={log.isPending}
        error={log.error}
        onRetry={() => void log.refetch()}
        isRetrying={log.isRefetching}
        preferencesKey="audit-log"
        pageSize={25}
        searchPlaceholder="Search user, record or summary…"
        toolbar={
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
        }
        emptyTitle={isFiltered ? 'No entries match these filters' : 'Nothing recorded yet'}
        emptyDescription={
          isFiltered
            ? 'Choose another record type or action to see the rest.'
            : 'Every create, update and delete in CLIMS will be listed here.'
        }
        emptyAction={
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
        renderExpanded={(entry) => <AuditDetail entry={entry} />}
        expandLabel={(entry) =>
          `Show what changed on ${recordTypeLabel(entry.record_type).toLowerCase()} ${entry.record_id}`
        }
        rowActions={(entry) => (
          <RowActions
            label={`Actions for ${recordTypeLabel(entry.record_type).toLowerCase()} ${entry.record_id}`}
            actions={[
              {
                label: `Show only ${recordTypeLabel(entry.record_type, 'many').toLowerCase()}`,
                icon: Filter,
                onSelect: () => {
                  router.replace(auditHref({ ...filters, recordType: entry.record_type }));
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
        )}
      />
    </div>
  );
}

const AUDIT_COLUMNS: DataTableColumn<AuditEntry>[] = [
  {
    id: 'at',
    filter: 'date',
    header: 'When',
    value: (entry) => entry.at,
    cell: (entry) => (
      <time dateTime={entry.at} className="whitespace-nowrap">
        {formatTimestamp(entry.at)}
      </time>
    ),
  },
  {
    id: 'actor',
    header: 'User',
    value: (entry) => entry.actor,
    cell: (entry) => (
      <span className="block max-w-48 truncate font-medium" title={entry.actor}>
        {entry.actor}
      </span>
    ),
  },
  {
    id: 'action',
    filter: 'select',
    header: 'Action',
    value: (entry) => actionLabel(entry.action),
    cell: (entry) => (
      <StatusBadge status={actionLabel(entry.action)} tone={ACTION_TONES[entry.action]} />
    ),
  },
  {
    id: 'record',
    header: 'Record',
    value: (entry) => `${recordTypeLabel(entry.record_type)} ${entry.record_id} ${entry.summary}`,
    cell: (entry) => (
      <div className="flex max-w-[40rem] min-w-56 flex-col">
        <span className="font-medium">
          {recordTypeLabel(entry.record_type)} {entry.record_id}
        </span>
        <span className="text-muted-foreground truncate text-xs" title={entry.summary}>
          {entry.summary}
        </span>
      </div>
    ),
  },
  {
    id: 'source',
    filter: 'select',
    header: 'From',
    value: (entry) => entry.source,
    defaultHidden: true,
  },
];

/** An entry opened up: its summary in full, each field's old and new value, and where it came from. */
function AuditDetail({ entry }: { entry: AuditEntry }) {
  const record = `${recordTypeLabel(entry.record_type).toLowerCase()} ${entry.record_id}`;
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <p>{entry.summary}</p>
      {entry.changes.length > 0 ? (
        <div className="bg-card rounded-card overflow-hidden border">
          <DataTable
            variant="embedded"
            label={`What changed on ${record}`}
            rows={entry.changes}
            getRowId={(change) => change.field}
            columns={[
              {
                id: 'field',
                header: 'Field',
                cell: (change) => <span className="font-mono text-xs">{change.field}</span>,
              },
              { id: 'old', header: 'Old value', wrap: true, value: (change) => change.old ?? '—' },
              { id: 'new', header: 'New value', wrap: true, value: (change) => change.new ?? '—' },
            ]}
          />
        </div>
      ) : (
        <p className="text-muted-foreground">No field values were recorded for this change.</p>
      )}
      {entry.source ? <p className="text-muted-foreground text-xs">{entry.source}</p> : null}
    </div>
  );
}
