import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';

import type { Role } from './api';
import { LocationFields } from './LocationFields';
import { useCreateUser } from './queries';
import { RolePicker } from './RolePicker';
import {
  NEW_USER_DEFAULTS,
  NEW_USER_FIELDS,
  NEW_USER_SERVER_FIELDS,
  locationNeedFor,
  newUserSchemaFor,
  toNewUserInput,
  type NewUserFormInput,
  type NewUserFormOutput,
} from './userForm';

interface UserFormDialogProps {
  roles: readonly Role[] | undefined;
  isLoadingRoles: boolean;
  rolesError: unknown;
  onClose: () => void;
}

/**
 * Creates a user account (`POST /users`). Mount it to open; `onClose` unmounts it.
 * The API has no endpoint for editing a user's details afterwards, so this
 * dialog only creates; roles and status are changed from the row menu.
 */
export function UserFormDialog({
  roles,
  isLoadingRoles,
  rolesError,
  onClose,
}: UserFormDialogProps) {
  const createUser = useCreateUser();
  // The role chosen decides whether, and how precisely, the form asks where the person works.
  const roleNameOf = useMemo(
    () => (roleId: string) => roles?.find((role) => role.id === roleId)?.name ?? null,
    [roles],
  );
  const schema = useMemo(() => newUserSchemaFor(roleNameOf), [roleNameOf]);
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<NewUserFormInput, unknown, NewUserFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: NEW_USER_DEFAULTS,
  });
  const roleId = useWatch({ control, name: 'role_id' });
  const locationNeed = locationNeedFor(roleNameOf(roleId));

  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    createUser.mutate(toNewUserInput(values, locationNeedFor(roleNameOf(values.role_id))), {
      onSuccess: onClose,
      onError: (error) => {
        setFormError(formLevelError(error, NEW_USER_FIELDS, setError, NEW_USER_SERVER_FIELDS));
      },
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Add user"
      description="Create an account. The person signs in with this email address and password."
      submitLabel="Create user"
      pendingLabel="Creating…"
      isPending={createUser.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <TextField
        label="First name"
        required
        autoComplete="off"
        error={errors.firstname?.message}
        {...register('firstname')}
      />
      <TextField
        label="Last name"
        required
        autoComplete="off"
        error={errors.lastname?.message}
        {...register('lastname')}
      />
      <TextField
        label="Username"
        required
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.username?.message}
        {...register('username')}
      />
      <TextField
        label="Email"
        type="email"
        required
        autoComplete="off"
        spellCheck={false}
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Phone number"
        type="tel"
        autoComplete="off"
        placeholder="+256 7XX XXX XXX"
        error={errors.phone_number?.message}
        {...register('phone_number')}
      />
      <TextField
        label="Password"
        type="password"
        required
        autoComplete="new-password"
        description="At least 8 characters."
        error={errors.password?.message}
        {...register('password')}
      />
      <Controller
        control={control}
        name="role_id"
        render={({ field, fieldState }) => (
          <RolePicker
            roles={roles}
            isLoading={isLoadingRoles}
            loadError={rolesError}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={fieldState.error?.message}
          />
        )}
      />
      {locationNeed ? (
        <LocationFields
          need={locationNeed}
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
        />
      ) : null}
    </FormDialog>
  );
}
