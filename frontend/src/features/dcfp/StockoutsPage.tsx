'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterTabs } from '@/components/FilterTabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useCan } from '@/features/auth/queries';
import { useCurrentUser } from '@/features/auth/hooks';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { EMPTY_VALUE, formatNumber, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { StockoutReport } from './api';
import {
  contactOf,
  stockoutLinks,
  isStockoutClosed,
  matchesStockoutFilter,
  placeOf,
  STOCKOUT_FILTERS,
  STOCKOUT_STATUS,
  stockoutStatus,
  type OrderScope,
  type StockoutFilter,
} from './orders';
import { useNationalStockouts } from './national';
import { useStockouts } from './queries';

const EMPTY: Record<StockoutFilter, { title: string; description: string }> = {
  open: {
    title: 'No open stockouts',
    description:
      'Every hotspot that reported has confirmed what it received. New reports appear here and in your notifications.',
  },
  awaiting_supply: {
    title: 'Nothing waiting for stock',
    description: 'Every open report has had stock sent. Check Awaiting receipt for confirmations.',
  },
  awaiting_acknowledgement: {
    title: 'Nothing waiting for confirmation',
    description: 'Stock you send shows here until the hotspot manager confirms what arrived.',
  },
  partly_received: {
    title: 'No partly received deliveries',
    description: 'A delivery shows here when the hotspot confirms less than was sent.',
  },
  fulfilled: {
    title: 'No fulfilled requests yet',
    description: 'A request is fulfilled once the hotspot confirms everything it asked for.',
  },
  rejected: {
    title: 'No rejected requests',
    description:
      'A request you cannot supply can be rejected with a reason before any stock goes. The hotspot is told why.',
  },
  all: {
    title: 'No stockouts reported',
    description:
      'When a hotspot in your district runs out, its report appears here and in your notifications.',
  },
};

/**
 * Stockout notifications from the district's hotspots, open ones first. Each row leads to the
 * request, where the DCFP sends district stock or orders more from a warehouse.
 */
export default function StockoutsPage({ scope = 'district' }: { scope?: OrderScope }) {
  const links = stockoutLinks(scope);
  const national = links.national === true;
  const router = useRouter();
  const params = useSearchParams();
  const districtId = useDistrictContext()?.districtId ?? null;
  const search = params.get('q') ?? '';
  const readOnly = useReadOnly();
  const can = useCan();
  const storeId = useCurrentUser()?.store_id;
  const filter: StockoutFilter =
    STOCKOUT_FILTERS.find((item) => item.value === params.get('status'))?.value ?? 'open';
  // A district's own requests load at once and filter here; MOH's national list asks the server for
  // one district (from the district menu), one tab and the search, a page at a time.
  const local = useStockouts({ enabled: !national });
  const remote = useNationalStockouts({ districtId, filter, search }, national);
  const reports = national
    ? {
        data: remote.data?.pages.flat(),
        isPending: remote.isPending,
        error: remote.error,
        refetch: remote.refetch,
        isRefetching: remote.isRefetching,
      }
    : local;
  const rows = national
    ? reports.data
    : reports.data?.filter((report) => matchesStockoutFilter(report, filter));
  // Counts need every request loaded, which only the district list has.
  const tabs = STOCKOUT_FILTERS.map((tab) => ({
    ...tab,
    ...(national
      ? {}
      : {
          count: reports.data?.filter((report) => matchesStockoutFilter(report, tab.value)).length,
        }),
  }));
  const listHref = (status: StockoutFilter, q: string) => {
    const query = new URLSearchParams({ status });
    if (q) query.set('q', q);
    return `${links.list}?${query.toString()}`;
  };
  const canSend = !readOnly && !links.national && can('orders:supply_hotspots');
  // With no reports at all, say so whatever the filter; otherwise say what the filter keeps.
  // A national list holds only what its filters asked for, so its emptiness says nothing about the rest.
  const empty = !national && reports.data?.length === 0 ? EMPTY.all : EMPTY[filter];

  const columns = useMemo<DataTableColumn<StockoutReport>[]>(
    () => [
      {
        id: 'hotspot',
        header: 'Hotspot',
        value: (report) => `${report.hot_spot.name} ${placeOf(report)}`,
        cell: (report) => (
          <div className="min-w-0">
            <Link
              href={links.detail(report.id)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {report.hot_spot.name}
            </Link>
            <div className="text-muted-foreground truncate text-xs">
              {placeOf(report) || EMPTY_VALUE}
            </div>
          </div>
        ),
      },
      ...(links.national
        ? [
            {
              id: 'district',
              filter: 'select' as const,
              header: 'District',
              value: (report: StockoutReport) => report.hot_spot.district ?? '',
              cell: (report: StockoutReport) => report.hot_spot.district ?? EMPTY_VALUE,
            },
          ]
        : []),
      { id: 'product', header: 'Out of', value: (report) => report.product },
      {
        id: 'status',
        filter: 'select',
        header: 'Status',
        value: (report) => STOCKOUT_STATUS[stockoutStatus(report)].label,
        cell: (report) => {
          const status = STOCKOUT_STATUS[stockoutStatus(report)];
          return <StatusBadge status={status.label} tone={status.tone} />;
        },
      },
      {
        id: 'message',
        header: 'Message',
        hideable: true,
        value: (report) => report.comment ?? '',
        cell: (report) =>
          report.comment ? (
            <span className="line-clamp-2 max-w-80 whitespace-normal">{report.comment}</span>
          ) : (
            <span className="text-muted-foreground">No message</span>
          ),
      },
      {
        id: 'contact',
        header: 'Contact',
        hideable: true,
        value: (report) => contactOf(report),
        cell: (report) => contactOf(report) || EMPTY_VALUE,
      },
      {
        id: 'reporter',
        header: 'Reported by',
        hideable: true,
        value: (report) => report.reported_by,
      },
      {
        id: 'reported',
        filter: 'date',
        header: 'Reported',
        value: (report) => report.created_at,
        cell: (report) => (
          <div>
            <div>{formatTimestamp(report.created_at)}</div>
            {report.repeat_count ? (
              <div className="text-muted-foreground text-xs">
                {repeatsLabel(report.repeat_count)}
              </div>
            ) : null}
          </div>
        ),
      },
    ],
    [links],
  );

  return (
    <div className="gap-section flex flex-col">
      <FilterTabs
        label="Filter stockouts by status"
        tabs={tabs}
        value={filter}
        hrefFor={(value) => listHref(value, search)}
      />
      <DataTable
        label="Stockout notifications"
        preferencesKey={links.national ? 'moh-stockouts' : 'dcfp-stockouts'}
        columns={columns}
        rows={rows}
        getRowId={(report) => report.id}
        isLoading={reports.isPending}
        error={reports.error}
        onRetry={() => void reports.refetch()}
        isRetrying={reports.isRefetching}
        searchPlaceholder={
          national ? 'Search hotspots and places…' : 'Search hotspots, products, messages…'
        }
        {...(national
          ? {
              serverSearch: {
                value: search,
                onChange: (q: string) => {
                  router.replace(listHref(filter, q), { scroll: false });
                },
              },
              more: {
                hasMore: remote.hasNextPage,
                isLoading: remote.isFetchingNextPage,
                onLoadMore: () => void remote.fetchNextPage(),
                noun: 'requests',
              },
            }
          : {})}
        emptyTitle={empty.title}
        emptyDescription={empty.description}
        rowActions={(report) => {
          // Sending needs the permission and the report's own district store; anyone can look.
          const manage =
            canSend &&
            report.district_store_id === storeId &&
            !isStockoutClosed(stockoutStatus(report));
          return (
            <Button variant={manage ? 'outline' : 'ghost'} size="sm" asChild>
              <Link
                href={links.detail(report.id)}
                aria-label={`${manage ? 'Manage' : 'View'} ${report.hot_spot.name}`}
              >
                {manage ? 'Manage' : 'View'}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          );
        }}
      />
    </div>
  );
}

/** "Reported again", "Reported 3 more times". */
export function repeatsLabel(repeats: number): string {
  return repeats === 1 ? 'Reported again' : `Reported ${formatNumber(repeats)} more times`;
}
