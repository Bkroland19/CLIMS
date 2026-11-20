import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface RadioCardOption<Value extends string> {
  value: Value;
  label: string;
  /** A second line, e.g. "Entebbe · usual lead time 1–2 days". */
  description?: string;
  /** Shown at the end of the card, e.g. a `StatusBadge`. */
  aside?: ReactNode;
  disabled?: boolean;
}

interface RadioCardGroupProps<Value extends string> {
  /** The question the group answers; it is the group's accessible name. */
  legend: string;
  /** Hides the legend visually; it is still read out. */
  hideLegend?: boolean;
  options: readonly RadioCardOption<Value>[];
  value: Value | null;
  onValueChange: (value: Value) => void;
  /** Lays the cards out in a row from the `sm` breakpoint, instead of a column. */
  layout?: 'column' | 'row';
  disabled?: boolean;
  /** Why the current choice is not accepted, e.g. "Choose a reason". Shown under the cards and read with the group. */
  error?: string;
  className?: string;
}

/**
 * A choice of one from a few options, each a card with a label and a line of
 * detail. Built on native radio inputs, so arrow keys move between options
 * and the form reads it like any radio group.
 *
 * ```tsx
 * <RadioCardGroup legend="Order from" value={warehouse} onValueChange={setWarehouse}
 *   error={submitted && !warehouse ? 'Choose a warehouse' : undefined}
 *   options={[{ value: 'NMS', label: 'NMS · National Medical Stores', description: 'Entebbe' }]} />
 * ```
 */
export function RadioCardGroup<Value extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onValueChange,
  layout = 'column',
  disabled = false,
  error,
  className,
}: RadioCardGroupProps<Value>) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset
      className={cn('min-w-0', className)}
      disabled={disabled}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className={cn('mb-2 text-sm font-medium', hideLegend && 'sr-only')}>{legend}</legend>
      <div className={cn('grid gap-2', layout === 'row' && 'sm:grid-cols-2')}>
        {options.map((option) => {
          // The radio is named by its label alone; the detail line and aside describe it.
          const labelId = `${name}-${option.value}-label`;
          const descriptionId = option.description
            ? `${name}-${option.value}-description`
            : undefined;
          const asideId = option.aside ? `${name}-${option.value}-aside` : undefined;
          const describedBy = [descriptionId, asideId].filter(Boolean).join(' ') || undefined;
          return (
            <label
              key={option.value}
              className={cn(
                'bg-card flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                'has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-primary has-[:checked]:ring-1',
                'has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled}
                aria-labelledby={labelId}
                aria-describedby={describedBy}
                onChange={() => {
                  onValueChange(option.value);
                }}
                className="size-4 shrink-0 cursor-pointer outline-none disabled:cursor-not-allowed"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span id={labelId} className="text-sm font-medium break-words">
                  {option.label}
                </span>
                {option.description ? (
                  <span id={descriptionId} className="text-muted-foreground text-xs break-words">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {option.aside ? (
                <span id={asideId} className="shrink-0">
                  {option.aside}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
