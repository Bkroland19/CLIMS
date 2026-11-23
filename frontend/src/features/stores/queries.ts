import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import { getGeography, listStores, syncGeography } from './api';

/* Stores are live; geography and sync still use the mock contract (see ./api.ts). */

export const storesKeys = {
  stores: ['stores'] as const,
  geography: ['geography'] as const,
};

export function useStores() {
  return useApiQuery(storesKeys.stores, listStores);
}

export function useGeography() {
  return useApiQuery(storesKeys.geography, getGeography);
}

export function useSyncGeography() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncGeography(http),
    onSuccess: async ({ changes }) => {
      toast.success(
        changes === 0
          ? 'DHIS2 sync finished. No new organisation units.'
          : `DHIS2 sync finished. ${changes} organisation unit${changes === 1 ? '' : 's'} changed.`,
      );
      await queryClient.invalidateQueries({ queryKey: storesKeys.geography });
    },
  });
}
