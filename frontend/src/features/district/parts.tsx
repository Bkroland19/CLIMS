import { Info } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/hooks';

import type { OrderStatus } from './api';
import { alertStatus, requestStatus } from './orders';

/*
 * Small pieces the DCFP screens share. They know the district's domain, so
 * they live with the feature rather than in the shared components.
 */

/** The signed-in user's id and store, for "You" in histories and for scoping stock. */
export function useMe(): { id: string | null; storeId: string | null } {
  const user = useCurrentUser();
  return { id: user?.id ?? null, storeId: user?.store_id ?? null };
}

export function AlertStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = alertStatus(status);
  return <StatusBadge status={label} tone={tone} />;
}

export function RequestStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = requestStatus(status);
  return <StatusBadge status={label} tone={tone} />;
}

/** A name in a table that opens its record. */
export function RecordLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-foreground font-medium underline-offset-4 hover:underline focus-visible:underline"
    >
      {children}
    </Link>
  );
}

/**
 * Says a list stopped at its cap: `GET /orders` gives no total, so the client
 * reads up to 1,000 of one status and says so when there may be more.
 */
export function CappedListNotice({ complete, noun }: { complete: boolean; noun: string }) {
  if (complete) return null;
  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertDescription>
        Showing the newest 1,000 {noun}. Older ones are not listed here.
      </AlertDescription>
    </Alert>
  );
}

interface LoadedProps {
  isPending: boolean;
  error: unknown;
  /** E.g. "Could not load the district store". */
  errorTitle: string;
  onRetry: () => void;
  isRetrying?: boolean;
  children: ReactNode;
}

/** A card's content once its data has loaded, a placeholder before, and a retry after a failure. */
export function Loaded({
  isPending,
  error,
  errorTitle,
  onRetry,
  isRetrying,
  children,
}: LoadedProps) {
  if (error) {
    return (
      <ErrorState title={errorTitle} error={error} onRetry={onRetry} isRetrying={isRetrying} />
    );
  }
  if (isPending) return <Skeleton className="h-24 w-full" />;
  return children;
}
