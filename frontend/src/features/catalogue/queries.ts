import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  createProduct,
  createUnit,
  listProducts,
  listUnits,
  productName,
  setProductActive,
  type NewProductInput,
  type NewUnitInput,
} from './api';

/* NOT YET IN THE GO API: these read and write the mock catalogue (see ./api.ts). */

const ROOT = 'catalogue';
export const catalogueKeys = {
  all: [ROOT] as const,
  products: [ROOT, 'products'] as const,
  units: [ROOT, 'units'] as const,
};

export function useProducts() {
  return useApiQuery(catalogueKeys.products, listProducts);
}

export function useUnits() {
  return useApiQuery(catalogueKeys.units, listUnits);
}

/** Products and units refer to each other (a unit's product count), so a write refetches both. */
function useInvalidateCatalogue() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogueKeys.all });
}

export function useCreateProduct() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: NewProductInput) => createProduct(http, input),
    onSuccess: async (product) => {
      toast.success(`${productName(product)} added to the catalogue`);
      await invalidate();
    },
    // The form places field-level messages itself.
    meta: { handlesOwnErrors: true },
  });
}

export function useSetProductActive() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setProductActive(http, id, active),
    onSuccess: async (product) => {
      toast.success(`${product.id} ${product.active ? 'activated' : 'deactivated'}`);
      await invalidate();
    },
  });
}

export function useCreateUnit() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: NewUnitInput) => createUnit(http, input),
    onSuccess: async (unit) => {
      toast.success(`${unit.name} added to units of measure`);
      await invalidate();
    },
    meta: { handlesOwnErrors: true },
  });
}
