import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getErrorMessage, toApiError, useApiQuery, useHttp } from '@/lib/api';

import {
  createLookup,
  createProduct,
  deleteLookup,
  deleteProduct,
  listLookups,
  listProducts,
  productName,
  updateLookup,
  updateProduct,
  type Lookup,
  type LookupInput,
  type LookupKind,
  type LookupPatch,
  type Product,
  type ProductInput,
  type ProductPatch,
} from './api';
import { LOOKUP_TEXT } from './lookupKinds';

const ROOT = 'catalogue';
export const catalogueKeys = {
  all: [ROOT] as const,
  products: [ROOT, 'products'] as const,
  lookups: (kind: LookupKind) => [ROOT, kind] as const,
};

export function useProducts() {
  return useApiQuery(catalogueKeys.products, listProducts);
}

export function useLookups(kind: LookupKind) {
  return useApiQuery(catalogueKeys.lookups(kind), (http, signal) =>
    listLookups(http, kind, signal),
  );
}

/**
 * Products show their brand's and unit's names, and brands and units count their
 * products, so any catalogue write refetches the whole catalogue.
 */
function useInvalidateCatalogue() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogueKeys.all });
}

export function useCreateProduct() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(http, input),
    onSuccess: async (product) => {
      toast.success(`${productName(product)} added to the catalogue`);
      await invalidate();
    },
    // The form places field-level messages itself.
    meta: { handlesOwnErrors: true },
  });
}

export function useUpdateProduct() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductPatch }) =>
      updateProduct(http, id, patch),
    onSuccess: async (product) => {
      toast.success(`${productName(product)} saved`);
      await invalidate();
    },
    meta: { handlesOwnErrors: true },
  });
}

export function useSetProductActive() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ product, active }: { product: Product; active: boolean }) =>
      updateProduct(http, product.id, { active }),
    onSuccess: async (product) => {
      toast.success(`${productName(product)} ${product.active ? 'activated' : 'deactivated'}`);
      await invalidate();
    },
    onError: (error, { product }) => {
      // Activating an incomplete product is refused field by field; say what to do instead.
      toast.error(
        toApiError(error).kind === 'validation'
          ? `Complete the details of ${productName(product)} before activating it.`
          : getErrorMessage(error),
      );
    },
    meta: { handlesOwnErrors: true },
  });
}

export function useDeleteProduct() {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (product: Product) => deleteProduct(http, product.id),
    onSuccess: async (_, product) => {
      toast.success(`${productName(product)} deleted`);
      await invalidate();
    },
    // The confirmation dialog shows a refusal, such as the product being in use.
    meta: { handlesOwnErrors: true },
  });
}

export function useCreateLookup(kind: LookupKind) {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: LookupInput) => createLookup(http, kind, input),
    onSuccess: async (lookup) => {
      toast.success(`${lookup.name} added to ${LOOKUP_TEXT[kind].plural}`);
      await invalidate();
    },
    meta: { handlesOwnErrors: true },
  });
}

export function useUpdateLookup(kind: LookupKind) {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LookupPatch }) =>
      updateLookup(http, kind, id, patch),
    onSuccess: async (lookup) => {
      toast.success(`${lookup.name} saved`);
      await invalidate();
    },
    meta: { handlesOwnErrors: true },
  });
}

export function useSetLookupActive(kind: LookupKind) {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ lookup, active }: { lookup: Lookup; active: boolean }) =>
      updateLookup(http, kind, lookup.id, { active }),
    onSuccess: async (lookup) => {
      toast.success(`${lookup.name} ${lookup.active ? 'activated' : 'deactivated'}`);
      await invalidate();
    },
  });
}

export function useDeleteLookup(kind: LookupKind) {
  const http = useHttp();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (lookup: Lookup) => deleteLookup(http, kind, lookup.id),
    onSuccess: async (_, lookup) => {
      toast.success(`${lookup.name} deleted`);
      await invalidate();
    },
    meta: { handlesOwnErrors: true },
  });
}
