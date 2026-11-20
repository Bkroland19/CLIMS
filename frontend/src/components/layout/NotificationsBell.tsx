import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

/** One in-app notification. */
export interface AppNotification {
  id: string;
  /** What happened, as a sentence. */
  text: string;
  /** Who, which record and when, e.g. "Grace Nakato · ORD-1042 · 10 min ago". */
  meta: string;
  /** Sets the colour of the dot beside it. */
  tone: StatusTone;
}

const DOT_CLASSES: Record<StatusTone, string> = {
  positive: 'bg-success',
  info: 'bg-info',
  caution: 'bg-warning',
  negative: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

/** Above this the badge shows "9+": the exact number stops mattering. */
const MAX_COUNT = 9;

interface NotificationsBellProps {
  /**
   * The user's notifications, newest first. `undefined` means there is no
   * notification feed to read from yet, which the popover says plainly rather
   * than claiming there is nothing new.
   */
  notifications?: readonly AppNotification[];
}

/**
 * The top bar's bell: a count of notifications and, on click, the list.
 *
 * Usage: `<NotificationsBell notifications={items} />`. Leave `notifications`
 * out while no feed exists.
 */
export function NotificationsBell({ notifications }: NotificationsBellProps) {
  const count = notifications?.length ?? 0;
  const countLabel = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground relative"
          aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        >
          <Bell className="size-4.5" aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="bg-destructive ring-background text-background absolute top-0.5 right-0 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-bold ring-2"
            >
              {countLabel}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="rounded-card w-95 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-3.5">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <span className="text-muted-foreground text-xs">In-app</span>
        </div>
        {notifications === undefined ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm text-pretty">
            Notifications are not connected yet.
          </p>
        ) : count === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id} className="flex gap-3 border-b px-3 py-3 last:border-b-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    DOT_CLASSES[notification.tone],
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-pretty">{notification.text}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{notification.meta}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
