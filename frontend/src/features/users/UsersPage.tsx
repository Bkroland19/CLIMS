'use client';

import { Ban, CircleCheck, MonitorSmartphone, Plus, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import {
  ROW_ACTION_SEPARATOR,
  RowActions,
  type RowActionItem,
} from '@/components/data-table/RowActions';
import { ExportButton } from '@/components/ExportButton';
import { FilterSelect } from '@/components/FilterSelect';
import { FilterTabs } from '@/components/FilterTabs';
import { PageActions } from '@/components/PageActions';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/hooks';
import { useCan } from '@/features/auth/queries';
import { getErrorMessage } from '@/lib/api';
import { initialsOf } from '@/lib/format';

import type { User } from './api';
import { isActive, roleLabel, userRoleLabels, userStatusLabel } from './access';
import { EditRolesDialog } from './EditRolesDialog';
import { useAccessRoles, useSetUserStatus, useUsers } from './queries';
import { UserFormDialog } from './UserFormDialog';
import { UserSessionsDialog } from './UserSessionsDialog';
import { userDisplayName } from './userForm';

export const USERS_PATH = '/moh/users';

/** The status filters, in the order shown. `status` in the address picks one. */
const STATUS_FILTERS = [
  { value: 'all', label: 'All', keeps: () => true },
  { value: 'active', label: 'Active', keeps: (user) => isActive(user) },
  { value: 'disabled', label: 'Deactivated', keeps: (user) => !isActive(user) },
] as const satisfies readonly { value: string; label: string; keeps: (user: User) => boolean }[];

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

function statusFilterFrom(param: string | null): (typeof STATUS_FILTERS)[number] {
  return STATUS_FILTERS.find((filter) => filter.value === param) ?? STATUS_FILTERS[0];
}

/** The users list address for a set of filters, leaving out the defaults. */
export function usersHref({ status, role }: { status: StatusFilter; role: string }): string {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (role !== 'all') params.set('role', role);
  const query = params.toString();
  return query ? `${USERS_PATH}?${query}` : USERS_PATH;
}

type Dialog =
  { kind: 'create' } | { kind: 'roles'; user: User } | { kind: 'sessions'; user: User } | null;

export default function UsersPage() {
  const users = useUsers();
  const roles = useAccessRoles();
  const currentUser = useCurrentUser();
  const can = useCan();
  const setStatus = useSetUserStatus();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  // Each row's actions button, so a dialog opened from its menu can hand focus back to it.
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());

  /** Sends focus back to a row's actions button as a dialog closes, if the row is still shown. */
  function focusRowActions(userId: string, event: Event) {
    const button = actionButtons.current.get(userId);
    if (!button?.isConnected) return;
    event.preventDefault();
    button.focus();
  }

  const statusFilter = statusFilterFrom(searchParams.get('status'));
  const roleParam = searchParams.get('role') ?? 'all';
  const role = roles.data?.some((candidate) => candidate.id === roleParam) ? roleParam : 'all';

  const columns = useMemo<DataTableColumn<User>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        value: userDisplayName,
        cell: (user) => (
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
            >
              {initialsOf(userDisplayName(user))}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium" title={userDisplayName(user)}>
                {userDisplayName(user)}
              </p>
              <p className="text-muted-foreground truncate text-xs" title={user.email ?? undefined}>
                {user.email ?? user.username}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        value: (user) => userRoleLabels(user).join(', '),
        cell: (user) => {
          const labels = userRoleLabels(user);
          if (labels.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <ul className="flex flex-wrap gap-1">
              {labels.map((label) => (
                <li key={label}>
                  <Badge variant="secondary">{label}</Badge>
                </li>
              ))}
            </ul>
          );
        },
      },
      { id: 'phone', header: 'Phone', value: (user) => user.phone_number },
      {
        id: 'status',
        header: 'Status',
        value: (user) => userStatusLabel(user.status),
        cell: (user) => (
          <StatusBadge
            status={userStatusLabel(user.status)}
            tone={isActive(user) ? 'positive' : 'neutral'}
          />
        ),
      },
    ],
    [],
  );

  const byRole = users.data?.filter(
    (user) => role === 'all' || user.roles.some((held) => held.id === role),
  );
  const rows = byRole?.filter(statusFilter.keeps);
  const isFiltered = statusFilter.value !== 'all' || role !== 'all';
  // Actions the API would refuse are left out, matching each endpoint's permission.
  const canCreate = can('users:create', 'roles:assign');
  const canAssignRoles = can('roles:assign');
  const canUpdate = can('users:update');

  const addButton = canCreate ? (
    <Button
      onClick={() => {
        setDialog({ kind: 'create' });
      }}
    >
      <Plus data-icon="inline-start" />
      Add user
    </Button>
  ) : null;

  function reactivate(user: User) {
    setStatus.mutate(
      { id: user.id, status: 'active' },
      {
        onError: (error) => {
          toast.error(getErrorMessage(error));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageActions>
        <ExportButton name="Users" columns={columns} rows={rows} />
        {addButton}
      </PageActions>

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Filter users by status"
          value={statusFilter.value}
          hrefFor={(value) => usersHref({ status: value, role })}
          tabs={STATUS_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            ...(byRole ? { count: byRole.filter(option.keeps).length } : {}),
          }))}
        />
        <FilterSelect
          label="Role"
          value={role}
          disabled={!roles.data}
          options={[
            { value: 'all', label: 'All roles' },
            ...(roles.data ?? []).map((option) => ({
              value: option.id,
              label: roleLabel(option),
            })),
          ]}
          onValueChange={(next) => {
            router.replace(usersHref({ status: statusFilter.value, role: next }));
          }}
        />
      </div>

      <DataTable
        label="Users"
        columns={columns}
        rows={rows}
        getRowId={(user) => user.id}
        isLoading={users.isPending}
        error={users.error}
        onRetry={() => void users.refetch()}
        isRetrying={users.isRefetching}
        searchPlaceholder="Search name, email or phone…"
        emptyTitle={isFiltered ? 'No users match these filters' : 'No users yet'}
        emptyDescription={
          isFiltered
            ? 'Choose another status or role to see the rest.'
            : canCreate
              ? 'Add the first account so someone else can sign in.'
              : 'Accounts appear here once an administrator adds them.'
        }
        emptyAction={isFiltered ? undefined : addButton}
        rowActions={(user) => {
          // Deactivating the account you are signed in with would lock you out mid-session.
          const isSelf = currentUser !== null && currentUser.id === user.id;
          return (
            <RowActions
              label={`Actions for ${userDisplayName(user)}`}
              triggerRef={(button) => {
                if (button) actionButtons.current.set(user.id, button);
                else actionButtons.current.delete(user.id);
              }}
              actions={[
                ...(canAssignRoles
                  ? ([
                      {
                        label: 'Edit roles',
                        icon: ShieldCheck,
                        onSelect: () => {
                          setDialog({ kind: 'roles', user });
                        },
                      },
                    ] satisfies RowActionItem[])
                  : []),
                {
                  label: 'Signed-in devices',
                  icon: MonitorSmartphone,
                  onSelect: () => {
                    setDialog({ kind: 'sessions', user });
                  },
                },
                ...(isSelf || !canUpdate
                  ? []
                  : ([
                      ROW_ACTION_SEPARATOR,
                      isActive(user)
                        ? {
                            label: 'Deactivate user',
                            icon: Ban,
                            destructive: true,
                            onSelect: () => {
                              setUserToDeactivate(user);
                            },
                          }
                        : {
                            label: 'Reactivate user',
                            icon: CircleCheck,
                            onSelect: () => {
                              reactivate(user);
                            },
                          },
                    ] satisfies RowActionItem[])),
              ]}
            />
          );
        }}
      />

      {dialog?.kind === 'create' ? (
        <UserFormDialog
          roles={roles.data}
          isLoadingRoles={roles.isPending}
          rolesError={roles.error}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'sessions' ? (
        <UserSessionsDialog
          key={dialog.user.id}
          user={dialog.user}
          // Signing yourself out everywhere is done from your own account menu, one device at a time.
          canSignOut={canUpdate && currentUser?.id !== dialog.user.id}
          onClose={() => {
            setDialog(null);
          }}
          onCloseAutoFocus={(event) => {
            focusRowActions(dialog.user.id, event);
          }}
        />
      ) : null}
      {dialog?.kind === 'roles' ? (
        <EditRolesDialog
          key={dialog.user.id}
          user={dialog.user}
          roles={roles.data}
          isLoadingRoles={roles.isPending}
          rolesError={roles.error}
          onClose={() => {
            setDialog(null);
          }}
          onCloseAutoFocus={(event) => {
            focusRowActions(dialog.user.id, event);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={userToDeactivate !== null}
        onOpenChange={(open) => {
          if (open) return;
          setUserToDeactivate(null);
          setStatus.reset();
        }}
        title={
          userToDeactivate ? `Deactivate ${userDisplayName(userToDeactivate)}?` : 'Deactivate user?'
        }
        description="They will no longer be able to sign in. You can reactivate the account later."
        confirmLabel="Deactivate user"
        isPending={setStatus.isPending}
        error={setStatus.error}
        onConfirm={() => {
          if (!userToDeactivate) return;
          setStatus.mutate(
            { id: userToDeactivate.id, status: 'disabled' },
            {
              onSuccess: () => {
                setUserToDeactivate(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
