import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { ErrorState } from '@/components/states/ErrorState';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

/** One in-app notification. */
export interface AppNotification {
  id: string;
  /** What happened, as a sentence. */
  text: string;
  /** More about it, under the text, e.g. the message itself. */
  detail?: string;
  /** Who, which record and when, e.g. "Grace Nakato · ORD-1042 · 10 min ago". */
  meta: string;
  /** Sets the colour of the dot beside it. */
  tone: StatusTone;
  /** Not read yet: shown in bold and announced as unread. */
  unread?: boolean;
  /** The page it opens. Without one, choosing it only marks it read. */
  href?: string | null;
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

const PLACEHOLDER_ROWS = 3;

interface NotificationsBellProps {
  /**
   * The user's notifications, newest first. `undefined` means there is no
   * notification feed to read from yet, which the popover says plainly rather
   * than claiming there is nothing new.
   */
  notifications?: readonly AppNotification[];
  /** The number on the badge. Defaults to the number of notifications given. */
  unreadCount?: number;
  /** The list is on its way: placeholders show instead of an all-clear. */
  isLoading?: boolean;
  /** Why the list could not be loaded; shown when there is no list to fall back on. */
  error?: unknown;
  /** Offered with `error` to load the list again. */
  onRetry?: () => void;
  /** Called when the user opens a notification, e.g. to mark it read. */
  onOpenNotification?: (notification: AppNotification) => void;
  /** Shown beside the heading, e.g. a "Mark all read" button. */
  action?: ReactNode;
  /** Told when the list opens or closes, e.g. to load it only once someone looks. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * The top bar's bell: the unread count and, on click, the list. A
 * notification with an `href` is a link that closes the list as it opens the
 * page; with `onOpenNotification`, one without is a button that reports it was
 * read. Either way the callback receives it, read or not.
 *
 * Usage:
 *
 * ```tsx
 * <NotificationsBell
 *   notifications={items}
 *   unreadCount={unread}
 *   isLoading={isPending}
 *   error={error}
 *   onRetry={refetch}
 *   onOpenNotification={(item) => markRead(item.id)}
 *   action={<Button size="sm" variant="ghost" onClick={markAllRead}>Mark all read</Button>}
 *   onOpenChange={setOpen}
 * />
 * ```
 *
 * Leave `notifications` out while no feed exists.
 */
export function NotificationsBell({
  notifications,
  unreadCount,
  isLoading = false,
  error,
  onRetry,
  onOpenNotification,
  action,
  onOpenChange,
}: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const count = unreadCount ?? notifications?.length ?? 0;
  const countLabel = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  let body: ReactNode;
  if (notifications !== undefined && notifications.length > 0) {
    body = (
      <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
        {notifications.map((notification) => (
          <li key={notification.id} className="border-b last:border-b-0">
            <Entry
              notification={notification}
              onOpen={() => {
                onOpenNotification?.(notification);
                if (notification.href) changeOpen(false);
              }}
              canMarkRead={onOpenNotification !== undefined}
            />
          </li>
        ))}
      </ul>
    );
  } else if (isLoading) {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-4 px-3 py-4">
        <span className="sr-only">Loading notifications…</span>
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <div key={index} aria-hidden="true" className="flex gap-3">
            <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = <ErrorState title="Could not load notifications" error={error} onRetry={onRetry} />;
  } else if (notifications === undefined) {
    body = (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm text-pretty">
        Notifications are not connected yet.
      </p>
    );
  } else {
    body = (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        You&apos;re all caught up.
      </p>
    );
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
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
        <div className="flex min-h-12 items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {action ?? <span className="text-muted-foreground text-xs">In-app</span>}
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}

interface EntryProps {
  notification: AppNotification;
  onOpen: () => void;
  /** Whether choosing a notification without a page marks it read. */
  canMarkRead: boolean;
}

const ENTRY_CLASSES = 'flex w-full gap-3 px-3 py-3 text-left';
const INTERACTIVE_CLASSES =
  'hover:bg-muted focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset';

/** One notification: a link to its page, a button that marks it read, or plain text. */
function Entry({ notification, onOpen, canMarkRead }: EntryProps) {
  const { text, detail, meta, tone, unread = false, href } = notification;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT_CLASSES[tone])}
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn('text-sm leading-snug text-pretty', unread && 'font-semibold')}>
          {unread ? <span className="sr-only">Unread: </span> : null}
          {text}
        </span>
        {detail ? (
          <span className="text-muted-foreground mt-0.5 line-clamp-2 text-sm text-pretty break-words">
            {detail}
          </span>
        ) : null}
        <span className="text-muted-foreground mt-1 text-xs">{meta}</span>
      </span>
    </>
  );
  const rowClasses = cn(ENTRY_CLASSES, unread && 'bg-muted/50');

  if (href) {
    return (
      <Link href={href} onClick={onOpen} className={cn(rowClasses, INTERACTIVE_CLASSES)}>
        {content}
      </Link>
    );
  }
  // Still a button once read, so focus stays put when the mark is cleared.
  if (canMarkRead) {
    return (
      <button type="button" onClick={onOpen} className={cn(rowClasses, INTERACTIVE_CLASSES)}>
        {content}
      </button>
    );
  }
  return <div className={rowClasses}>{content}</div>;
}
