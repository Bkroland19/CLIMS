'use client';

import { X } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Shared by the Audit log and Sync log tabs, whose filters live in the address.

/** A day picker for a server-side date filter, labelled beside it. */
export function DateFilter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string | null;
  min?: string | null;
  max?: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground shrink-0 text-sm font-normal">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="bg-card h-8 w-36"
        value={value ?? ''}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
      />
    </div>
  );
}

/** An active filter that is not in the toolbar, with a button to clear it. */
export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-sm">
      {label}
      <Button variant="ghost" size="icon-xs" aria-label={`Clear: ${label}`} onClick={onClear}>
        <X />
      </Button>
    </span>
  );
}
