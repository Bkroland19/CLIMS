'use client';

import {
  BadgeCheck,
  Clock,
  Hourglass,
  Megaphone,
  Package,
  PackageCheck,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';

import { ColumnChart } from '@/components/charts/ColumnChart';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { PageActions } from '@/components/PageActions';
import { StatCard, StatCardGrid } from '@/components/StatCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCan } from '@/features/auth/queries';
import { formatNumber, formatTimestamp } from '@/lib/format';

import {
  queryString,
  type HmisSummary,
  type NotificationSummary,
  type ReportFilters,
  type ReportKind,
  type SupplySummary,
} from './api';
import { humanize } from './files';
import { useReportSummary, useReportTable } from './queries';
import { DownloadButtons, ReportMeta, ReportTableView } from './ReportTableView';
import { ApproveVersionButton, VersionsView } from './VersionsView';

export type ReportsWorkspace = 'moh' | 'dcfp' | 'warehouse';
type View = ReportKind | 'versions';

/** The reports each workspace works with (reporting requirements, report catalogue). */
const VIEWS: Record<ReportsWorkspace, readonly View[]> = {
  moh: [
    'notifications',
    'warehouse-requests',
    'stock',
    'batches',
    'expiry-exceptions',
    'hmis-105',
    'versions',
  ],
  dcfp: [
    'notifications',
    'warehouse-requests',
    'stock',
    'batches',
    'expiry-exceptions',
    'hmis-105',
    'versions',
  ],
  warehouse: ['warehouse-requests', 'stock', 'batches', 'expiry-exceptions', 'versions'],
};

const VIEW_LABELS: Record<View, string> = {
  notifications: 'Notifications',
  'warehouse-requests': 'Warehouse requests',
  stock: 'Store stock',
  batches: 'Batches & expiry',
  'expiry-exceptions': 'Expiry exceptions',
  'hmis-105': 'HMIS 105',
  versions: 'Approved versions',
};

/** The address parameters each report reads; anything else in the address is ignored. */
const FILTER_KEYS: Record<ReportKind, readonly string[]> = {
  notifications: ['from', 'to', 'category', 'status'],
  'warehouse-requests': ['from', 'to', 'category'],
  stock: ['category'],
  batches: ['category', 'band'],
  'expiry-exceptions': ['from', 'to', 'category'],
  'hmis-105': ['month'],
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Male and female' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Every status' },
  ...[
    'fulfilled',
    'partly_received',
    'awaiting_acknowledgement',
    'awaiting_supply',
    'rejected',
  ].map((value) => ({
    value,
    label: humanize(value),
  })),
];

const BAND_OPTIONS = [
  { value: 'all', label: 'Every band' },
  ...['expired', 'under_1_month', 'under_3_months', 'under_6_months', 'ok', 'unknown'].map(
    (value) => ({
      value,
      label: humanize(value),
    }),
  ),
];

const percent = (value: number | null) => (value === null ? 'Not applicable' : `${value}%`);
const hours = (value: number | null) =>
  value === null ? 'Not applicable' : `${formatNumber(value)} h`;

export function reportPath(workspace: ReportsWorkspace) {
  return `/${workspace}/programme-reports`;
}

export default function ProgrammeReportsPage({ workspace }: { workspace: ReportsWorkspace }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const base = reportPath(workspace);
  const views = VIEWS[workspace];
  const view = views.find((entry) => entry === searchParams.get('view')) ?? views[0] ?? 'stock';

  const filters: ReportFilters =
    view === 'versions'
      ? {}
      : Object.fromEntries(
          FILTER_KEYS[view]
            .map((key) => [key, searchParams.get(key) ?? ''] as const)
            .filter(([, value]) => value),
        );
  const setFilter = (key: string, value: string) => {
    router.replace(
      `${base}${queryString({ ...filters, view, [key]: value === 'all' ? '' : value })}`,
      {
        scroll: false,
      },
    );
  };

  return (
    <div className="gap-section flex flex-col">
      <FilterTabs
        label="Choose a report"
        value={view}
        tabs={views.map((value) => ({ value, label: VIEW_LABELS[value] }))}
        hrefFor={(value) => `${base}?view=${value}`}
      />
      {view === 'versions' ? (
        <VersionsView
          selected={searchParams.get('version')}
          hrefFor={(id) => `${base}${queryString({ view: 'versions', version: id ?? '' })}`}
        />
      ) : (
        <ReportView key={view} report={view} filters={filters} setFilter={setFilter} />
      )}
    </div>
  );
}

interface ReportViewProps {
  report: ReportKind;
  filters: ReportFilters;
  setFilter: (key: string, value: string) => void;
}

