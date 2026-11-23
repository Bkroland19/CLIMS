import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { formLevelError } from '@/components/form/serverErrors';

import type { Role, User } from './api';
import { useSetUserRoles } from './queries';
import { RolePicker } from './RolePicker';
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
  /** Where focus goes on close; see `FormDialog`. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** Replaces the roles a user holds (`PUT /users/:id/roles`). Mount it to open. */
export function EditRolesDialog({
  user,
  roles,
  isLoadingRoles,
  rolesError,
  onClose,
  onCloseAutoFocus,
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
      description={
        user.roles.length > 1
          ? 'This person currently holds multiple roles. Choose one role to replace them. The change applies at their next request.'
          : 'Choose one role for this person. The change applies at their next request.'
      }
      submitLabel="Save role"
      pendingLabel="Saving…"
      isPending={setRoles.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <Controller
        control={control}
        name="role_ids"
        render={({ field, fieldState }) => (
          <RolePicker
            roles={roles}
            isLoading={isLoadingRoles}
            loadError={rolesError}
            value={field.value.length === 1 ? (field.value[0] ?? '') : ''}
            onChange={(roleId) => {
              field.onChange([roleId]);
            }}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={fieldState.error?.message}
          />
        )}
      />
    </FormDialog>
  );
}
