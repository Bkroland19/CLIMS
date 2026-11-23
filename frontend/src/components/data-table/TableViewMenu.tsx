import { Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { PAGE_SIZES, type TableDensity, type TablePreferences } from './useTablePreferences';

interface TableViewMenuProps {
  /** Names the table, e.g. "Users", for the button's accessible name. */
  label: string;
  /** The columns a viewer may hide, in table order. */
  columns: readonly { id: string; header: string }[];
  preferences: TablePreferences;
  hasFixedColumns?: boolean;
  onChange: (change: Partial<TablePreferences>) => void;
}

const DENSITIES: readonly { value: TableDensity; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

/** The table's "View" menu: which columns show, how tall rows are, and how many per page. */
export function TableViewMenu({
  label,
  columns,
  preferences,
  onChange,
  hasFixedColumns = false,
}: TableViewMenuProps) {
  const hidden = new Set(preferences.hidden);
  const shown = columns.filter((column) => !hidden.has(column.id)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The name starts with the visible word, so speech users can say what they see. */}
        <Button
          variant="outline"
          className="bg-card"
          aria-label={`View options for ${label.toLowerCase()}`}
        >
          <Settings2 data-icon="inline-start" aria-hidden="true" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {columns.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
              Columns
            </DropdownMenuLabel>
            {columns.map((column) => {
              const visible = !hidden.has(column.id);
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={visible}
                  // Keep at least one optional column so the choice can be undone from here.
                  disabled={visible && shown === 1 && !hasFixedColumns}
                  onSelect={(event) => {
                    // Stay open, so several columns can be toggled in one go.
                    event.preventDefault();
                  }}
                  onCheckedChange={(checked) => {
                    onChange({
                      hidden: checked
                        ? preferences.hidden.filter((id) => id !== column.id)
                        : [...preferences.hidden, column.id],
                    });
                  }}
                >
                  {column.header}
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          Row height
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.density}
          onValueChange={(value) => {
            onChange({ density: value as TableDensity });
          }}
        >
          {DENSITIES.map((density) => (
            <DropdownMenuRadioItem key={density.value} value={density.value}>
              {density.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          Rows per page
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(preferences.pageSize)}
          onValueChange={(value) => {
            onChange({ pageSize: Number(value) });
          }}
        >
          {PAGE_SIZES.map((size) => (
            <DropdownMenuRadioItem key={size} value={String(size)}>
              {size}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
