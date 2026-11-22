import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Who took an action. Each has its own dot colour (`--role-*` tokens). */
export type ActivityRole =
  'hotspot-manager' | 'vht' | 'dcfp' | 'warehouse' | 'rider' | 'moh' | 'system';

const ROLE_DOT_CLASSES: Record<ActivityRole, string> = {
  'hotspot-manager': 'bg-role-hotspot-manager',
  vht: 'bg-role-vht',
  dcfp: 'bg-role-dcfp',
  warehouse: 'bg-role-warehouse',
  rider: 'bg-role-rider',
  moh: 'bg-role-moh',
  system: 'bg-role-system',
};

export interface ActivityEntry {
  /** Stable key, e.g. the event ID. */
  id: string;
  /** What happened, in a sentence. */
  text: ReactNode;
  /**
   * The line under it: who, in which role, and when, e.g. "Sarah N. · DCFP ·
   * Today, 09:12". Name the role in words here; the dot colour only repeats it.
   */
  meta: ReactNode;
  role: ActivityRole;
}

interface ActivityTimelineProps extends Omit<ComponentProps<'ol'>, 'children'> {
  /** In the order to show them. The caller decides oldest or newest first. */
  entries: readonly ActivityEntry[];
  /**
   * `connected` joins the dots with a line, for one record's full history.
   * `compact` is a tighter feed of events across records, for a dashboard.
   */
  variant?: 'connected' | 'compact';
}

/**
 * Events as a list, each with a dot in the colour of the role that acted.
 * Shows only the list: give it a heading, and handle loading, empty and error
 * states, where it is used.
 *
 * ```tsx
 * <ActivityTimeline entries={[
 *   { id: 'e1', text: 'Order ORD-104 confirmed', meta: 'Sarah N. · DCFP · Today, 09:12', role: 'dcfp' },
 * ]} />
 * ```
 */
export function ActivityTimeline({
  entries,
  variant = 'connected',
  className,
  ...props
}: ActivityTimelineProps) {
  const isConnected = variant === 'connected';
  return (
    <ol className={cn('flex flex-col', className)} {...props}>
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-role={entry.role}
          className={cn('flex', isConnected ? 'gap-3' : 'gap-2.5 pb-3')}
        >
          <span aria-hidden="true" className="flex flex-col items-center">
            <span
              className={cn(
                'shrink-0 rounded-full',
                isConnected ? 'mt-1.25 size-2.5' : 'mt-1.5 size-2',
                ROLE_DOT_CLASSES[entry.role],
              )}
            />
            {isConnected ? <span className="bg-border my-1 w-px flex-1" /> : null}
          </span>
          <span className={cn('min-w-0', isConnected && 'pb-3')}>
            <span
              className={cn('block leading-snug', isConnected ? 'text-sm' : 'text-[0.8125rem]')}
            >
              {entry.text}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{entry.meta}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
