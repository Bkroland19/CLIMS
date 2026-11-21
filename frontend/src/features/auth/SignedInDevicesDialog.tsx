import { CircleAlert, LogOut } from 'lucide-react';
import { useRef } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage, toApiError } from '@/lib/api';

import { liveSessions } from './deviceSessions';
import { DeviceSessionsView } from './DeviceSessionList';
import { useMySessions, useRevokeMySession } from './queries';

interface SignedInDevicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes; the dialog was opened from a menu that is gone by then. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** A failed sign-out, said in terms of the device rather than the request. */
function revokeError(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.kind === 'not_found') return 'That device was already signed out.';
  return getErrorMessage(apiError);
}

/**
 * Where the signed-in user's account is signed in (`GET /auth/sessions`), with
 * a way to sign any other device out (`DELETE /auth/sessions/:id`). This
 * device is signed out from the account menu instead.
 */
export function SignedInDevicesDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: SignedInDevicesDialogProps) {
  const sessions = useMySessions(open);
  const revoke = useRevokeMySession();
  const listRef = useRef<HTMLUListElement>(null);
  const live = sessions.data ? liveSessions(sessions.data) : undefined;
  const others = live?.filter((session) => !session.current).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) revoke.reset();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Signed-in devices</DialogTitle>
          <DialogDescription>
            Where your account is signed in now. If you do not recognise a device, sign it out and
            tell your administrator.
          </DialogDescription>
        </DialogHeader>

        {revoke.isError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Could not sign that device out</AlertTitle>
            <AlertDescription>{revokeError(revoke.error)}</AlertDescription>
          </Alert>
        ) : null}

        <DeviceSessionsView
          ref={listRef}
          label="Your signed-in devices"
          sessions={live}
          isPending={sessions.isPending}
          error={sessions.error}
          onRetry={() => void sessions.refetch()}
          isRetrying={sessions.isRefetching}
          emptyDescription="Your account has no active sessions."
          action={(session, device) => {
            if (session.current) return null;
            const isRevoking = revoke.isPending && revoke.variables.id === session.id;
            return (
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(session, {
                    onSuccess: () => {
                      listRef.current?.focus();
                    },
                  });
                }}
              >
                {isRevoking ? (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <LogOut data-icon="inline-start" aria-hidden="true" />
                )}
                {isRevoking ? 'Signing out…' : 'Sign out'}
                {/* Leads with a comma so no name algorithm runs the words together. */}
                <span className="sr-only">{`, ${device}`}</span>
              </Button>
            );
          }}
        />

        {live && live.length > 0 && others === 0 ? (
          <p className="text-muted-foreground text-sm">
            This is the only device signed in to your account.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
