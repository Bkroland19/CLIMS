import { useId, type ComponentProps } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface TextFieldProps extends ComponentProps<typeof Input> {
  label: string;
  /** Validation message; its presence marks the field invalid. */
  error?: string;
  /** Guidance shown under the field, e.g. the expected format. */
  description?: string;
}

/** A labelled input with its guidance and error wired up for assistive technology. */
export function TextField({
  label,
  error,
  description,
  required,
  id: providedId,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? null : <span className="text-muted-foreground font-normal">(optional)</span>}
      </FieldLabel>
      <Input
        id={id}
        required={required}
        aria-invalid={error ? true : invalid}
        aria-describedby={
          [descriptionId, errorId, describedBy].filter(Boolean).join(' ') || undefined
        }
        {...inputProps}
      />
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
