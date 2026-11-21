'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';

import { DetailList } from '@/components/DetailList';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WriteAction } from '@/components/WriteAction';
import { productName, type Lookup, type Product } from '@/features/catalogue/api';
import { useLookups, useProducts } from '@/features/catalogue/queries';
import { getErrorMessage, toApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';

import type { Warehouse } from './api';
import { DCFP_PATHS, parseCount, warehouseLabel } from './orders';
import { usePlaceOrder, useWarehouses } from './queries';

/** The API's fields, for showing its validation messages beside the right control. */
type Field = 'warehouse_store_id' | 'condom_id' | 'quantity' | 'unit_of_measure_id';

export default function NewWarehouseOrderPage() {
  const warehouses = useWarehouses();
  const products = useProducts();
  const units = useLookups('units');
  // A stockout report's "Order stock" action names its product.
  const preselected = useSearchParams().get('product');

  const failed = warehouses.error ?? products.error;
  if (failed) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load the warehouses and products"
          error={failed}
          onRetry={() => {
            void warehouses.refetch();
            void products.refetch();
          }}
          isRetrying={warehouses.isRefetching || products.isRefetching}
        />
      </div>
    );
  }
  if (!warehouses.data || !products.data) return <PageSkeleton layout="form" />;
  return (
    <OrderForm
      warehouses={warehouses.data}
      products={products.data.filter((product) => product.active)}
      units={(units.data ?? []).filter((unit) => unit.active)}
      preselected={preselected}
    />
  );
}

interface OrderFormProps {
  warehouses: readonly Warehouse[];
  products: readonly Product[];
  units: readonly Lookup[];
  preselected: string | null;
}

function OrderForm({ warehouses, products, units, preselected }: OrderFormProps) {
  const router = useRouter();
  const place = usePlaceOrder();
  const commentId = useId();

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [productId, setProductId] = useState(
    products.some((product) => product.id === preselected) ? (preselected ?? '') : '',
  );
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [attempted, setAttempted] = useState(false);

  const product = products.find((candidate) => candidate.id === productId);
  // A product's catalogue unit is used unless it has none, when the DCFP chooses one.
  const needsUnit = product?.unit === null;
  const unitName = product?.unit?.name ?? units.find((unit) => unit.id === unitId)?.name ?? null;
  const count = parseCount(quantity);

  const serverErrors = place.error ? toApiError(place.error).fieldErrors : {};
  const serverError = (field: Field) => serverErrors[field]?.[0];
  const errors: Partial<Record<Field, string>> = {
    warehouse_store_id: warehouseId ? serverError('warehouse_store_id') : 'Choose NMS or JMS.',
    condom_id: productId ? serverError('condom_id') : 'Choose the product to order.',
    quantity:
      count === null || count < 1
        ? 'Enter how many to order, as a whole number.'
        : serverError('quantity'),
    unit_of_measure_id:
      needsUnit && !unitId
        ? 'This product has no unit in the catalogue; choose one.'
        : serverError('unit_of_measure_id'),
  };
  const shown = (field: Field) => (attempted || serverError(field) ? errors[field] : undefined);
  const hasErrors = Object.values(errors).some(Boolean);
  const formFailure =
    place.error && Object.keys(serverErrors).length === 0 ? getErrorMessage(place.error) : null;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (place.isPending || !warehouseId || !productId || count === null || count < 1) return;
    if (needsUnit && !unitId) return;
    place.reset();
    place.mutate(
      {
        warehouse_store_id: warehouseId,
        condom_id: productId,
        quantity: count,
        ...(needsUnit ? { unit_of_measure_id: unitId } : {}),
        comment: comment.trim() || null,
      },
      {
        onSuccess: (order) => {
          router.push(DCFP_PATHS.order(order.id));
        },
      },
    );
  }

  const busy = place.isPending;
  const warehouse = warehouses.find((candidate) => candidate.id === warehouseId);

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="new-order-heading"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <h2 id="new-order-heading" className="sr-only">
        Order stock from a warehouse
      </h2>
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>Order from</h3>
            </CardTitle>
            <CardDescription>
              The warehouse reviews the order, checks its stock, then dispatches it or holds it
              until stock arrives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioCardGroup
              legend="Warehouse"
              hideLegend
              layout="row"
              value={warehouseId || null}
              onValueChange={setWarehouseId}
              options={warehouses.map((candidate) => ({
                value: candidate.id,
                label: warehouseLabel(candidate),
                description: candidate.name,
              }))}
              error={shown('warehouse_store_id')}
              disabled={busy}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>What to order</h3>
            </CardTitle>
            <CardDescription>
              The product sets the condom type, male or female, its brand and channel.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SelectField
              label="Product"
              required
              value={productId}
              onValueChange={(value) => {
                setProductId(value);
                setUnitId('');
              }}
              options={products.map((candidate) => ({
                value: candidate.id,
                label: productName(candidate),
              }))}
              placeholder="Choose a product"
              error={shown('condom_id')}
              disabled={busy}
            />
            {needsUnit ? (
              <SelectField
                label="Unit"
                required
                value={unitId}
                onValueChange={setUnitId}
                options={units.map((unit) => ({ value: unit.id, label: unit.name }))}
                placeholder="Choose a unit"
                error={shown('unit_of_measure_id')}
                disabled={busy}
              />
            ) : null}
            <TextField
              label="Quantity"
              required
              inputMode="numeric"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
              }}
              description={unitName ? `In ${unitName}.` : undefined}
              error={shown('quantity')}
              disabled={busy}
              className="max-w-40 tabular-nums"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor={commentId}>
              Comment for the warehouse{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id={commentId}
              rows={3}
              maxLength={4000}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              placeholder="e.g. Two hotspots in Katabi are out of stock"
              disabled={busy}
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
                { label: 'Ordered from', value: warehouseLabel(warehouse) },
                { label: 'Product', value: product ? productName(product) : '—' },
                {
                  label: 'Quantity',
                  value:
                    count !== null && count > 0
                      ? `${formatNumber(count)}${unitName ? ` ${unitName}` : ''}`
                      : '—',
                },
              ]}
            />
            {formFailure ? (
              <Alert variant="destructive">
                <AlertTitle>The order was not sent</AlertTitle>
                <AlertDescription>{formFailure}</AlertDescription>
              </Alert>
            ) : null}
            {attempted && hasErrors ? (
              <p className="text-destructive text-sm" role="alert">
                Check the highlighted fields.
              </p>
            ) : null}
            <WriteAction>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Sending…' : `Send order to ${warehouseLabel(warehouse)}`}
              </Button>
            </WriteAction>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
