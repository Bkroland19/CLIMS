import type { ActivityEntry, ActivityRole } from '@/components/ActivityTimeline';
import { formatTimestamp } from '@/lib/format';

import type { Activity } from './api';

const ROLES: Record<Activity['role'], ActivityRole> = {
  hotspot_manager: 'hotspot-manager',
  vht: 'vht',
  dcfp: 'dcfp',
  warehouse: 'warehouse',
  rider: 'rider',
  moh: 'moh',
  system: 'system',
};

/**
 * Activity events as timeline entries. A feed across records leads its meta
 * line with the record; one record's history leaves it out and names the role.
 */
export function timelineEntries(
  events: readonly Activity[],
  { feed = false, now }: { feed?: boolean; now?: Date } = {},
): ActivityEntry[] {
  return events.map((event) => ({
    id: event.id,
    text: event.text,
    meta: (feed
      ? [event.reference, event.actor, formatTimestamp(event.at, now)]
      : [event.actor, event.role_label, formatTimestamp(event.at, now)]
    )
      .filter(Boolean)
      .join(' · '),
    role: ROLES[event.role],
  }));
}

/** One record's history, oldest first. */
export function historyOf(events: readonly Activity[], references: readonly string[]): Activity[] {
  return events
    .filter((event) => event.reference !== null && references.includes(event.reference))
    .sort((a, b) => a.at.localeCompare(b.at));
}
