import { useMemo } from 'react';

import { productName } from '@/features/catalogue/api';
import { useLookups, useProducts } from '@/features/catalogue/queries';
import { formatNumber } from '@/lib/format';

import type { Warehouse } from './api';
import { categoryLabel, warehouseLabel } from './orders';
import { useWarehouses } from './queries';

/** Said after the number of an order whose product, and so its unit, the warehouse has not chosen. */
export const UNIT_PENDING = 'unit set by warehouse';

export interface OrderNames {
  /** The product's name, else the category requested until the warehouse chooses a product. */
  product: (id: string | null, category: string | null) => string;
  warehouse: (id: string) => Warehouse | undefined;
  /**
   * "500 boxes"; "500 · unit set by warehouse" before the warehouse has chosen the product (an
   * order names a category and a number, and takes the product's unit at review); the bare number
   * while units load.
   */
  quantity: (value: number | null, unitId: string | null) => string;
  warehouseLabel: (id: string) => string;
  warehouses: readonly Warehouse[] | undefined;
  /** The first failure among the lookups, for the page's error state. */
  error: unknown;
  isPending: boolean;
  refetch: () => void;
}

/**
 * Orders carry ids only; this names their product, unit and warehouse from the catalogue and
 * the national stores. Names that have not loaded fall back to something readable rather
 * than an id.
 */
export function useOrderNames(): OrderNames {
  const products = useProducts();
  const units = useLookups('units');
  const warehouses = useWarehouses();

  return useMemo(() => {
    const productById = new Map((products.data ?? []).map((p) => [p.id, productName(p)]));
    const unitById = new Map((units.data ?? []).map((u) => [u.id, u.name]));
    const warehouseById = new Map((warehouses.data ?? []).map((w) => [w.id, w]));
    return {
      product: (id, category) =>
        (id ? productById.get(id) : undefined) || categoryLabel(category) || 'Condoms',
      warehouse: (id) => warehouseById.get(id),
      warehouseLabel: (id) => warehouseLabel(warehouseById.get(id)),
      quantity: (value, unitId) => {
        if (value === null) return '—';
        if (unitId === null) return `${formatNumber(value)} · ${UNIT_PENDING}`;
        const unit = unitById.get(unitId);
        return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
      },
      warehouses: warehouses.data,
      // Units only label quantities, so their failure leaves numbers bare rather than blocking.
      error: products.error ?? warehouses.error,
      isPending: products.isPending || warehouses.isPending,
      refetch: () => {
        void products.refetch();
        void warehouses.refetch();
      },
    } satisfies OrderNames;
  }, [products, units, warehouses]);
}
