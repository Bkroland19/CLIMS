import { useId } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterSelectOption<Value extends string> {
  value: Value;
  label: string;
}

interface FilterSelectProps<Value extends string> {
  /** Visible label beside the control, e.g. "Role". */
  label: string;
  value: Value;
  options: readonly FilterSelectOption<Value>[];
  /** Apply the choice, usually by putting it in the page address. */
  onValueChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A compact labelled dropdown that narrows a list, for filters with too many
 * choices for `FilterTabs`. Keep the chosen value in the address (pass a
 * `router.replace` in `onValueChange`) so it survives a refresh.
 *
 * ```tsx
 * <FilterSelect label="Role" value={role}
 *   options={[{ value: 'all', label: 'All roles' }, { value: 'r1', label: 'VHT' }]}
 *   onValueChange={(next) => router.replace(`/moh/users?role=${next}`)} />
 * ```
 */
export function FilterSelect<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  className,
}: FilterSelectProps<Value>) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-sm font-normal">
        {label}
      </Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onValueChange(option.value);
        }}
      >
        <SelectTrigger id={id} size="sm" className="bg-card min-w-0 sm:min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
