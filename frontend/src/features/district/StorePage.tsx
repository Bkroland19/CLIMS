'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FilterSelect } from '@/components/FilterSelect';
import { PageActions } from '@/components/PageActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WriteAction } from '@/components/WriteAction';
import { useCan } from '@/features/auth/queries';
import { formatNumber, formatText, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

import { MOVEMENT_REASONS, type StockBalance, type StockMovement } from './api';
import {
  ledgerFilterFrom,
  ledgerHref,
  movementOrderHref,
  REASON_LABELS,
  signedChange,
} from './ledger';
import { useMe } from './parts';
import { useMovements, useStock } from './queries';
import { RecordStockDialog } from './RecordStockDialog';

const REASON_OPTIONS = [
  { value: 'all', label: 'All movements' },
  ...MOVEMENT_REASONS.map((reason) => ({ value: reason, label: REASON_LABELS[reason] })),
] as const;

/** The district store: what it holds now, and every movement in and out. */
export default function StorePage() {
  const can = useCan();
  const me = useMe();
  const stock = useStock();
  const [recording, setRecording] = useState(false);
  // A DCFP reads their own store only; anyone reading every store sees their own here too.
  const rows = stock.data?.filter((row) => me.storeId === null || row.store_id === me.storeId);

  const columns: DataTableColumn<StockBalance>[] = [
    { id: 'product', header: 'Product', value: (row) => row.product },
    { id: 'unit', header: 'Unit', value: (row) => row.unit },
    {
      id: 'on-hand',
      header: 'On hand',
      numeric: true,
      value: (row) => row.on_hand,
      cell: (row) => formatNumber(row.on_hand),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      numeric: true,
      value: (row) => row.reserved,
      cell: (row) => formatNumber(row.reserved),
    },
    {
      id: 'available',
      header: 'Available',
      numeric: true,
      value: (row) => row.available,
      cell: (row) => <span className="font-medium">{formatNumber(row.available)}</span>,
    },
    {
      id: 'incoming',
      header: 'Incoming',
      numeric: true,
      value: (row) => row.incoming,
      cell: (row) => formatNumber(row.incoming),
    },
    {
      id: 'updated',
      header: 'Last change',
      value: (row) => row.updated_at,
      cell: (row) => formatTimestamp(row.updated_at),
    },
  ];

  const canRecord = can('inventory:manage') && me.storeId !== null;

  return (
    <div className="flex flex-col gap-6">
      {canRecord ? (
        <PageActions>
          <WriteAction>
            <Button
              onClick={() => {
                setRecording(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Record stock
            </Button>
          </WriteAction>
        </PageActions>
      ) : null}

      <section aria-labelledby="store-balances" className="flex flex-col gap-3">
        <div>
          <h2 id="store-balances" className="text-base font-semibold">
            Balances
          </h2>
          <p className="text-muted-foreground text-sm">
            Reserved stock is held for alerts being sent. Incoming is on its way from the warehouse.
          </p>
        </div>
        <DataTable
          label="Balances"
          columns={columns}
          rows={rows}
          getRowId={(row) => `${row.store_id}-${row.condom_id}-${row.unit_of_measure_id}`}
          isLoading={stock.isPending}
          error={stock.error}
          onRetry={() => void stock.refetch()}
          isRetrying={stock.isRefetching}
          searchPlaceholder="Search products…"
          emptyTitle="The district store holds no stock yet"
          emptyDescription={
            canRecord
              ? 'Record the opening balance of each product as a receipt before sending stock.'
              : 'Stock appears here once it is recorded or received from the warehouse.'
          }
        />
      </section>

      <Ledger />

      {recording && me.storeId ? (
        <RecordStockDialog
          storeId={me.storeId}
          onClose={() => {
            setRecording(false);
          }}
        />
      ) : null}
    </div>
  );
}

interface DateFilterProps {
  label: string;
  /** `YYYY-MM-DD`, or null for none. */
  value: string | null;
  min?: string | null;
  max?: string | null;
  onChange: (value: string | null) => void;
}

/** A date filter set beside its label, like `FilterSelect`. */
function DateFilter({ label, value, min, max, onChange }: DateFilterProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-sm font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="bg-card h-8 w-40"
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

function ChangeCell({ change }: { change: number }) {
  return (
    <span className={cn('tabular-nums', change > 0 && 'text-success font-medium')}>
      {signedChange(change, formatNumber)}
    </span>
  );
}

/** Every movement in and out of the store, newest first, 50 a page, filtered from the address. */
function Ledger() {
  const router = useRouter();
  const filter = ledgerFilterFrom(useSearchParams());
  const movements = useMovements(filter);
  const go = (next: Partial<typeof filter>) => {
    // A new filter starts at its first page.
    router.replace(ledgerHref({ ...filter, page: 0, ...next }), { scroll: false });
  };

  const columns: DataTableColumn<StockMovement>[] = [
    {
      id: 'when',
      header: 'When',
      value: (row) => row.created_at,
      cell: (row) => formatTimestamp(row.created_at),
      sortable: false,
    },
    { id: 'product', header: 'Product', value: (row) => row.product, sortable: false },
    { id: 'unit', header: 'Unit', value: (row) => row.unit, sortable: false },
    {
      id: 'reason',
      header: 'Movement',
      value: (row) => REASON_LABELS[row.reason],
      sortable: false,
      cell: (row) => {
        const href = movementOrderHref(row.reason, row.order_id);
        return href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {REASON_LABELS[row.reason]}
          </Link>
        ) : (
          REASON_LABELS[row.reason]
        );
      },
    },
    {
      id: 'change',
      header: 'Change',
      numeric: true,
      value: (row) => row.quantity,
      sortable: false,
      cell: (row) => <ChangeCell change={row.quantity} />,
    },
    {
      id: 'after',
      header: 'On hand after',
      numeric: true,
      value: (row) => row.on_hand_after,
      sortable: false,
      cell: (row) => formatNumber(row.on_hand_after),
    },
    {
      id: 'note',
      header: 'Note',
      value: (row) => row.note,
      sortable: false,
      cell: (row) => (
        <span className="line-clamp-2 max-w-80 whitespace-normal">{formatText(row.note)}</span>
      ),
    },
  ];

  const isFiltered = filter.reason !== null || filter.from !== null || filter.to !== null;
  const page = movements.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Ledger</h2>
        </CardTitle>
        <CardDescription>
          Every movement in and out of the district store, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Movement"
            value={filter.reason ?? 'all'}
            options={REASON_OPTIONS}
            onValueChange={(value) => {
              go({ reason: value === 'all' ? null : value });
            }}
          />
          <DateFilter
            label="From"
            value={filter.from}
            max={filter.to}
            onChange={(from) => {
              go({ from });
            }}
          />
          <DateFilter
            label="To"
            value={filter.to}
            min={filter.from}
            onChange={(to) => {
              go({ to });
            }}
          />
          {isFiltered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                go({ reason: null, from: null, to: null });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        <DataTable
          key={ledgerHref(filter)}
          label="Ledger"
          columns={columns}
          rows={page?.movements}
          getRowId={(row) => row.id}
          isLoading={movements.isPending}
          error={movements.error}
          onRetry={() => void movements.refetch()}
          isRetrying={movements.isRefetching}
          pageSize={50}
          emptyTitle={isFiltered ? 'No movements match these filters' : 'No movements yet'}
          emptyDescription={
            isFiltered
              ? 'Change or clear the filters to see more of the ledger.'
              : 'Receipts, adjustments, stock sent to hotspots and shipments received appear here.'
          }
        />
        {filter.page > 0 || page?.hasMore ? (
          <nav aria-label="Ledger pages" className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={filter.page === 0}
              onClick={() => {
                router.replace(ledgerHref({ ...filter, page: filter.page - 1 }), { scroll: false });
              }}
            >
              <ChevronLeft data-icon="inline-start" />
              Newer
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {formatNumber(filter.page + 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!page?.hasMore}
              onClick={() => {
                router.replace(ledgerHref({ ...filter, page: filter.page + 1 }), { scroll: false });
              }}
            >
              Older
              <ChevronRight data-icon="inline-end" />
            </Button>
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}
