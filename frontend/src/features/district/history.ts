import type { ActivityEntry, ActivityRole } from '@/components/ActivityTimeline';

import type { OrderEvent } from './api';
import type { OrderKind } from './orders';

/*
 * An order's history in words. The API names who took a step by id only, and
 * a DCFP cannot read other users' names, so a step reads "You" when the
 * signed-in user took it and otherwise names the role the step belongs to.
 */

interface Step {
  text: string;
  /** Who takes this step, in words. */
  who: string;
  role: ActivityRole;
}

const REPORTER: Pick<Step, 'who' | 'role'> = {
  who: 'Hotspot manager or VHT',
  role: 'hotspot-manager',
};
const DCFP: Pick<Step, 'who' | 'role'> = { who: 'District focal person', role: 'dcfp' };
const WAREHOUSE: Pick<Step, 'who' | 'role'> = { who: 'Warehouse', role: 'warehouse' };
const RIDER: Pick<Step, 'who' | 'role'> = { who: 'Rider', role: 'rider' };

function alertStep(event: OrderEvent): Step | null {
  switch (event.action) {
    case 'stockout_reported':
      return { text: 'Stockout reported', ...REPORTER };
    case 'dispatch':
      return { text: 'Stock sent from the district store with a rider', ...DCFP };
    case 'request-replenishment':
      return { text: 'Asked the warehouse for stock; the alert waits on hold', ...DCFP };
    case 'deliver':
      return { text: 'Delivered to the hotspot', ...RIDER };
    default:
      return null;
  }
}

function requestStep(event: OrderEvent): Step | null {
  switch (event.action) {
    case 'replenishment_requested':
      return { text: 'Request sent to the warehouse', ...DCFP };
    case 'review':
      return { text: 'Reviewed by the warehouse', ...WAREHOUSE };
    case 'check-stock':
      return event.status === 'on_hold'
        ? { text: 'The warehouse is short of stock; the request waits', ...WAREHOUSE }
        : { text: 'The warehouse confirmed the stock', ...WAREHOUSE };
    case 'dispatch':
      return { text: 'Shipped by the warehouse', ...WAREHOUSE };
    case 'receive':
      return { text: 'Received at the district store', ...DCFP };
    default:
      return null;
  }
}

/** A step no wording is written for, in the API's words and a neutral role. */
function plainStep(event: OrderEvent): Step {
  const words = event.action.replaceAll(/[-_]/g, ' ');
  return {
    text: words.charAt(0).toUpperCase() + words.slice(1),
    who: 'System',
    role: 'system',
  };
}

/**
 * The timeline entries for an order's events, oldest first. `me` is the
 * signed-in user's id; `formatTime` formats an ISO timestamp.
 */
export function orderHistory(
  kind: OrderKind,
  events: readonly OrderEvent[],
  me: string | null,
  formatTime: (iso: string) => string,
): ActivityEntry[] {
  return [...events]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((event) => {
      const step = (kind === 'request' ? requestStep(event) : alertStep(event)) ?? plainStep(event);
      const who = me !== null && event.actor_id === me ? `You · ${step.who}` : step.who;
      return {
        id: event.id,
        text: step.text,
        meta: `${who} · ${formatTime(event.created_at)}`,
        role: step.role,
      };
    });
}
