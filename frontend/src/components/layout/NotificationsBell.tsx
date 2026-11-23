import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
  /** False once read; read notifications stay listed but leave the count. Defaults to unread. */
  unread?: boolean;
  /** The screen it opens, if it has one. */
  href?: string;
}

/** What the bell can do with the feed, when the feed supports it. */
export interface NotificationActions {
  /** Called when a notification is opened, e.g. to mark it read. */
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
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
  actions?: NotificationActions;
}

/**
 * The top bar's bell: a count of notifications and, on click, the list.
 *
 * Usage: `<NotificationsBell notifications={items} />`. Leave `notifications`
 * out while no feed exists.
 */
export function NotificationsBell({ notifications, actions }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const count = notifications?.filter((notification) => notification.unread !== false).length ?? 0;
  const countLabel = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);
  const isEmpty = notifications?.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground relative"
          aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        >
          <Bell className="size-4" aria-hidden="true" />
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
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {actions && count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={actions.onMarkAllRead}
            >
              Mark all read
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">In-app</span>
          )}
        </div>
        {notifications === undefined ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm text-pretty">
            Notifications are not connected yet.
          </p>
        ) : isEmpty ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {notifications.map((notification) => {
              const read = notification.unread === false;
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      read ? 'bg-border' : DOT_CLASSES[notification.tone],
                    )}
                  />
                  <div className="min-w-0">
                    {read ? null : <span className="sr-only">Unread:</span>}
                    <p
                      className={cn(
                        'text-sm leading-snug text-pretty',
                        read && 'text-muted-foreground',
                      )}
                    >
                      {notification.text}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{notification.meta}</p>
                  </div>
                </>
              );
              const openItem = () => {
                actions?.onOpen(notification);
                setOpen(false);
              };
              return (
                <li key={notification.id} className="border-b last:border-b-0">
                  {notification.href ? (
                    <Link
                      href={notification.href}
                      onClick={openItem}
                      className="hover:bg-accent focus-visible:bg-accent flex gap-3 px-3 py-2.5 outline-none"
                    >
                      {content}
                    </Link>
                  ) : actions && !read ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={openItem}
                      className="hover:bg-accent focus-visible:bg-accent flex h-auto min-h-7 w-full justify-start gap-3 px-3 py-2.5 text-left whitespace-normal outline-none"
                    >
                      {content}
                    </Button>
                  ) : (
                    <div className="flex gap-3 px-3 py-2.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
