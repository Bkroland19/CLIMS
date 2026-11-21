'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';

import { DetailList } from '@/components/DetailList';
import { InlineMessage } from '@/components/InlineMessage';
import { ItemsTable } from '@/components/ItemsTable';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { SampleDataNotice } from '@/components/SampleData';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatNumber, formatTimestamp } from '@/lib/format';
import { WriteAction } from '@/components/WriteAction';

import type { DistrictStore, HotspotOrder, WarehouseCode } from './api';
import { ProductCell } from './BatchCells';
import {
  formatQuantities,
  NO_QUANTITIES,
  parsePieces,
  PRODUCTS,
  productOf,
  sumQuantities,
  type ProductKey,
  type Quantities,
} from './products';
import { useCreateRequest, useDistrictStore, useOrders } from './queries';
import { suggestedRequest } from './restock';
import { WAREHOUSE_NAMES } from './status';
import { DCFP_PATHS } from './tasks';

const WAREHOUSE_OPTIONS = [
  {
    value: 'NMS',
    label: `NMS · ${WAREHOUSE_NAMES.NMS}`,
    description: 'Entebbe · usual lead time 1–2 days',
  },
  {
    value: 'JMS',
    label: `JMS · ${WAREHOUSE_NAMES.JMS}`,
    description: 'Kampala · usual lead time 1–3 days',
  },
] as const;

export default function NewWarehouseRequestPage() {
  const orders = useOrders();
  const store = useDistrictStore();
  const forOrder = useSearchParams().get('order');

  let body: ReactNode;
  const failed = orders.error ?? store.error;
  if (failed) {
    body = (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load the district store and held orders"
          error={failed}
          onRetry={() => {
            void orders.refetch();
            void store.refetch();
          }}
          isRetrying={orders.isRefetching || store.isRefetching}
        />
      </div>
    );
  } else if (!orders.data || !store.data) {
    body = <PageSkeleton layout="form" />;
  } else {
    body = <RequestForm orders={orders.data} store={store.data} forOrder={forOrder} />;
  }

  return (
    <div className="gap-section flex flex-col">
      <SampleDataNotice subject="The stock figures and held orders" />
      {body}
    </div>
  );
}

type QuantityText = Partial<Record<ProductKey, string>>;

interface RequestFormProps {
  orders: readonly HotspotOrder[];
  store: DistrictStore;
  /** The held order the DCFP came from, listed first. */
  forOrder: string | null;
}

