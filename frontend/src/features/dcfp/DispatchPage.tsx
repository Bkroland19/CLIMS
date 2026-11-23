'use client';

import {
  ArrowDownRight,
  ChartPie,
  Check,
  CheckCheck,
  CircleAlert,
  MapPin,
  Package,
  Store,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterTabs } from '@/components/FilterTabs';
import { StatCard, StatCardGrid } from '@/components/StatCard';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/hooks';
import { useCan } from '@/features/auth/queries';
import { ugandaToday } from '@/features/warehouse/receiving';
import { useStoreSummary } from '@/features/warehouse/stockQueries';
import { formatAmounts, periodRange, totalsByUnit } from '@/features/warehouse/summary';
import { formatNumber, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useReadOnly } from '@/navigation/useAccess';

import type { StockoutReport } from './api';
import { DeliverStockDialog } from './DeliverStockDialog';
import { contactOf, DCFP_PATHS, placeOf, STOCKOUT_STATUS } from './orders';
import { useStockout, useStockouts } from './queries';

const filters = [
  { value: 'open', label: 'Open requests' },
  { value: 'awaiting_supply', label: 'Awaiting supply' },
  { value: 'awaiting_acknowledgement', label: 'Awaiting receipt' },
  { value: 'partly_received', label: 'Partly received' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'all', label: 'All' },
] as const;

const dispatchStatusStyles = {
  awaiting_supply: {
    icon: Package,
    color: 'border-warning/30 bg-warning/10 text-warning',
  },
  awaiting_acknowledgement: {
    icon: Truck,
    color: 'border-info/30 bg-info/10 text-info',
  },
  partly_received: {
    icon: ChartPie,
    color:
      'border-violet-600/25 bg-violet-50 text-violet-800 dark:border-violet-400/35 dark:bg-violet-950/60 dark:text-violet-200',
  },
  fulfilled: {
    icon: CheckCheck,
    color: 'border-success/30 bg-success/10 text-success',
  },
};

function DispatchStatus({ status }: { status: keyof typeof dispatchStatusStyles }) {
  const { icon: Icon, color } = dispatchStatusStyles[status];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap',
        color,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {STOCKOUT_STATUS[status].label}
    </span>
  );
}

const columns: DataTableColumn<StockoutReport>[] = [
  {
    id: 'hotspot',
    header: 'Hotspot',
    value: (report) => `${report.hot_spot.name} ${placeOf(report)}`,
    cell: (report) => (
      <div>
        <div className="font-medium">{report.hot_spot.name}</div>
        <div className="text-muted-foreground text-xs">{placeOf(report)}</div>
      </div>
    ),
  },
  { id: 'product', header: 'Requested', value: (report) => report.product },
  {
    id: 'status',
    filter: 'select',
    header: 'Status',
    value: (report) => STOCKOUT_STATUS[report.status ?? 'awaiting_supply'].label,
    cell: (report) => <DispatchStatus status={report.status ?? 'awaiting_supply'} />,
  },
  {
    id: 'reported',
    filter: 'date',
    header: 'Reported',
    value: (report) => report.created_at,
    cell: (report) => formatTimestamp(report.created_at),
  },
];

