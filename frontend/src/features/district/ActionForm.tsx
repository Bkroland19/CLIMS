import { CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface ActionFormProps {
  /** Names the form for assistive technology, e.g. "Send from the district store". */
  label: string;
  /** Names the step, e.g. "Send stock". */
  submitLabel: string;
  /** Shown on the button while the request is in flight, e.g. "Sending…". */
  pendingLabel: string;
  isPending: boolean;
  /** A refusal that belongs to no single field. */
  error: string | null;
  onSubmit: ComponentProps<'form'>['onSubmit'];
  children: ReactNode;
}

/**
 * A step on an order, set out on its page rather than in a dialog: fields in
 * two columns, a refusal above them, and one submit button that is disabled
 * while the step is being sent. The fields keep what was typed when it fails.
 */
export function ActionForm({
  label,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
  children,
}: ActionFormProps) {
  return (
    <form noValidate aria-label={label} onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>That did not go through</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
