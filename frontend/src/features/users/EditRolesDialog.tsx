import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { formLevelError } from '@/components/form/serverErrors';

import type { Role, User } from './api';
import { useSetUserRoles } from './queries';
import { RoleChecklist } from './RoleChecklist';
import {
  USER_ROLES_FIELDS,
  userDisplayName,
  userRolesSchema,
  type UserRolesForm,
} from './userForm';

interface EditRolesDialogProps {
  user: User;
  roles: readonly Role[] | undefined;
  isLoadingRoles: boolean;
  rolesError: unknown;
  onClose: () => void;
}

/** Replaces the roles a user holds (`PUT /users/:id/roles`). Mount it to open. */
export function EditRolesDialog({
  user,
  roles,
  isLoadingRoles,
  rolesError,
  onClose,
}: EditRolesDialogProps) {
  const setRoles = useSetUserRoles(user.id);
  const {
    control,
    handleSubmit,
    setError,
    formState: { isDirty },
  } = useForm<UserRolesForm>({
    resolver: zodResolver(userRolesSchema),
    defaultValues: { role_ids: user.roles.map((role) => role.id) },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setRoles.mutate(values.role_ids, {
      onSuccess: onClose,
      onError: (error) => {
        setFormError(formLevelError(error, USER_ROLES_FIELDS, setError));
      },
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Roles for ${userDisplayName(user)}`}
      description="Tick every role this person holds. The change applies at their next request."
      submitLabel="Save roles"
      pendingLabel="Saving…"
      isPending={setRoles.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="role_ids"
        render={({ field, fieldState }) => (
          <RoleChecklist
            roles={roles}
            isLoading={isLoadingRoles}
            loadError={rolesError}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            firstCheckboxRef={field.ref}
            error={fieldState.error?.message}
          />
        )}
      />
    </FormDialog>
  );
}
