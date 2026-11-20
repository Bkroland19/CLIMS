import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface FormProblemProps {
  title: string;
  /** The failure to show, or `null` for none (e.g. when it was shown beside the fields). */
  message: string | null;
}

/** A step's form-level failure, announced when it appears. */
export function FormProblem({ title, message }: FormProblemProps) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
