'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, CircleOff, XCircle, type LucideIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormDialog } from '@/components/form/FormDialog';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/lib/api';

import type { Hotspot, HotspotDecision } from './api';
import { hotspotLabel } from './hotspotForm';
import { useHotspotDecision } from './queries';

export const DECISION_TEXT: Record<
  HotspotDecision,
  { verb: string; pending: string; icon: LucideIcon; explain: string; destructive: boolean }
> = {
  activate: {
    verb: 'Activate',
    pending: 'Activating…',
    icon: CircleCheck,
    explain: 'It comes into use. The VHT who submitted it is notified with your comment.',
    destructive: false,
  },
  deactivate: {
    verb: 'Deactivate',
    pending: 'Deactivating…',
    icon: CircleOff,
    explain: 'It goes out of use until you activate it again. The VHT sees your reason.',
    destructive: true,
  },
  reject: {
    verb: 'Reject',
    pending: 'Rejecting…',
    icon: XCircle,
    explain: 'The VHT who submitted it is notified, sees your reason and can edit it to resubmit.',
    destructive: true,
  },
};

const commentSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, 'Add a comment. It is kept with your decision.')
    .max(2000, 'Use at most 2000 characters.'),
});

interface DecisionDialogProps {
  hotspot: Pick<Hotspot, 'id' | 'name'>;
  decision: HotspotDecision;
  onClose: () => void;
}

/** Records a decision on a hotspot with the comment the API requires for it. */
export function DecisionDialog({ hotspot, decision, onClose }: DecisionDialogProps) {
  const decide = useHotspotDecision();
  const text = DECISION_TEXT[decision];
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<z.input<typeof commentSchema>, unknown, z.output<typeof commentSchema>>({
    resolver: zodResolver(commentSchema),
    defaultValues: { comment: '' },
  });
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${text.verb} ${hotspotLabel(hotspot)}?`}
      description={text.explain}
      submitLabel={`${text.verb} hotspot`}
      pendingLabel={text.pending}
      isPending={decide.isPending}
      isDirty={isDirty}
      error={decide.error ? getErrorMessage(decide.error) : null}
      onSubmit={handleSubmit(({ comment }) => {
        decide.mutate({ id: hotspot.id, decision, comment }, { onSuccess: onClose });
      })}
    >
      <TextField
        label="Comment"
        required
        autoComplete="off"
        error={errors.comment?.message}
        {...register('comment')}
      />
    </FormDialog>
  );
}
