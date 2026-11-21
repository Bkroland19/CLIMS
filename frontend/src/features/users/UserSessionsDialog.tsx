import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { liveSessions } from '@/features/auth/deviceSessions';
import { DeviceSessionsView } from '@/features/auth/DeviceSessionList';
import { formatNumber } from '@/lib/format';

import type { User } from './api';
import { useRevokeUserSessions, useUserSessions } from './queries';
import { userDisplayName } from './userForm';

const devices = (count: number) => `${formatNumber(count)} device${count === 1 ? '' : 's'}`;

interface UserSessionsDialogProps {
  user: User;
  /** Holds `users:update` and is not looking at their own account. */
  canSignOut: boolean;
  onClose: () => void;
  /** Where focus goes on close, e.g. the row's actions button that opened it. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Where a user is signed in (`GET /users/:id/sessions`), and a way to sign them
 * out on every device at once (`DELETE /users/:id/sessions`). Mount it to open.
 */
export function UserSessionsDialog({
  user,
  canSignOut,
  onClose,
  onCloseAutoFocus,
}: UserSessionsDialogProps) {
  const sessions = useUserSessions(user.id);
  const revoke = useRevokeUserSessions(user.id);
  const [confirming, setConfirming] = useState(false);
  const name = userDisplayName(user);
  const live = sessions.data ? liveSessions(sessions.data) : undefined;
  const count = live?.length ?? 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Signed-in devices</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            Where {name} is signed in now.
          </DialogDescription>
        </DialogHeader>

        <DeviceSessionsView
          label={`Devices signed in as ${name}`}
          sessions={live}
          isPending={sessions.isPending}
          error={sessions.error}
          onRetry={() => void sessions.refetch()}
          isRetrying={sessions.isRefetching}
          emptyDescription={`${name} has no active sessions.`}
        />

        {canSignOut && count > 0 ? (
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(true);
              }}
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out everywhere
            </Button>
          </DialogFooter>
        ) : null}

        {/* Inside the dialog's content, so the two stack and focus returns here when it closes. */}
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => {
            if (open) return;
            setConfirming(false);
            revoke.reset();
          }}
          title={`Sign ${name} out everywhere?`}
          description={`This ends their session on ${devices(count)}. They can sign in again straight away; to stop that, deactivate the account instead.`}
          confirmLabel="Sign out everywhere"
          isPending={revoke.isPending}
          error={revoke.error}
          onConfirm={() => {
            revoke.mutate(undefined, {
              onSuccess: (revoked) => {
                setConfirming(false);
                toast.success(
                  revoked > 0
                    ? `Signed ${name} out of ${devices(revoked)}`
                    : `${name} was not signed in anywhere`,
                );
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