function ReportView({ report, filters, setFilter }: ReportViewProps) {
  const can = useCan();
  const table = useReportTable(report, filters);
  const refresh = () => void table.refetch();

  return (
    <div className="gap-section flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters report={report} filters={filters} setFilter={setFilter} />
        <PageActions>
          <Button variant="ghost" onClick={refresh} disabled={table.isFetching}>
            <RefreshCw
              data-icon="inline-start"
              className={table.isFetching ? 'animate-spin' : undefined}
            />
            Refresh
          </Button>
          <DownloadButtons
            table={table.data}
            csvPath={`/reports/export/${report}${queryString(filters, { format: 'csv' })}`}
          />
          {can('reports:approve') ? (
            <ApproveVersionButton report={report} filters={filters} table={table.data} />
          ) : null}
        </PageActions>
      </div>
      {table.data ? <ReportMeta table={table.data} /> : null}
      {report === 'notifications' ? <NotificationCards filters={filters} /> : null}
      {report === 'warehouse-requests' ? <SupplyCards filters={filters} /> : null}
      {report === 'hmis-105' ? <HmisCards filters={filters} /> : null}
      <ReportTableView
        table={table.data}
        isLoading={table.isPending}
        error={table.error}
        onRetry={refresh}
        isRetrying={table.isRefetching}
      />
    </div>
  );
}

