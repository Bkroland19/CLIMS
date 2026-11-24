'use client';

import { Copy, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions, type RowActionItem } from '@/components/data-table/RowActions';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { DateFilter, FilterChip } from '@/features/audit/FilterControls';
import { auditHref } from '@/features/audit/links';
import { useCan } from '@/features/auth/queries';
import { roleLabel } from '@/features/users/access';
import { copyText } from '@/lib/copyText';
import { formatTimestamp } from '@/lib/format';

import {
  actionLabel,
  deviceLabel,
  errorLabel,
  NO_FILTERS,
  statusLabel,
  statusMeaning,
  statusTone,
  SYNC_ACTIONS,
  SYNC_STATUSES,
  type SyncAction,
  type SyncLogEntry,
  type SyncLogFilters,
} from './api';
import { syncLogFiltersFrom, syncLogHref } from './links';
import { useSyncLog } from './queries';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...SYNC_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
] as const;

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  ...SYNC_ACTIONS.map((action) => ({ value: action, label: actionLabel(action) })),
] as const;

const isAction = (value: string): value is SyncAction =>
  SYNC_ACTIONS.some((action) => action === value);

type Go = (next: Partial<SyncLogFilters>) => void;

/** "VHT, Hotspot manager". */
const rolesOf = (entry: SyncLogEntry) =>
  entry.user.roles.map((name) => roleLabel({ id: '', name })).join(', ');

/**
 * What field phones report about sending the actions their users saved, most recently saved
 * first. The server filters and pages the log; the table's own search and sorting apply to the
 * entries loaded so far.
 */
export default function SyncLogPage() {
  const router = useRouter();
  const filters = syncLogFiltersFrom(useSearchParams());
  const log = useSyncLog(filters);
  const entries = log.data?.pages.flat();
  const isFiltered = Object.values(filters).some((value) => value !== null);
  const go: Go = (next) => {
    router.replace(syncLogHref({ ...filters, ...next }), { scroll: false });
  };
  const userName = filters.user
    ? (entries?.find((entry) => entry.user.id === filters.user)?.user.username ??
      `user ${filters.user.slice(0, 8)}`)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground max-w-3xl text-sm">
        Each row is one action a field user saved on their phone and how sending it went, as the
        phone reports it. Times are the phone&apos;s clock.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Filter by status"
          value={filters.status ?? 'all'}
          hrefFor={(value) => syncLogHref({ ...filters, status: value === 'all' ? null : value })}
          tabs={STATUS_TABS}
        />
        {filters.user ? (
          <FilterChip
            label={`Saved by ${userName ?? ''}`}
            onClear={() => {
              go({ user: null });
            }}
          />
        ) : null}
      </div>
      <DataTable
        label="Sync log"
        columns={SYNC_COLUMNS}
        rows={entries}
        getRowId={(entry) => entry.id}
        isLoading={log.isPending}
        error={log.error}
        onRetry={() => void log.refetch()}
        isRetrying={log.isRefetching}
        preferencesKey="sync-log"
        pageSize={25}
        searchPlaceholder="Search loaded entries…"
        more={{
          hasMore: log.hasNextPage,
          isLoading: log.isFetchingNextPage,
          onLoadMore: () => void log.fetchNextPage(),
          noun: 'entries',
        }}
        toolbar={
          <>
            <FilterSelect
              label="Action"
              value={filters.action ?? 'all'}
              options={ACTION_OPTIONS}
              onValueChange={(value) => {
                go({ action: isAction(value) ? value : null });
              }}
            />
            <DateFilter
              label="Saved from"
              value={filters.from}
              max={filters.to}
              onChange={(from) => {
                go({ from });
              }}
            />
            <DateFilter
              label="To"
              value={filters.to}
              min={filters.from}
              onChange={(to) => {
                go({ to });
              }}
            />
          </>
        }
        emptyTitle={isFiltered ? 'No entries match these filters' : 'No phone has reported yet'}
        emptyDescription={
          isFiltered
            ? 'Change or clear the filters to see the rest.'
            : 'Field phones report each action they save once they are online with an updated app.'
        }
        emptyAction={
          isFiltered ? (
            <Button
              variant="outline"
              onClick={() => {
                router.replace(syncLogHref(NO_FILTERS));
              }}
            >
              Clear filters
            </Button>
          ) : undefined
        }
        renderExpanded={(entry) => <SyncDetail entry={entry} />}
        expandLabel={(entry) =>
          `Show tries of ${actionLabel(entry.action).toLowerCase()} by ${entry.user.username} saved ${formatTimestamp(entry.queued_at)}`
        }
        rowActions={(entry) => <EntryActions entry={entry} go={go} />}
      />
    </div>
  );
}

