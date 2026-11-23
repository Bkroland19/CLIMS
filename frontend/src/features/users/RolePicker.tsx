import { Radio } from '@/components/ui/radio';
import { useId, type Ref } from 'react';

import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { Role } from './api';
import { RoleOption } from './RoleOption';

interface RolePickerProps {
  roles: readonly Role[] | undefined;
  isLoading: boolean;
  /** Set when the roles could not be fetched. */
  loadError?: unknown;
  /** The id of the role chosen, or blank. */
  value: string;
  onChange: (roleId: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Lets the form focus the group when it is the first field in error. */
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Every role as a card, one of which can be chosen. Arrow keys move between
 * them. Spans both columns of a `FormDialog`.
 */
export function RolePicker({
  roles,
  isLoading,
  loadError,
  value,
  onChange,
  onBlur,
  error,
  inputRef,
  className,
}: RolePickerProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const message = error ?? (loadError ? getErrorMessage(loadError) : undefined);
  const list = roles ?? [];
  // The chosen radio is the group's tab stop, so focus goes there; before a choice, the first.
  const focusIndex = Math.max(
    0,
    list.findIndex((role) => role.id === value),
  );

  return (
    <FieldSet
      role="radiogroup"
      className={cn('sm:col-span-2', className)}
      aria-labelledby={`${id}-legend`}
      aria-describedby={[descriptionId, message ? errorId : null].filter(Boolean).join(' ')}
      aria-invalid={message ? true : undefined}
      aria-required
    >
      <FieldLegend id={`${id}-legend`} variant="label">
        Role
      </FieldLegend>
      <FieldDescription id={descriptionId} className="-mt-3">
        What the person can see and do. Choose one role.
      </FieldDescription>
      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : !loadError && list.length === 0 ? (
        <p className="text-muted-foreground text-sm">No roles to choose from.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((role, index) => {
            const checked = value === role.id;
            return (
              <li key={role.id}>
                <RoleOption role={role} selected={checked}>
                  <Radio
                    ref={index === focusIndex ? inputRef : undefined}
                    name={id}
                    value={role.id}
                    checked={checked}
                    className="focus-visible:ring-ring mt-0.5 size-4 shrink-0 cursor-pointer outline-none focus-visible:ring-2"
                    onBlur={onBlur}
                    onChange={() => {
                      onChange(role.id);
                    }}
                  />
                </RoleOption>
              </li>
            );
          })}
        </ul>
      )}
      {message ? <FieldError id={errorId}>{message}</FieldError> : null}
    </FieldSet>
  );
}