/** Each dispatch is tied to one real request. Receipts, not sending stock, close a report. */
export default function DispatchPage() {
  const storeId = useCurrentUser()?.store_id ?? undefined;
  const params = useSearchParams();
  const filter = filters.find((item) => item.value === params.get('status'))?.value ?? 'open';
  const reports = useStockouts({ enabled: Boolean(storeId) });
  const scoped = reports.data?.filter((report) => report.district_store_id === storeId);
  const rows = scoped?.filter(
    (report) =>
      filter === 'all' ||
      (filter === 'open'
        ? report.status !== 'fulfilled'
        : (report.status ?? 'awaiting_supply') === filter),
  );
  const selected = scoped?.find((report) => report.id === params.get('report'));
  const pathFor = (status: string) =>
    `${DCFP_PATHS.dispatch}?${new URLSearchParams({ status, ...(selected ? { report: selected.id } : {}) }).toString()}`;

  if (!storeId)
    return (
      <EmptyState
        icon={Store}
        title="No district store assigned"
        description="Ask an administrator to assign your district store before dispatching stock."
      />
    );

  return (
    <div className="space-y-section">
      {!reports.error ? (
        <StatCardGrid>
          <StatCard
            label="Awaiting supply"
            value={formatNumber(
              scoped?.filter((r) => !r.status || r.status === 'awaiting_supply').length ?? 0,
            )}
            icon={Package}
            accent="caution"
            isLoading={reports.isPending}
            detail="Requests with no dispatch yet"
          />
          <StatCard
            label="Awaiting receipt"
            value={formatNumber(
              scoped?.filter((r) => r.status === 'awaiting_acknowledgement').length ?? 0,
            )}
            icon={Truck}
            accent="info"
            isLoading={reports.isPending}
            detail="Sent; hotspot confirmation pending"
          />
          <StatCard
            label="Partly received"
            value={formatNumber(scoped?.filter((r) => r.status === 'partly_received').length ?? 0)}
            icon={ChartPie}
            accent="violet"
            isLoading={reports.isPending}
            detail="Check receipts before sending more"
          />
          <StatCard
            label="Fulfilled"
            value={formatNumber(scoped?.filter((r) => r.status === 'fulfilled').length ?? 0)}
            icon={CheckCheck}
            accent="positive"
            isLoading={reports.isPending}
            detail="Hotspot confirmed receipt"
          />
        </StatCardGrid>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold">Hotspot requests</h2>
          <p className="text-muted-foreground text-sm">
            Select a hotspot to review its request and dispatch history.
          </p>
        </div>
        <FilterTabs
          label="Filter hotspot requests"
          tabs={filters}
          value={filter}
          hrefFor={pathFor}
        />
      </div>
      <DataTable
        label="Hotspot dispatch requests"
        preferencesKey="dcfp-dispatch"
        columns={columns}
        rows={rows}
        getRowId={(report) => report.id}
        isLoading={reports.isPending}
        error={reports.error}
        onRetry={() => void reports.refetch()}
        isRetrying={reports.isRefetching}
        defaultSort={{ columnId: 'reported', direction: 'asc' }}
        searchPlaceholder="Search hotspots, categories, statuses…"
        emptyTitle="No hotspot requests here"
        emptyDescription="Hotspot stockout notifications appear here. Choose another filter to see previous dispatches."
        rowActions={(report) => (
          <Button variant={selected?.id === report.id ? 'secondary' : 'outline'} size="sm" asChild>
            <Link
              href={`${DCFP_PATHS.dispatchFor(report.id)}&status=${filter}#dispatch-request`}
              aria-label={`Select ${report.hot_spot.name}`}
              aria-current={selected?.id === report.id ? 'true' : undefined}
            >
              {selected?.id === report.id ? (
                <>
                  <Check aria-hidden="true" /> Selected
                </>
              ) : (
                <>
                  Review request <ArrowDownRight aria-hidden="true" />
                </>
              )}
            </Link>
          </Button>
        )}
      />
      {selected ? (
        <DispatchRequest key={selected.id} report={selected} storeId={storeId} />
      ) : params.get('report') && !reports.error && !reports.isPending ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="That request is not available in your district"
            description="Select another hotspot request from the list."
          />
        </Card>
      ) : null}
    </div>
  );
}

function DispatchRequest({ report, storeId }: { report: StockoutReport; storeId: string }) {
  const can = useCan();
  const readOnly = useReadOnly();
  const detail = useStockout(report.id);
  const range = useMemo(() => periodRange('30d', ugandaToday(new Date())), []);
  const summary = useStoreSummary(storeId, range, { enabled: can('inventory:read') });
  const [dispatching, setDispatching] = useState(false);
  const status = detail.data?.status ?? report.status ?? 'awaiting_supply';
  const stock = summary.data?.products;
  const manage = !readOnly && can('orders:supply_hotspots');
  const available = stock ? formatAmounts(totalsByUnit(stock, (product) => product.usable)) : '—';

  return (
    <section
      id="dispatch-request"
      aria-labelledby="dispatch-request-title"
      className="gap-section grid scroll-mt-20 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
    >
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle id="dispatch-request-title">{report.hot_spot.name}</CardTitle>
            <DispatchStatus status={status} />
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {placeOf(report)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Requested</dt>
              <dd>{report.product}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Message</dt>
              <dd>{report.comment || 'No message supplied'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contact</dt>
              <dd>{contactOf(report) || 'No contact recorded'}</dd>
            </div>
          </dl>
          {can('inventory:read') ? (
            <div className="bg-secondary/60 space-y-1 rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">Available in district store · all products</p>
              <p className="font-semibold">
                {summary.isPending
                  ? 'Loading stock…'
                  : summary.error
                    ? 'Stock unavailable'
                    : available}
              </p>
              <Link className="text-primary underline" href={DCFP_PATHS.store}>
                View district stock
              </Link>
            </div>
          ) : null}
          {summary.error ? (
            <ErrorState
              title="Could not load district stock"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          ) : null}
          {status === 'awaiting_acknowledgement' || status === 'partly_received' ? (
            <div className="border-warning/25 bg-warning/10 flex items-start gap-2 rounded-lg border p-3 text-sm">
              <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Stock has already been dispatched. Review the quantities and receipt confirmations
                before sending more.
              </p>
            </div>
          ) : null}
          {manage && status !== 'fulfilled' ? (
            <Button
              className="h-auto min-h-9 w-full max-w-full justify-center sm:w-auto"
              disabled={
                !detail.isSuccess ||
                Boolean(detail.error) ||
                !summary.isSuccess ||
                Boolean(summary.error)
              }
              onClick={() => {
                setDispatching(true);
              }}
            >
              <Truck aria-hidden="true" />
              <span className="min-w-0 whitespace-normal">Dispatch to {report.hot_spot.name}</span>
            </Button>
          ) : null}
          {manage && !can('inventory:read') ? (
            <p className="text-muted-foreground text-sm">
              Inventory access is needed to check available stock before dispatching.
            </p>
          ) : null}
          {!readOnly && can('orders:replenish') && status !== 'fulfilled' ? (
            <Button variant="outline" asChild>
              <Link href={DCFP_PATHS.newOrderFor(report.selection)}>
                Order stock from a warehouse
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Dispatches and receipts</CardTitle>
          <CardDescription>
            Sent quantities and receipt confirmations are shown in individual pieces for comparison.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.isPending ? (
            <p role="status">Loading dispatch history…</p>
          ) : detail.error ? (
            <ErrorState
              title="Could not load dispatch history"
              error={detail.error}
              onRetry={() => void detail.refetch()}
            />
          ) : detail.data.deliveries.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No dispatches yet"
              description="Record the stock you send; the hotspot manager will confirm what arrives."
            />
          ) : (
            detail.data.deliveries.map((delivery) => (
              <section
                key={delivery.id}
                className="space-y-2 rounded-lg border p-3"
                aria-label={`Dispatch ${formatTimestamp(delivery.created_at)}`}
              >
                <h3 className="text-sm font-medium">
                  Dispatched {formatTimestamp(delivery.created_at)}
                </h3>
                {delivery.rider ? (
                  <p className="text-sm">
                    Carried by {delivery.rider.name}
                    {delivery.rider.phone ? ` · ${delivery.rider.phone}` : ''}
                  </p>
                ) : null}
                {delivery.note ? (
                  <p className="text-muted-foreground text-sm">{delivery.note}</p>
                ) : null}
                <ul className="divide-y">
                  {delivery.lines.map((line) => (
                    <li key={line.id} className="space-y-1 py-2 text-sm">
                      <p className="font-medium">{line.product}</p>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>{formatNumber(line.pieces)} pieces sent</span>
                        {line.acknowledged_at === null ? (
                          <DispatchStatus status="awaiting_acknowledgement" />
                        ) : (
                          <span className="text-success font-medium">
                            {formatNumber(line.acknowledged_pieces ?? 0)} pieces received
                          </span>
                        )}
                      </div>
                      {line.acknowledged_at ? (
                        <p className="text-muted-foreground text-xs">
                          Confirmed {formatTimestamp(line.acknowledged_at)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </CardContent>
      </Card>
      {dispatching && stock ? (
        <DeliverStockDialog
          storeId={storeId}
          stock={stock}
          initialReportId={report.id}
          onClose={() => {
            setDispatching(false);
          }}
        />
      ) : null}
    </section>
  );
}