// The server applies the status, action, user and date filters, so the columns offer none of their own.
const SYNC_COLUMNS: DataTableColumn<SyncLogEntry>[] = [
  {
    id: 'queued_at',
    filter: false,
    header: 'Saved',
    value: (entry) => entry.queued_at,
    cell: (entry) => (
      <time dateTime={entry.queued_at} className="whitespace-nowrap">
        {formatTimestamp(entry.queued_at)}
      </time>
    ),
  },
  {
    id: 'user',
    filter: false,
    header: 'Who',
    value: (entry) => entry.user.username,
    cell: (entry) => (
      <div className="flex max-w-48 flex-col">
        <span className="truncate font-medium" title={entry.user.username}>
          {entry.user.username}
        </span>
        <span className="text-muted-foreground truncate text-xs">{rolesOf(entry)}</span>
      </div>
    ),
  },
  {
    id: 'action',
    filter: false,
    header: 'Action',
    value: (entry) => actionLabel(entry.action),
  },
  {
    id: 'status',
    filter: false,
    header: 'Status',
    value: (entry) => statusLabel(entry.status),
    cell: (entry) => (
      <div className="flex flex-col items-start gap-0.5">
        <StatusBadge status={statusLabel(entry.status)} tone={statusTone(entry.status)} />
        {entry.last_error && entry.status !== 'sent' ? (
          <span className="text-muted-foreground text-xs">{errorLabel(entry.last_error)}</span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'attempts',
    filter: false,
    header: 'Tries',
    value: (entry) => entry.attempt_count,
  },
  {
    id: 'changed_at',
    filter: false,
    header: 'Last change',
    value: (entry) => entry.changed_at,
    cell: (entry) => (
      <time dateTime={entry.changed_at} className="whitespace-nowrap">
        {formatTimestamp(entry.changed_at)}
      </time>
    ),
  },
  {
    id: 'device',
    filter: false,
    header: 'Phone',
    value: (entry) => deviceLabel(entry.device),
    defaultHidden: true,
  },
];

function EntryActions({ entry, go }: { entry: SyncLogEntry; go: Go }) {
  const can = useCan();
  const router = useRouter();
  const actions: RowActionItem[] = [
    {
      label: `Show entries saved by ${entry.user.username}`,
      icon: UserRound,
      onSelect: () => {
        go({ user: entry.user.id });
      },
    },
  ];
  if (can('audit:read')) {
    actions.push({
      label: 'What the server recorded',
      icon: ShieldCheck,
      onSelect: () => {
        router.push(auditHref({ clientEntry: entry.client_entry_id }));
      },
    });
  }
  actions.push({
    label: 'Copy entry ID',
    icon: Copy,
    onSelect: () => {
      void copyText(entry.client_entry_id, 'entry ID');
    },
  });
  return (
    <RowActions
      label={`Actions for ${actionLabel(entry.action).toLowerCase()} by ${entry.user.username}`}
      actions={actions}
    />
  );
}

/** An entry opened up: what its status means, every try still on record, and where it came from. */
function SyncDetail({ entry }: { entry: SyncLogEntry }) {
  const can = useCan();
  const label = actionLabel(entry.action);
  const older = entry.attempt_count - entry.attempts.length;
  const tries = entry.attempts.map((attempt, index) => ({ ...attempt, index }));

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <p>
        <span className="font-medium">{statusLabel(entry.status)}:</span>{' '}
        {statusMeaning(entry.status)}.
      </p>

      {tries.length > 0 ? (
        <div className="bg-card rounded-card overflow-hidden border">
          <DataTable
            variant="embedded"
            label={`Tries: ${label.toLowerCase()} by ${entry.user.username}`}
            rows={tries}
            getRowId={(attempt) => String(attempt.index)}
            columns={[
              {
                id: 'at',
                header: 'When',
                value: (attempt) => attempt.at,
                cell: (attempt) => <time dateTime={attempt.at}>{formatTimestamp(attempt.at)}</time>,
              },
              {
                id: 'result',
                header: 'Result',
                value: (attempt) => (attempt.error ? errorLabel(attempt.error) : 'Accepted'),
              },
            ]}
          />
        </div>
      ) : (
        <p className="text-muted-foreground">No tries yet.</p>
      )}
      {older > 0 ? (
        <p className="text-muted-foreground text-xs">
          {older} earlier {older === 1 ? 'try is' : 'tries are'} counted but no longer listed.
        </p>
      ) : null}

      <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{deviceLabel(entry.device)}</dd>
        {entry.server_record_id ? (
          <>
            <dt className="text-muted-foreground">Server record</dt>
            <dd className="font-mono text-xs break-all">{entry.server_record_id}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Entry</dt>
        <dd className="font-mono text-xs break-all">{entry.client_entry_id}</dd>
        <dt className="text-muted-foreground">Last reported</dt>
        <dd>{formatTimestamp(entry.received_at)} (server time)</dd>
      </dl>

      {can('audit:read') ? (
        <div>
          <Button variant="outline" size="xs" asChild>
            <Link href={auditHref({ clientEntry: entry.client_entry_id })}>
              <ShieldCheck data-icon="inline-start" />
              What the server recorded
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
