import { Monitor, MonitorSmartphone, MonitorX, Smartphone, type LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode, type Ref } from 'react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTimestamp } from '@/lib/format';

import { describeDevice, type DeviceKind, type DeviceSession } from './deviceSessions';

const ICONS: Readonly<Record<DeviceKind, LucideIcon>> = {
  phone: Smartphone,
  computer: Monitor,
  unknown: MonitorSmartphone,
};

/** When the session was last used, signed in, and from where; the current one is in use now. */
function sessionDetails(session: DeviceSession): string[] {
  return [
    session.current ? 'Active now' : `Last active ${formatTimestamp(session.last_seen_at)}`,
    `Signed in ${formatTimestamp(session.created_at)}`,
    session.ip_address ? `IP ${session.ip_address}` : null,
  ].filter((part) => part !== null);
}

/**
 * The details as one line that wraps between its parts, never inside one, so
 * "IP" stays with its address. A part wider than the row still wraps.
 */
function DetailParts({ parts }: { parts: readonly string[] }) {
  return parts.map((part, index) => {
    const last = index === parts.length - 1;
    return (
      <Fragment key={part}>
        <span className="inline-block max-w-full wrap-anywhere">
          {part}
          {last ? '' : ' ·'}
        </span>
        {last ? '' : ' '}
      </Fragment>
    );
  });
}

interface DeviceSessionListProps {
  /** Signed-in sessions only, in display order (see `liveSessions`). */
  sessions: readonly DeviceSession[];
  /** Names the list for screen readers, e.g. "Your signed-in devices". */
  label: string;
  /** A control at the end of a row, such as its sign-out button. */
  action?: (session: DeviceSession, device: string) => ReactNode;
  /** Takes focus after a row is removed, so it does not fall back to the dialog. */
  ref?: Ref<HTMLUListElement>;
}

/** One row per signed-in device: what it is, when it was last used, and from where. */
export function DeviceSessionList({ sessions, label, action, ref }: DeviceSessionListProps) {
  return (
    <ul
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className="divide-border focus-visible:ring-ring flex flex-col divide-y rounded-lg border outline-none focus-visible:ring-2"
    >
      {sessions.map((session) => {
        const device = describeDevice(session.user_agent);
        const Icon = ICONS[device.kind];
        return (
          <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  title={session.user_agent ?? undefined}
                >
                  {device.label}
                </span>
                {session.current ? <Badge variant="secondary">This device</Badge> : null}
              </p>
              <p className="text-muted-foreground text-xs">
                <DetailParts parts={sessionDetails(session)} />
              </p>
            </div>
            {action ? <div className="shrink-0">{action(session, device.label)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Three placeholder rows shaped like the list, while it loads. */
export function DeviceSessionListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading devices"
      className="divide-border flex flex-col divide-y rounded-lg border"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface DeviceSessionsViewProps extends Omit<DeviceSessionListProps, 'sessions'> {
  /** Signed-in sessions; undefined while loading or after a failure. */
  sessions: readonly DeviceSession[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  isRetrying: boolean;
  /** Says no device is signed in, naming whose account it is. */
  emptyDescription: string;
}

/** The device list with its loading, failed and empty states. */
export function DeviceSessionsView({
  sessions,
  isPending,
  error,
  onRetry,
  isRetrying,
  emptyDescription,
  ...list
}: DeviceSessionsViewProps) {
  if (isPending) return <DeviceSessionListSkeleton />;
  if (error || !sessions) {
    return (
      <ErrorState
        title="Could not load signed-in devices"
        error={error}
        onRetry={onRetry}
        isRetrying={isRetrying}
      />
    );
  }
  if (sessions.length === 0) {
    return (
      <EmptyState icon={MonitorX} title="Not signed in anywhere" description={emptyDescription} />
    );
  }
  return <DeviceSessionList sessions={sessions} {...list} />;
}
