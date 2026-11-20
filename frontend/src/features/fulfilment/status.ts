import type { StatusTone } from '@/lib/status';

import type { HotspotOrder, OrderStatus, RequestStatus, Rider } from './api';

interface StatusLabel {
  label: string;
  tone: StatusTone;
}

/** How each hotspot order status is shown, as the prototype words it. */
export const ORDER_STATUS: Record<OrderStatus, StatusLabel> = {
  queued: { label: 'In queue', tone: 'info' },
  on_hold: { label: 'On hold', tone: 'caution' },
  confirmed: { label: 'Confirmed', tone: 'positive' },
  dispatched: { label: 'With rider', tone: 'info' },
  in_transit: { label: 'Out for delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'positive' },
  // A closed order: nothing left to do, so neutral rather than good news.
  received: { label: 'Received', tone: 'neutral' },
};

/** How each warehouse request status is shown to the district. */
export const REQUEST_STATUS: Record<RequestStatus, StatusLabel> = {
  sent: { label: 'Sent', tone: 'info' },
  under_review: { label: 'Under review', tone: 'info' },
  queued: { label: 'Queued', tone: 'info' },
  on_hold: { label: 'On hold', tone: 'caution' },
  dispatched: { label: 'In transit', tone: 'info' },
  received: { label: 'Received', tone: 'positive' },
};

export const RIDER_STATUS: Record<Rider['status'], StatusLabel> = {
  available: { label: 'Available', tone: 'positive' },
  on_delivery: { label: 'On delivery', tone: 'info' },
  off_duty: { label: 'Off duty', tone: 'neutral' },
};

export const WAREHOUSE_NAMES = { NMS: 'National Medical Stores', JMS: 'Joint Medical Store' };

/** Orders waiting for the DCFP to review them. */
export const isInQueue = (status: OrderStatus) => status === 'queued';
/** Orders that are out with a rider or at the hotspot, not yet closed. */
export const isInDelivery = (status: OrderStatus) =>
  status === 'dispatched' || status === 'in_transit' || status === 'delivered';
/** Requests the warehouse has not dispatched yet. */
export const isAwaitingWarehouse = (status: RequestStatus) =>
  status === 'sent' || status === 'under_review' || status === 'queued' || status === 'on_hold';

/** "Kasenyi, Katabi TC": where a hotspot is, or an empty string when no place is recorded. */
export function placeOf(hotspot: Pick<HotspotOrder['hotspot'], 'village' | 'subcounty'>): string {
  return [hotspot.village, hotspot.subcounty].filter(Boolean).join(', ');
}
