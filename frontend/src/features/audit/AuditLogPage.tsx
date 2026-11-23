'use client';

import { ChevronDown, Copy, History, ScrollText, UserRound, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';

import { RowActions, type RowActionItem } from '@/components/data-table/RowActions';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeDevice } from '@/features/auth/deviceSessions';
import { roleLabel } from '@/features/users/access';
import { copyText } from '@/lib/copyText';
import { formatNumber, formatTimestamp } from '@/lib/format';

import {
  actionLabel,
  actorLabel,
  areaLabel,
  AUDIT_AREAS,
  entrySummary,
  formatValue,
  humanize,
  NO_FILTERS,
  shortId,
  subjectLabel,
  type AuditArea,
  type AuditEntry,
  type AuditFilters,
  type AuditSubject,
} from './api';
import { auditFiltersFrom, auditHref } from './links';
import { useAuditLog } from './queries';

const AREA_OPTIONS = [
  { value: 'all', label: 'All areas' },
  ...AUDIT_AREAS.map((area) => ({ value: area, label: areaLabel(area) })),
] as const;

const OUTCOME_TABS = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Succeeded' },
  { value: 'failure', label: 'Failed' },
] as const;

const isArea = (value: string): value is AuditArea => AUDIT_AREAS.some((area) => area === value);

const subjectName = (subject: AuditSubject): string =>
  `${subjectLabel(subject.type)} ${shortId(subject.id)}`;

