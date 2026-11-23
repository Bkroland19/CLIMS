import { CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Names the action, e.g. "Create user". */
  submitLabel: string;
  /** Shown on the button while the request is in flight, e.g. "Creating…". */
  pendingLabel: string;
  isPending: boolean;
  /** True once the user has changed a field. */
  isDirty?: boolean;
  /**
   * A failure that belongs to no single field (network down, conflict, server
   * error). Shown in the dialog, next to the form it is about.
   */
  error?: string | null;
  onSubmit: ComponentProps<'form'>['onSubmit'];
  /** Where focus goes on close, when the element that opened the dialog has gone. */
  onCloseAutoFocus?: (event: Event) => void;
  /** The submit removes something, e.g. writing off a whole batch. */
  destructive?: boolean;
  children: ReactNode;
}

/** A dialog holding one form: fields in two columns, cancel and submit in the footer. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  isPending,
  isDirty = false,
  error,
  onSubmit,
  onCloseAutoFocus,
  destructive = false,
  children,
}: FormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-request would hide whether the save went through.
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
        onInteractOutside={(event) => {
          // A stray click on the backdrop must not throw away typed input.
          // Cancel, the close button and Escape still dismiss.
          if (isDirty) event.preventDefault();
        }}
      >
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={isPending}
            >
              {isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
