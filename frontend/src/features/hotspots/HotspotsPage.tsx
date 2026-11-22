'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions, type RowAction } from '@/components/data-table/RowActions';
import { ExportButton } from '@/components/ExportButton';
import { FilterTabs } from '@/components/FilterTabs';
import { PageActions } from '@/components/PageActions';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { WriteAction } from '@/components/WriteAction';
import { useHotspotStock } from '@/features/district/queries';
import { DCFP_PATHS } from '@/features/district/tasks';
import { formatNumber, formatTimestamp } from '@/lib/format';

import { DECISIONS_FROM, REVIEW_STATUSES, type Hotspot, type HotspotDecision } from './api';
import { dispenserSummary, hotspotLabel } from './hotspotForm';
import { DECISION_TEXT, DecisionDialog } from './HotspotDecisionDialog';
import { HotspotFormDialog } from './HotspotFormDialog';
import { useAllHotspots, useHotspots } from './queries';
import { supplyByHotspot } from './supply';

/** `review` is the DCFP's review queue; `submit` is a VHT's own submissions. */
type Workspace = 'review' | 'submit';

/** The review queue's filters, by review status. */
const REVIEW_FILTERS = ['all', ...REVIEW_STATUSES] as const;
type ReviewFilter = (typeof REVIEW_FILTERS)[number];

const REVIEW_LABELS: Record<ReviewFilter, string> = {
  all: 'All',
  submitted: 'To review',
  active: 'Active',
  deactivated: 'Deactivated',
  rejected: 'Rejected',
};

const reviewFilterFrom = (value: string | null): ReviewFilter =>
  REVIEW_FILTERS.find((filter) => filter === value) ?? 'all';

const reviewHref = (filter: ReviewFilter) =>
  filter === 'all' ? DCFP_PATHS.hotspots : `${DCFP_PATHS.hotspots}?review=${filter}`;

