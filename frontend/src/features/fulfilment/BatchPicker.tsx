import { InlineMessage } from '@/components/InlineMessage';
import { ItemsTable } from '@/components/ItemsTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { NEAR_EXPIRY_MONTHS } from './batches';
import { ExpiryCell } from './BatchCells';
import type { PickGroup, PickLot, PickPlan } from './picking';
import { productOf } from './products';

interface BatchPickerProps {
  plan: PickPlan;
  /** Says what the picks are for: confirming or releasing the order. */
  description: string;
  onPick: (key: string, text: string) => void;
  now: Date;
}

/** The batches to issue an order from, suggested first-expiry-first-out and editable. */
export function BatchPicker({ plan, description, onPick, now }: BatchPickerProps) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Select batches</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {plan.groups.map((group) => (
          <PickGroupTable key={group.product} group={group} onPick={onPick} now={now} />
        ))}
        <p className="text-muted-foreground text-xs">
          Batches expiring within {NEAR_EXPIRY_MONTHS} months are flagged but can still be issued:
          tell the hotspot to use them first. Expired batches can&apos;t be issued.
        </p>
        {plan.problems.length > 0 ? (
          <Alert variant="destructive" role="status">
            <AlertDescription>
              {plan.problems.join(' · ')}. Picks must add up to the approved quantity.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PickGroupTable({
  group,
  onPick,
  now,
}: {
  group: PickGroup;
  onPick: BatchPickerProps['onPick'];
  now: Date;
}) {
  const { name, brand } = productOf(group.product);
  const isShort = group.total !== group.need;
  const summary = [
    `Picking ${formatNumber(group.total)} of ${formatNumber(group.need)}`,
    group.batchesUsed > 0
      ? `${String(group.batchesUsed)} batch${group.batchesUsed > 1 ? 'es' : ''}`
      : null,
    group.nearExpiryPieces > 0 ? `${formatNumber(group.nearExpiryPieces)} near expiry` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section aria-label={`${name} batches`} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <h3 className="text-sm font-medium">
          {name} <span className="text-muted-foreground font-normal">· {brand}</span>
        </h3>
        <p
          className={cn(
            'text-xs font-medium',
            isShort
              ? 'text-destructive'
              : group.nearExpiryPieces > 0
                ? 'text-warning'
                : 'text-success',
          )}
        >
          {summary}
        </p>
      </div>
      <ItemsTable<PickLot>
        label={`${name} batches to pick from`}
        rows={group.lots}
        getRowId={(lot) => lot.key}
        rowTone={(lot) => (!lot.canIssue ? 'negative' : lot.isNearExpiry ? 'caution' : 'default')}
        columns={[
          {
            id: 'batch',
            header: 'Batch',
            cell: (lot) => (
              <div className="flex flex-col gap-1">
                <span className="font-medium">{lot.batch.batch}</span>
                <span className="text-muted-foreground text-xs">
                  Made {formatDate(lot.batch.manufactured_on)}
                </span>
                {lot.isFirstOut ? (
                  <span className="text-success text-xs font-medium">
                    Expires first · pick first
                  </span>
                ) : null}
                {!lot.canIssue ? (
                  <StatusBadge status="Expired" tone="negative" className="self-start" />
                ) : lot.isNearExpiry ? (
                  <StatusBadge status="Near expiry" tone="caution" className="self-start" />
                ) : null}
              </div>
            ),
          },
          {
            id: 'expires',
            header: 'Expires',
            cell: (lot) => <ExpiryCell expiresOn={lot.batch.expires_on} now={now} />,
          },
          {
            id: 'in-store',
            header: 'In store',
            numeric: true,
            cell: (lot) => formatNumber(lot.batch.quantity),
          },
          {
            id: 'pick',
            header: 'Pick',
            cell: (lot) => <PickInputCell lot={lot} onPick={onPick} />,
          },
        ]}
      />
    </section>
  );
}

function PickInputCell({ lot, onPick }: { lot: PickLot; onPick: BatchPickerProps['onPick'] }) {
  if (!lot.canIssue) {
    return <span className="text-destructive text-xs">Expired: can&apos;t issue</span>;
  }
  const errorId = `${lot.key}-error`;
  const message =
    lot.error === 'more-than-available'
      ? 'More than available'
      : lot.error === 'not-a-number'
        ? 'Enter a whole number'
        : null;
  return (
    <div className="flex w-28 flex-col">
      <Input
        inputMode="numeric"
        value={lot.text}
        onChange={(event) => {
          onPick(lot.key, event.target.value);
        }}
        aria-label={`Pieces to issue from batch ${lot.batch.batch}`}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        className="h-8 text-right tabular-nums"
      />
      <InlineMessage id={errorId}>{message}</InlineMessage>
      {!message && lot.isNearExpiry && lot.taking > 0 ? (
        <span className="text-warning mt-1 text-xs">Use first</span>
      ) : null}
    </div>
  );
}
