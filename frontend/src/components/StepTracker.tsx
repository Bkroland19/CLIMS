import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Where a step stands. `attention` is a step that is blocked or needs someone
 * to act; `skipped` is a step this record does not need.
 */
export type StepState = 'done' | 'current' | 'attention' | 'skipped' | 'upcoming';

export interface Step {
  /** Stable key, e.g. the step's code. */
  id: string;
  label: string;
  /** One short line under the label, e.g. who did it and when. */
  detail?: string;
  state: StepState;
}

/** The word above each step, so its state is never shown by colour alone. */
export type StepKicker = (state: StepState, position: number) => string;

export const defaultStepKicker: StepKicker = (state, position) => {
  switch (state) {
    case 'done':
      return 'Done';
    case 'current':
      return 'In progress';
    case 'attention':
      return 'Needs attention';
    case 'skipped':
      return 'Not needed';
    case 'upcoming':
      return `Step ${position}`;
  }
};

const BAR_CLASSES: Record<StepState, string> = {
  done: 'bg-primary',
  current: 'bg-foreground',
  attention: 'bg-warning',
  skipped: 'h-0 border-t-4 border-dashed border-border',
  upcoming: 'bg-border',
};

const KICKER_CLASSES: Record<StepState, string> = {
  done: 'text-success',
  current: 'text-foreground',
  attention: 'text-warning',
  skipped: 'text-muted-foreground',
  upcoming: 'text-muted-foreground',
};

const LABEL_CLASSES: Record<StepState, string> = {
  done: 'text-foreground font-medium',
  current: 'text-foreground font-semibold',
  attention: 'text-warning font-semibold',
  skipped: 'text-muted-foreground',
  upcoming: 'text-muted-foreground',
};

interface StepTrackerProps extends Omit<ComponentProps<'ol'>, 'children'> {
  steps: readonly Step[];
  /** Names the list for screen readers, e.g. "Order progress". */
  'aria-label': string;
  /** Overrides the word above each step. */
  kicker?: StepKicker;
}

/**
 * A record's progress as a row of steps that wraps on narrow screens. Each
 * step has a bar, a state word, its label and an optional detail line. The
 * current step is marked with `aria-current="step"`.
 *
 * ```tsx
 * <StepTracker aria-label="Order progress" steps={[
 *   { id: 'received', label: 'Received', detail: 'Today, 09:12', state: 'done' },
 *   { id: 'review', label: 'Review', state: 'current' },
 *   { id: 'dispatch', label: 'Dispatch', state: 'upcoming' },
 * ]} />
 * ```
 */
export function StepTracker({
  steps,
  kicker = defaultStepKicker,
  className,
  ...props
}: StepTrackerProps) {
  return (
    <ol className={cn('flex flex-wrap gap-3', className)} {...props}>
      {steps.map((step, index) => (
        <li
          key={step.id}
          data-state={step.state}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex min-w-0 flex-[1_1_6.5rem] flex-col gap-1.5"
        >
          <span aria-hidden="true" className={cn('h-1 rounded-full', BAR_CLASSES[step.state])} />
          <span
            className={cn(
              'mt-1 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase',
              KICKER_CLASSES[step.state],
            )}
          >
            {kicker(step.state, index + 1)}
            <span className="sr-only">: </span>
          </span>
          <span className="min-w-0">
            <span className={cn('block text-sm', LABEL_CLASSES[step.state])}>{step.label}</span>
            {step.detail ? (
              <span className="text-muted-foreground mt-px block text-xs">{step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
