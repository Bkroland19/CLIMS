import { useId, type Ref } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { Role } from './api';
import { roleDescription, roleLabel } from './access';

interface RoleChecklistProps {
  roles: readonly Role[] | undefined;
  isLoading: boolean;
  /** Set when the roles could not be fetched. */
  loadError?: unknown;
  /** The ids of the roles ticked. */
  value: readonly string[];
  onChange: (roleIds: string[]) => void;
  onBlur?: () => void;
  error?: string;
  /** Lets the form focus the list when it is the first field in error. */
  firstCheckboxRef?: Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Every role as a ticked or unticked line. A user can hold more than one role.
 * The whole list spans both columns of a `FormDialog`.
 */
export function RoleChecklist({
  roles,
  isLoading,
  loadError,
  value,
  onChange,
  onBlur,
  error,
  firstCheckboxRef,
  className,
}: RoleChecklistProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const message = error ?? (loadError ? getErrorMessage(loadError) : undefined);

  return (
    <FieldSet
      className={cn('sm:col-span-2', className)}
      aria-describedby={[descriptionId, message ? errorId : null].filter(Boolean).join(' ')}
      aria-invalid={message ? true : undefined}
    >
      <FieldLegend variant="label">Roles</FieldLegend>
      <FieldDescription id={descriptionId} className="-mt-3">
        What the person can see and do. A user can hold more than one role.
      </FieldDescription>
      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {(roles ?? []).map((role, index) => {
            const checked = value.includes(role.id);
            const description = roleDescription(role);
            return (
              <li key={role.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
                    checked ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                >
                  <Checkbox
                    ref={index === 0 ? firstCheckboxRef : undefined}
                    className="mt-0.5"
                    checked={checked}
                    onBlur={onBlur}
                    onChange={() => {
                      onChange(
                        checked
                          ? value.filter((roleId) => roleId !== role.id)
                          : [...value, role.id],
                      );
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{roleLabel(role)}</span>
                    {description ? (
                      <span className="text-muted-foreground block text-xs">{description}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {message ? <FieldError id={errorId}>{message}</FieldError> : null}
    </FieldSet>
  );
}