export default function HotspotsPage({ workspace }: { workspace: Workspace }) {
  const isReview = workspace === 'review';
  // A VHT sees their own submissions, one page; the DCFP's queue reads the whole district.
  const own = useHotspots(null, !isReview);
  const district = useAllHotspots({}, { enabled: isReview });
  const hotspots = isReview ? district : own;
  const supply = useHotspotStock({ enabled: isReview });
  const filter = reviewFilterFrom(useSearchParams().get('review'));
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState<{
    hotspot: Hotspot;
    decision: HotspotDecision;
  } | null>(null);

  const all = isReview ? district.data?.items : own.data;
  const supplied = supply.data ? supplyByHotspot(supply.data) : null;
  // Until the supply figures load, the columns show the empty marker rather than 0.
  const supplyOf = (hotspot: Hotspot) =>
    supplied
      ? (supplied.get(hotspot.id) ?? { deliveries: 0, lastDelivered: null, openAlerts: 0 })
      : null;

  const columns: DataTableColumn<Hotspot>[] = [
    {
      id: 'name',
      header: 'Hotspot',
      value: (hotspot) => hotspot.name,
      cell: (hotspot) =>
        isReview ? (
          <Link
            href={DCFP_PATHS.hotspot(hotspot.id)}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {hotspotLabel(hotspot)}
          </Link>
        ) : (
          hotspotLabel(hotspot)
        ),
    },
    { id: 'type', header: 'Type', value: (hotspot) => hotspot.type },
    { id: 'subcounty', header: 'Subcounty', value: (hotspot) => hotspot.subcounty?.name },
    { id: 'village', header: 'Village', value: (hotspot) => hotspot.village },
    {
      id: 'contact',
      header: 'Hotspot manager',
      value: (hotspot) => hotspot.contact_person?.name,
    },
    {
      id: 'phone',
      header: 'Manager phone',
      value: (hotspot) => hotspot.contact_person?.phone_number,
    },
    { id: 'dispenser', header: 'Dispenser', value: dispenserSummary },
    {
      id: 'status',
      header: 'Status',
      value: (hotspot) => hotspot.review_status,
      cell: (hotspot) => <StatusBadge status={hotspot.review_status} />,
    },
    ...(isReview
      ? [
          {
            id: 'deliveries',
            header: 'Deliveries',
            numeric: true,
            value: (hotspot: Hotspot) => supplyOf(hotspot)?.deliveries,
            cell: (hotspot: Hotspot) => formatNumber(supplyOf(hotspot)?.deliveries),
          },
          {
            id: 'last-delivered',
            header: 'Last delivered',
            value: (hotspot: Hotspot) => supplyOf(hotspot)?.lastDelivered,
            cell: (hotspot: Hotspot) => formatTimestamp(supplyOf(hotspot)?.lastDelivered),
          },
          {
            id: 'open-alerts',
            header: 'Open alerts',
            numeric: true,
            value: (hotspot: Hotspot) => supplyOf(hotspot)?.openAlerts,
            cell: (hotspot: Hotspot) => formatNumber(supplyOf(hotspot)?.openAlerts),
          },
        ]
      : []),
  ];

  const reviewActions = (hotspot: Hotspot): RowAction[] =>
    DECISIONS_FROM[hotspot.review_status].map((decision) => ({
      label: DECISION_TEXT[decision].verb,
      icon: DECISION_TEXT[decision].icon,
      destructive: DECISION_TEXT[decision].destructive,
      onSelect: () => {
        setDeciding({ hotspot, decision });
      },
    }));

  const submitButton = (
    <Button
      onClick={() => {
        setSubmitting(true);
      }}
    >
      <Plus data-icon="inline-start" />
      Submit hotspot
    </Button>
  );
  const rows =
    isReview && filter !== 'all' ? all?.filter((hotspot) => hotspot.review_status === filter) : all;

  return (
    <>
      <PageActions>
        <ExportButton name="Hotspots" columns={columns} rows={rows} />
        {isReview ? null : <WriteAction>{submitButton}</WriteAction>}
      </PageActions>

      {isReview ? (
        <FilterTabs
          label="Filter hotspots by review status"
          value={filter}
          hrefFor={reviewHref}
          tabs={REVIEW_FILTERS.map((value) => ({
            value,
            label: REVIEW_LABELS[value],
            ...(all
              ? {
                  count:
                    value === 'all'
                      ? all.length
                      : all.filter((hotspot) => hotspot.review_status === value).length,
                }
              : {}),
          }))}
        />
      ) : null}

      <DataTable
        key={filter}
        label="Hotspots"
        columns={columns}
        rows={rows}
        getRowId={(hotspot) => hotspot.id}
        isLoading={hotspots.isPending}
        error={hotspots.error}
        onRetry={() => void hotspots.refetch()}
        isRetrying={hotspots.isRefetching}
        searchPlaceholder="Search hotspots…"
        emptyTitle={
          !isReview
            ? 'No hotspots yet'
            : filter === 'all'
              ? 'No hotspots in your district yet'
              : filter === 'submitted'
                ? 'No hotspots to review'
                : `No ${REVIEW_LABELS[filter].toLowerCase()} hotspots`
        }
        emptyDescription={
          !isReview
            ? 'Submit a hotspot you identified so the district can activate it.'
            : filter === 'all' || filter === 'submitted'
              ? 'Hotspots that VHTs submit in your district appear here.'
              : 'Choose another filter to see the rest of the hotspots.'
        }
        emptyAction={isReview ? undefined : submitButton}
        rowActions={
          isReview
            ? (hotspot) => {
                const actions = reviewActions(hotspot);
                return actions.length ? (
                  <RowActions label={`Actions for ${hotspotLabel(hotspot)}`} actions={actions} />
                ) : null;
              }
            : undefined
        }
      />

      {submitting ? (
        <HotspotFormDialog
          onClose={() => {
            setSubmitting(false);
          }}
        />
      ) : null}
      {deciding ? (
        <DecisionDialog
          hotspot={deciding.hotspot}
          decision={deciding.decision}
          onClose={() => {
            setDeciding(null);
          }}
        />
      ) : null}
    </>
  );
}
