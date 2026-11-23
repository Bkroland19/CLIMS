import { useId, type ComponentProps } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

interface TextareaFieldProps extends ComponentProps<typeof Textarea> {
  label: string;
  /** Validation message; its presence marks the field invalid. */
  error?: string;
  /** Guidance shown under the field, e.g. what the note is for. */
  description?: string;
}

/**
 * A labelled multi-line input with its guidance and error wired up for
 * assistive technology: `TextField` for text longer than a line, such as a
 * note or a comment. Usage: `<TextareaField label="Note" required
 * error={errors.note?.message} {...register('note')} />`.
 */
export function TextareaField({
  label,
  error,
  description,
  required,
  id: providedId,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  rows = 3,
  ...textareaProps
}: TextareaFieldProps) {
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
      <Textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : invalid}
        aria-describedby={
          [descriptionId, errorId, describedBy].filter(Boolean).join(' ') || undefined
        }
        {...textareaProps}
      />
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
