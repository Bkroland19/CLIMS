import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  actOnHotspot,
  listDistricts,
  listHotspotNotifications,
  listHotspots,
  submitHotspot,
  type HotspotAction,
  type HotspotSubmission,
} from './api';

const hotspotsKey = ['hotspots'] as const;

export function useHotspots() {
  return useApiQuery(hotspotsKey, listHotspots);
}

export function useHotspotNotifications() {
  return useApiQuery([...hotspotsKey, 'notifications'], listHotspotNotifications);
}

export function useDistricts() {
  return useApiQuery(['districts'], listDistricts);
}

export function useSubmitHotspot() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HotspotSubmission) => submitHotspot(http, input),
    onSuccess: async () => {
      toast.success('Hotspot submitted for district verification');
      await queryClient.invalidateQueries({ queryKey: hotspotsKey });
    },
    meta: { handlesOwnErrors: true },
  });
}

const actionToasts: Record<HotspotAction, string> = {
  verify: 'Hotspot verified',
  activate: 'Hotspot activated',
  reject: 'Hotspot rejected',
};

export function useHotspotAction() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: HotspotAction; reason?: string }) =>
      actOnHotspot(http, id, action, reason),
    onSuccess: async (_, { action }) => {
      toast.success(actionToasts[action]);
      await queryClient.invalidateQueries({ queryKey: hotspotsKey });
    },
  });
}