/** Who did what, to which record, what changed and from where, newest first. */
export default function AuditLogPage() {
  const router = useRouter();
  const filters = auditFiltersFrom(useSearchParams());
  const log = useAuditLog(filters);
  const entries = log.data?.pages.flat() ?? [];
  const isFiltered = Object.values(filters).some((value) => value !== null);
  const go = (next: Partial<AuditFilters>) => {
    router.replace(auditHref({ ...filters, ...next }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Area"
          value={filters.area ?? 'all'}
          options={AREA_OPTIONS}
          onValueChange={(value) => {
            go({ area: isArea(value) ? value : null });
          }}
        />
        <FilterTabs
          label="Filter by outcome"
          value={filters.outcome ?? 'all'}
          hrefFor={(value) => auditHref({ ...filters, outcome: value === 'all' ? null : value })}
          tabs={OUTCOME_TABS}
        />
        <DateFilter
          label="From"
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
        {log.data ? (
          <p className="text-muted-foreground ml-auto text-sm" aria-live="polite">
            {formatNumber(entries.length)}
            {log.hasNextPage ? '+' : ''} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        ) : null}
      </div>

      {filters.actor || filters.subject ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {filters.actor ? (
            <FilterChip
              label={`Actions by user ${shortId(filters.actor)}`}
              onClear={() => {
                go({ actor: null });
              }}
            />
          ) : null}
          {filters.subject ? (
            <FilterChip
              label={`History of ${subjectName(filters.subject).toLowerCase()}`}
              onClear={() => {
                go({ subject: null });
              }}
            />
          ) : null}
        </div>
      ) : null}

      {log.isPending ? (
        <PageSkeleton layout="table" />
      ) : log.isError ? (
        <ErrorState
          title="Could not load the audit log"
          error={log.error}
          onRetry={() => void log.refetch()}
          isRetrying={log.isRefetching}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={isFiltered ? 'No entries match these filters' : 'Nothing recorded yet'}
          description={
            isFiltered
              ? 'Change or clear the filters to see the rest.'
              : 'Sign-ins, account changes and every change to records will be listed here.'
          }
          action={
            isFiltered ? (
              <Button
                variant="outline"
                onClick={() => {
                  router.replace(auditHref(NO_FILTERS));
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <AuditList entries={entries} go={go} />
          {log.hasNextPage ? (
            <Button
              variant="outline"
              className="self-center"
              disabled={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              {log.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function DateFilter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string | null;
  min?: string | null;
  max?: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-sm font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="bg-card h-8 w-36"
        value={value ?? ''}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
      />
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3">
      {label}
      <Button variant="ghost" size="icon-xs" aria-label={`Clear: ${label}`} onClick={onClear}>
        <X />
      </Button>
    </span>
  );
}

const ROW_GRID =
  'sm:grid sm:grid-cols-[9rem_minmax(0,10rem)_minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-3';

function AuditList({
  entries,
  go,
}: {
  entries: readonly AuditEntry[];
  go: (next: Partial<AuditFilters>) => void;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div
        aria-hidden="true"
        className={`bg-primary/5 text-muted-foreground hidden px-4 py-2 pr-24 text-xs font-semibold tracking-wider uppercase ${ROW_GRID}`}
      >
        <span>When</span>
        <span>Who</span>
        <span>Action</span>
        <span>Record</span>
      </div>
      <ul className="divide-border divide-y">
        {entries.map((entry) => {
          const { target, actor } = entry;
          const actions: RowActionItem[] = [
            ...(target
              ? [
                  {
                    label: "Show this record's history",
                    icon: History,
                    onSelect: () => {
                      go({ subject: target });
                    },
                  },
                ]
              : []),
            ...(actor
              ? [
                  {
                    label: `Show actions by ${actorLabel(entry)}`,
                    icon: UserRound,
                    onSelect: () => {
                      go({ actor: actor.id });
                    },
                  },
                ]
              : []),
            ...(target
              ? [
                  {
                    label: 'Copy record ID',
                    icon: Copy,
                    onSelect: () => {
                      void copyText(target.id, 'record ID');
                    },
                  },
                ]
              : []),
          ];
          return (
            <li key={entry.id} className="relative">
              <AuditRow entry={entry} go={go} />
              {actions.length > 0 ? (
                <div className="absolute top-2 right-10">
                  <RowActions
                    label={`Actions for ${actionLabel(entry.action).toLowerCase()} at ${formatTimestamp(entry.occurred_at)}`}
                    actions={actions}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AuditRow({ entry, go }: { entry: AuditEntry; go: (next: Partial<AuditFilters>) => void }) {
  const label = actionLabel(entry.action);
  const summary = entrySummary(entry);
  const changes = Object.entries(entry.changes ?? {});
  const details = Object.entries(entry.details ?? {}).filter(([, value]) => value !== null);
  const related = entry.subjects.filter(
    (subject) => !(entry.target?.type === subject.type && entry.target.id === subject.id),
  );
  const roles = entry.actor?.roles ?? [];
  const device = entry.user_agent ? describeDevice(entry.user_agent).label : null;
  const source = [entry.ip_address, device].filter(Boolean).join(' · ');

  return (
    <details className="group">
      <summary
        className={`focus-visible:ring-ring flex cursor-pointer list-none flex-col gap-1 px-4 py-3 pr-24 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset [&::-webkit-details-marker]:hidden ${ROW_GRID}`}
      >
        <time dateTime={entry.occurred_at} className="text-muted-foreground text-xs sm:text-sm">
          {formatTimestamp(entry.occurred_at)}
        </time>
        <span className="truncate font-medium">{actorLabel(entry)}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{label}</span>
          {entry.outcome === 'failure' ? <StatusBadge status="Failed" tone="negative" /> : null}
        </span>
        <span className="min-w-0 truncate">
          {entry.target ? (
            <span className="font-medium">{subjectName(entry.target)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {summary ? <span className="text-muted-foreground"> · {summary}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground absolute top-4 right-4 size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="bg-secondary/40 flex flex-col gap-3 px-4 py-3 text-sm">
        <p>
          <span className="font-medium">{label}</span>{' '}
          <span className="text-muted-foreground font-mono text-xs">{entry.action}</span>
          {entry.reason ? <> · {humanize(entry.reason)}</> : null}
        </p>

        {changes.length > 0 ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">What changed: {label.toLowerCase()}</caption>
              <thead className="text-muted-foreground text-xs uppercase">
                <tr>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Field
                  </th>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Before
                  </th>
                  <th scope="col" className="py-1 font-semibold">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map(([field, change]) => (
                  <tr key={field} className="align-top">
                    <td className="py-1 pr-4 font-mono text-xs">{field}</td>
                    <td className="py-1 pr-4 break-all">{formatValue(change.before) ?? '—'}</td>
                    <td className="py-1 break-all">{formatValue(change.after) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {details.length > 0 ? (
          <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1">
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{humanize(key)}</dt>
                <dd className="break-all">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {entry.target || related.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Records:</span>
            {[...(entry.target ? [entry.target] : []), ...related].map((subject) => (
              <Button
                key={`${subject.type}:${subject.id}`}
                variant="outline"
                size="xs"
                title={`Show the history of ${subjectLabel(subject.type).toLowerCase()} ${subject.id}`}
                onClick={() => {
                  go({ subject });
                }}
              >
                <History data-icon="inline-start" />
                {subjectName(subject)}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {roles.length > 0 ? (
            <span>Roles then: {roles.map((name) => roleLabel({ id: '', name })).join(', ')}</span>
          ) : null}
          {source ? <span title={entry.user_agent ?? undefined}>{source}</span> : null}
          {entry.request_id ? (
            <span className="inline-flex items-center gap-1">
              Request {entry.request_id}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy request ID"
                onClick={() => void copyText(entry.request_id ?? '', 'request ID')}
              >
                <Copy />
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