function RequestForm({ orders, store, forOrder }: RequestFormProps) {
  const router = useRouter();
  const create = useCreateRequest();
  const quantityErrorId = useId();
  const noteId = useId();

  const unrequested = orders.filter(
    (order) => order.status === 'on_hold' && order.warehouse_request_id === null,
  );
  // The order the DCFP came from leads the list.
  const held = [
    ...unrequested.filter((order) => order.id === forOrder),
    ...unrequested.filter((order) => order.id !== forOrder),
  ];

  const [warehouse, setWarehouse] = useState<WarehouseCode>('NMS');
  // Untouched quantities follow the suggestion as orders are linked and unlinked.
  const [typed, setTyped] = useState<QuantityText>({});
  // Null until the DCFP changes it: every held order is linked by default.
  const [linkedChoice, setLinkedChoice] = useState<readonly string[] | null>(null);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);

  const linked = (linkedChoice ?? held.map((order) => order.id)).filter((id) =>
    held.some((order) => order.id === id),
  );
  const demand = sumQuantities(
    held.filter((order) => linked.includes(order.id)).map((order) => order.approved),
  );
  const suggestion = suggestedRequest(demand, store.stock, store.min_levels);
  const text: Record<ProductKey, string> = {
    male: typed.male ?? String(suggestion.male),
    female: typed.female ?? String(suggestion.female),
  };

  const fieldErrors: Partial<Record<ProductKey, string>> = {};
  for (const { key } of PRODUCTS) {
    if (parsePieces(text[key]) === null) fieldErrors[key] = 'Enter a whole number of pieces.';
  }
  const male = parsePieces(text.male);
  const female = parsePieces(text.female);
  const items: Quantities | null = male === null || female === null ? null : { male, female };
  const serverItemsError =
    failure instanceof ApiError ? failure.fieldErrors.items?.join(' ') : undefined;
  const totalError =
    items && items.male + items.female === 0
      ? 'Request at least one piece.'
      : (serverItemsError ?? null);

  function toggle(id: string) {
    setLinkedChoice(linked.includes(id) ? linked.filter((value) => value !== id) : [...linked, id]);
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!items || items.male + items.female === 0 || create.isPending) return;
    setFailure(null);
    create.mutate(
      { warehouse, items, linked_orders: linked, note: note.trim() },
      {
        onSuccess: (id) => {
          router.push(DCFP_PATHS.request(id));
        },
        onError: (error) => {
          setFailure(error);
        },
      },
    );
  }

  const isBusy = create.isPending;
  const showTotalError = totalError !== null && (attempted || serverItemsError !== undefined);

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="new-request-heading"
      className="gap-section grid lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <h2 id="new-request-heading" className="sr-only">
        Request stock from a warehouse
      </h2>
      <div className="gap-section flex min-w-0 flex-col">
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>
                <StepNumber value={1} />
                Order from
              </h3>
            </CardTitle>
            <CardDescription>
              The warehouse reviews the request, checks its stock, then dispatches or holds it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioCardGroup
              legend="Warehouse"
              hideLegend
              layout="row"
              value={warehouse}
              onValueChange={setWarehouse}
              options={WAREHOUSE_OPTIONS}
              disabled={isBusy}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle asChild>
              <h3>
                <StepNumber value={2} />
                Quantity needed
              </h3>
            </CardTitle>
            <CardDescription>
              Pre-filled to cover the linked held orders and bring the store back to its minimum
              level, in whole cartons.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-0">
            <ItemsTable<ProductKey>
              label="Quantity needed"
              rows={PRODUCTS.map((product) => product.key)}
              getRowId={(key) => key}
              columns={[
                {
                  id: 'product',
                  header: 'Product',
                  cell: (key) => <ProductCell product={key} />,
                },
                {
                  id: 'store',
                  header: 'In store',
                  numeric: true,
                  cell: (key) => formatNumber(store.stock[key]),
                },
                {
                  id: 'demand',
                  header: 'Held orders',
                  numeric: true,
                  cell: (key) => formatNumber(demand[key]),
                },
                {
                  id: 'minimum',
                  header: 'Minimum',
                  numeric: true,
                  cell: (key) => formatNumber(store.min_levels[key]),
                },
                {
                  id: 'request',
                  header: 'Request (pieces)',
                  cell: (key) => {
                    const error = fieldErrors[key];
                    const errorId = `${quantityErrorId}-${key}`;
                    const describedBy = [
                      error ? errorId : null,
                      showTotalError ? quantityErrorId : null,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div className="flex w-32 flex-col">
                        <Input
                          inputMode="numeric"
                          value={text[key]}
                          onChange={(event) => {
                            setTyped((current) => ({ ...current, [key]: event.target.value }));
                          }}
                          aria-label={`Quantity to request, ${productOf(key).name.toLowerCase()}`}
                          aria-invalid={error || showTotalError ? true : undefined}
                          aria-describedby={describedBy || undefined}
                          className="h-8 text-right tabular-nums"
                          disabled={isBusy}
                        />
                        <InlineMessage id={errorId} className="whitespace-normal">
                          {error}
                        </InlineMessage>
                      </div>
                    );
                  },
                },
              ]}
            />
            {showTotalError ? (
              <p
                id={quantityErrorId}
                className="text-destructive px-(--card-spacing) text-sm"
                role="alert"
              >
                {totalError}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>
                <StepNumber value={3} />
                Orders waiting on this stock
              </h3>
            </CardTitle>
            <CardDescription>
              Linked orders are flagged for release when the stock arrives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {held.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No orders are on hold without a request. This request will top up the district
                store.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-2" disabled={isBusy}>
                <legend className="sr-only">Held orders to link</legend>
                {held.map((order) => (
                  <label
                    key={order.id}
                    className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                      <Checkbox
                        checked={linked.includes(order.id)}
                        onChange={() => {
                          toggle(order.id);
                        }}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium break-words">
                          {order.id} · {order.hotspot.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          On hold · received {formatTimestamp(order.created_at)}
                        </span>
                      </span>
                    </span>
                    <span className="pl-7 text-sm tabular-nums sm:pl-0">
                      {formatQuantities(order.approved)}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor={noteId}>
              Comment for the warehouse{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id={noteId}
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              placeholder="e.g. Two hotspots in Katabi are out of stock"
              disabled={isBusy}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>Summary</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DetailList
              items={[
                { label: 'Ordered from', value: warehouse },
                { label: 'Ordered for', value: store.name },
                { label: 'Quantity', value: formatQuantities(items ?? NO_QUANTITIES) },
                { label: 'Held orders linked', value: formatNumber(linked.length) },
              ]}
            />
            {failure && !serverItemsError ? (
              <Alert variant="destructive">
                <AlertTitle>The request was not sent</AlertTitle>
                <AlertDescription>{getErrorMessage(failure)}</AlertDescription>
              </Alert>
            ) : null}
            <WriteAction>
              <Button type="submit" disabled={isBusy} className="w-full">
                {isBusy ? 'Sending…' : `Send request to ${warehouse}`}
              </Button>
            </WriteAction>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function StepNumber({ value }: { value: number }) {
  return (
    <span
      aria-hidden="true"
      className="bg-primary/10 text-success mr-2 inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold"
    >
      {value}
    </span>
  );
}
