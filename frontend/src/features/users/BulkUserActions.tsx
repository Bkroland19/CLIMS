import { Ban, CircleCheck, LogOut, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ExportButton } from '@/components/ExportButton';
import { Button } from '@/components/ui/button';
import type { ExportColumn } from '@/lib/export/excel';
import { formatNumber } from '@/lib/format';

import type { User } from './api';
import { isActive } from './access';
import { useBulkUserAction, type BulkUserAction } from './queries';
import { userDisplayName } from './userForm';

const people = (count: number) => `${formatNumber(count)} ${count === 1 ? 'user' : 'users'}`;

interface ActionCopy {
  /** Who it applies to among those selected. */
  eligible: (user: User, selfId: string | null) => boolean;
  button: string;
  title: (count: number) => string;
  description: string;
  confirm: string;
  /** The toast once done, e.g. "Deactivated 3 users". */
  done: (count: number) => string;
}

const ACTIONS: Record<BulkUserAction, ActionCopy> = {
  'sign-out': {
    eligible: (user, selfId) => user.id !== selfId,
    button: 'Sign out everywhere',
    title: (count) => `Sign ${people(count)} out everywhere?`,
    description:
      'Every device they are signed in on is signed out. They can sign in again straight away; to stop that, deactivate them instead.',
    confirm: 'Sign out everywhere',
    done: (count) => `Signed ${people(count)} out everywhere`,
  },
  deactivate: {
    eligible: (user, selfId) => isActive(user) && user.id !== selfId,
    button: 'Deactivate',
    title: (count) => `Deactivate ${people(count)}?`,
    description:
      'They will no longer be able to sign in, and their open sessions stop working. You can reactivate them later.',
    confirm: 'Deactivate',
    done: (count) => `Deactivated ${people(count)}`,
  },
  reactivate: {
    eligible: (user) => !isActive(user),
    button: 'Reactivate',
    title: (count) => `Reactivate ${people(count)}?`,
    description: 'They will be able to sign in again with their existing password.',
    confirm: 'Reactivate',
    done: (count) => `Reactivated ${people(count)}`,
  },
};

const ICONS = { 'sign-out': LogOut, deactivate: Ban, reactivate: CircleCheck } as const;

interface BulkUserActionsProps {
  /** The ticked users still shown in the list. */
  selected: readonly User[];
  /** The signed-in user, who is never signed out or deactivated from here. */
  selfId: string | null;
  /** Holds `users:update`; without it only export is offered. */
  canUpdate: boolean;
  exportColumns: readonly ExportColumn<User>[];
  onClear: () => void;
}

/**
 * The bar that appears once users are ticked: how many, and what can be done
 * to all of them. Each action counts only the users it applies to (you are
 * never deactivated from here, an active user is not "reactivated") and asks
 * before it runs. It sticks to the bottom of the screen while the list scrolls.
 */
export function BulkUserActions({
  selected,
  selfId,
  canUpdate,
  exportColumns,
  onClear,
}: BulkUserActionsProps) {
  const bulk = useBulkUserAction();
  const [pending, setPending] = useState<BulkUserAction | null>(null);
  if (selected.length === 0) return null;

  const targetsOf = (action: BulkUserAction) =>
    selected.filter((user) => ACTIONS[action].eligible(user, selfId));
  const copy = pending ? ACTIONS[pending] : null;
  const targets = pending ? targetsOf(pending) : [];
  const skipped = selected.length - targets.length;

  function run(action: BulkUserAction) {
    bulk.mutate(
      { action, users: targetsOf(action) },
      {
        onSuccess: ({ done, failed }) => {
          setPending(null);
          if (done.length > 0) toast.success(ACTIONS[action].done(done.length));
          if (failed.length > 0) {
            const names = failed.map(({ user }) => userDisplayName(user)).join(', ');
            toast.error(`${people(failed.length)} could not be changed: ${names}`, {
              description: failed[0]?.error.message,
            });
          }
          if (failed.length === 0) onClear();
        },
      },
    );
  }

  return (
    <div
      role="region"
      aria-label="Selected users"
      data-print-hide
      className="bg-card rounded-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 sticky bottom-4 z-30 flex flex-col gap-3 border p-3 shadow-lg sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {people(selected.length)} selected
        </p>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X data-icon="inline-start" aria-hidden="true" />
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <ExportButton name="Selected users" columns={exportColumns} rows={selected} />
        {canUpdate
          ? (['sign-out', 'reactivate', 'deactivate'] as const).map((action) => {
              const count = targetsOf(action).length;
              const Icon = ICONS[action];
              return (
                <Button
                  key={action}
                  variant={action === 'deactivate' ? 'destructive' : 'outline'}
                  disabled={count === 0}
                  onClick={() => {
                    setPending(action);
                  }}
                >
                  <Icon data-icon="inline-start" aria-hidden="true" />
                  {ACTIONS[action].button}
                  <span className="tabular-nums">({formatNumber(count)})</span>
                </Button>
              );
            })
          : null}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (open || bulk.isPending) return;
          setPending(null);
          bulk.reset();
        }}
        title={copy ? copy.title(targets.length) : ''}
        description={
          copy
            ? `${copy.description}${skipped > 0 ? ` ${people(skipped)} of those ticked ${skipped === 1 ? 'is' : 'are'} left out, as it does not apply to them.` : ''}${bulk.progress ? ` Done ${formatNumber(bulk.progress.done)} of ${formatNumber(bulk.progress.total)}.` : ''}`
            : ''
        }
        confirmLabel={copy?.confirm ?? ''}
        isPending={bulk.isPending}
        error={bulk.error}
        onConfirm={() => {
          if (pending) run(pending);
        }}
      />
    </div>
  );
}
