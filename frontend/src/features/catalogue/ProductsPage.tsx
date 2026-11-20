'use client';

import { Ban, CircleCheck, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { ExportButton } from '@/components/ExportButton';
import { PageActions } from '@/components/PageActions';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';

import { categoryLabel, productName, type Product } from './api';
import { ProductFormDialog } from './ProductFormDialog';
import { useProducts, useSetProductActive, useUnits } from './queries';

/** Condom products: one entry per brand, type and unit. NOT YET IN THE GO API (mock data). */
export default function ProductsPage() {
  const products = useProducts();
  const units = useUnits();
  const setActive = useSetProductActive();
  const [isAdding, setIsAdding] = useState(false);

  const columns = useMemo<DataTableColumn<Product>[]>(
    () => [
      {
        id: 'product',
        header: 'Product',
        value: productName,
        cell: (product) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{productName(product)}</div>
            <div className="text-muted-foreground font-mono text-xs">{product.id}</div>
          </div>
        ),
      },
      { id: 'category', header: 'Category', value: (product) => categoryLabel(product.category) },
      { id: 'unit', header: 'Unit', value: (product) => product.unit.name },
      {
        id: 'per',
        header: 'Condoms per unit',
        numeric: true,
        value: (product) => product.pieces_per_unit,
        cell: (product) => formatNumber(product.pieces_per_unit),
      },
      {
        id: 'minimum',
        header: 'Minimum (pieces)',
        numeric: true,
        value: (product) => product.minimum_level,
        cell: (product) =>
          product.minimum_level === null ? '—' : formatNumber(product.minimum_level),
      },
      {
        id: 'status',
        header: 'Status',
        value: (product) => (product.active ? 'Active' : 'Inactive'),
        cell: (product) => (
          <StatusBadge
            status={product.active ? 'Active' : 'Inactive'}
            tone={product.active ? 'positive' : 'neutral'}
          />
        ),
      },
    ],
    [],
  );

  const addButton = (
    <Button
      onClick={() => {
        setIsAdding(true);
      }}
    >
      <Plus data-icon="inline-start" />
      Add product
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The products" />
      <PageActions>
        <ExportButton name="Products" columns={columns} rows={products.data} />
        {addButton}
      </PageActions>
      <DataTable
        label="Products"
        columns={columns}
        rows={products.data}
        getRowId={(product) => product.id}
        isLoading={products.isPending}
        error={products.error}
        onRetry={() => void products.refetch()}
        isRetrying={products.isRefetching}
        searchPlaceholder="Search products…"
        emptyTitle="No products yet"
        emptyDescription="Add the condom products that are stocked, ordered and distributed."
        emptyAction={addButton}
        rowActions={(product) => (
          <RowActions
            label={`Actions for ${product.id}`}
            actions={[
              product.active
                ? {
                    label: 'Deactivate',
                    icon: Ban,
                    destructive: true,
                    onSelect: () => {
                      setActive.mutate({ id: product.id, active: false });
                    },
                  }
                : {
                    label: 'Activate',
                    icon: CircleCheck,
                    onSelect: () => {
                      setActive.mutate({ id: product.id, active: true });
                    },
                  },
            ]}
          />
        )}
      />
      {isAdding ? (
        <ProductFormDialog
          units={units.data}
          isLoadingUnits={units.isPending}
          unitsError={units.error}
          onClose={() => {
            setIsAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}