function Filters({ report, filters, setFilter }: ReportViewProps) {
  const id = useId();
  const keys = FILTER_KEYS[report];
  const dateInput = (key: 'from' | 'to' | 'month', label: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${id}-${key}`} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Input
        id={`${id}-${key}`}
        type={key === 'month' ? 'month' : 'date'}
        className="h-8 w-40"
        value={filters[key] ?? ''}
        onChange={(event) => {
          setFilter(key, event.target.value);
        }}
      />
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-3">
      {keys.includes('from') ? dateInput('from', 'From') : null}
      {keys.includes('to') ? dateInput('to', 'To') : null}
      {keys.includes('month') ? dateInput('month', 'Month') : null}
      {keys.includes('category') ? (
        <FilterSelect
          label="Type"
          value={filters.category ?? 'all'}
          options={CATEGORY_OPTIONS}
          onValueChange={(value) => {
            setFilter('category', value);
          }}
        />
      ) : null}
      {keys.includes('status') ? (
        <FilterSelect
          label="Status"
          value={filters.status ?? 'all'}
          options={STATUS_OPTIONS}
          onValueChange={(value) => {
            setFilter('status', value);
          }}
        />
      ) : null}
      {keys.includes('band') ? (
        <FilterSelect
          label="Expiry"
          value={filters.band ?? 'all'}
          options={BAND_OPTIONS}
          onValueChange={(value) => {
            setFilter('band', value);
          }}
        />
      ) : null}
    </div>
  );
}

function NotificationCards({ filters }: { filters: ReportFilters }) {
  const summary = useReportSummary('notifications', filters);
  const data: NotificationSummary | undefined = summary.data;
  const loading = summary.isPending;
  if (summary.error) return <SummaryError onRetry={() => void summary.refetch()} />;
  const chartRows = (data?.districts ?? [])
    .filter((row) => row.fulfilment_rate !== null)
    .map((row) => ({
      label: row.district ?? 'No district',
      values: { rate: row.fulfilment_rate ?? 0 },
    }));
  return (
    <>
      <StatCardGrid>
        <StatCard
          label="Notifications raised"
          value={formatNumber(data?.notifications_raised)}
          icon={Megaphone}
          accent="info"
          isLoading={loading}
        />
        <StatCard
          label="Notifications fulfilled"
          value={formatNumber(data?.notifications_fulfilled)}
          icon={BadgeCheck}
          accent="positive"
          isLoading={loading}
        />
        <StatCard
          label="Fulfilment rate"
          value={data ? percent(data.fulfilment_rate) : ''}
          icon={PackageCheck}
          accent="violet"
          isLoading={loading}
        />
        <StatCard
          label="Median response"
          value={data ? hours(data.response.median_hours) : ''}
          icon={Timer}
          isLoading={loading}
        />
        <StatCard
          label={
            data
              ? `On time (${data.deadline.days} days, target ${data.deadline.target_percent}%)`
              : 'On time'
          }
          value={data ? percent(data.deadline.on_time_rate) : ''}
          icon={Clock}
          accent={data?.deadline.target_met === false ? 'caution' : 'positive'}
          isLoading={loading}
        />
        <StatCard
          label="Past the deadline, still open"
          value={formatNumber(data?.deadline.late_pending)}
          icon={Hourglass}
          accent="caution"
          isLoading={loading}
        />
      </StatCardGrid>
      {data ? (
        <p className="text-muted-foreground text-sm">
          Acknowledgements recorded through {formatTimestamp(data.acknowledgements_through)}.{' '}
          {data.deadline.target_met === false ? 'Below the on-time target. ' : ''}
          Targets: {humanize(data.settings.review_cycle)} review, {data.settings.deadline_days}-day
          deadline, {data.settings.target_percent}% on time ({settingsSource(data.settings.source)}
          ).
          {data.acknowledgement_overdue > 0
            ? ` Quality issue: ${formatNumber(data.acknowledgement_overdue)} with a delivery not acknowledged in time.`
            : ''}
          {data.notifications_rejected
            ? ` ${formatNumber(data.notifications_rejected)} rejected by the district, counted as not fulfilled.`
            : ''}
        </p>
      ) : null}
      {chartRows.length > 1 ? (
        <ColumnChart
          title="Fulfilment rate by district"
          description="Notifications raised in the period and fully acknowledged, as a percentage."
          series={{ key: 'rate', label: 'Fulfilment rate (%)', color: 'var(--chart-1)' }}
          rows={chartRows}
          categoryLabel="District"
        />
      ) : null}
    </>
  );
}

function settingsSource(source: NotificationSummary['settings']['source']) {
  return {
    store: "the store's own settings",
    national: 'national settings',
    default: 'draft defaults',
  }[source];
}

function SupplyCards({ filters }: { filters: ReportFilters }) {
  const summary = useReportSummary('warehouse-requests', filters);
  const total: SupplySummary['total'] | undefined = summary.data?.total;
  const loading = summary.isPending;
  if (summary.error) return <SummaryError onRetry={() => void summary.refetch()} />;
  return (
    <StatCardGrid>
      <StatCard
        label="Requests"
        value={formatNumber(total?.requests)}
        icon={Megaphone}
        accent="info"
        isLoading={loading}
      />
      <StatCard
        label="Requested pieces"
        value={formatNumber(total?.requested_pieces)}
        icon={Package}
        isLoading={loading}
      />
      <StatCard
        label="Approved pieces"
        value={formatNumber(total?.approved_pieces)}
        icon={BadgeCheck}
        isLoading={loading}
      />
      <StatCard
        label="Issued pieces"
        value={formatNumber(total?.issued_pieces)}
        icon={Package}
        isLoading={loading}
      />
      <StatCard
        label="Acknowledged pieces"
        value={formatNumber(total?.acknowledged_pieces)}
        icon={PackageCheck}
        accent="positive"
        isLoading={loading}
      />
      <StatCard
        label="Quantity fulfilment"
        value={total ? percent(total.quantity_fulfilment_rate) : ''}
        icon={PackageCheck}
        accent="violet"
        isLoading={loading}
      />
    </StatCardGrid>
  );
}

function HmisCards({ filters }: { filters: ReportFilters }) {
  const summary = useReportSummary('hmis-105', filters);
  const data: HmisSummary | undefined = summary.data;
  const loading = summary.isPending;
  const [showDecisions, setShowDecisions] = useState(false);
  if (summary.error) return <SummaryError onRetry={() => void summary.refetch()} />;
  return (
    <>
      <Alert variant="warning">
        <AlertTitle>Prepared, not submitted to DHIS2</AlertTitle>
        <AlertDescription>
          These are acknowledged receipts at hotspots: evidence of supply, not condoms dispensed.
          Submission stays off until the programme approves how they are counted.{' '}
          <Button
            variant="link"
            size="sm"
            type="button"
            className="h-auto px-0 text-current underline"
            onClick={() => {
              setShowDecisions((open) => !open);
            }}
          >
            {showDecisions ? 'Hide' : 'Show'} pending decisions
          </Button>
          {showDecisions && data ? (
            <ul className="mt-2 list-disc pl-5">
              {data.pending_decisions.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      </Alert>
      <StatCardGrid>
        <StatCard
          label="105-CT11 Female condoms (pieces)"
          value={formatNumber(data?.total.ct11_female_pieces)}
          icon={Package}
          accent="violet"
          isLoading={loading}
        />
        <StatCard
          label="105-CT12 Male condoms (pieces)"
          value={formatNumber(data?.total.ct12_male_pieces)}
          icon={Package}
          accent="info"
          isLoading={loading}
        />
        <StatCard
          label="Acknowledgements"
          value={formatNumber(data?.total.acknowledgements)}
          icon={BadgeCheck}
          accent="positive"
          isLoading={loading}
        />
        <StatCard
          label="Unacknowledged lines (not counted)"
          value={formatNumber(data?.total.unacknowledged_lines)}
          icon={Hourglass}
          accent="caution"
          isLoading={loading}
        />
      </StatCardGrid>
    </>
  );
}

/** A failed summary says so in words: it is not shown as zeros (RF15). */
function SummaryError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>The summary figures could not be loaded</AlertTitle>
      <AlertDescription>
        They are not zero; the request failed.{' '}
        <Button
          variant="link"
          size="sm"
          type="button"
          className="h-auto px-0 text-current underline"
          onClick={onRetry}
        >
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
