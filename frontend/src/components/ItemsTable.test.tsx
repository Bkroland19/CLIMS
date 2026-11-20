import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ItemsTable, type ItemsTableColumn } from './ItemsTable';

interface Line {
  id: string;
  name: string;
  pieces: number;
}

const columns: ItemsTableColumn<Line>[] = [
  { id: 'name', header: 'Product', cell: (line) => line.name },
  { id: 'pieces', header: 'Pieces', numeric: true, cell: (line) => String(line.pieces) },
  { id: 'actions', header: 'Actions', srOnlyHeader: true, cell: () => <button>Edit</button> },
];

const lines: Line[] = [
  { id: 'm', name: 'Male condoms', pieces: 800 },
  { id: 'f', name: 'Female condoms', pieces: 0 },
];

describe('ItemsTable', () => {
  it('renders a named table with a row per line', () => {
    render(<ItemsTable label="Quantities" columns={columns} rows={lines} getRowId={(l) => l.id} />);

    const table = screen.getByRole('table', { name: 'Quantities' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] ?? table).getByText('Male condoms')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('right-aligns numeric columns and hides a header visually when asked', () => {
    render(<ItemsTable label="Quantities" columns={columns} rows={lines} getRowId={(l) => l.id} />);

    expect(screen.getByText('800').closest('td')).toHaveClass('text-right');
    expect(screen.getByText('Actions')).toHaveClass('sr-only');
  });

  it('shows the empty text in one row when there are no lines', () => {
    render(
      <ItemsTable
        label="Batches"
        columns={columns}
        rows={[]}
        getRowId={(l) => l.id}
        emptyText="No stock in the district store."
      />,
    );

    const cell = screen.getByRole('cell', { name: 'No stock in the district store.' });
    expect(cell).toHaveAttribute('colspan', '3');
  });

  it('tints the rows it is told to', () => {
    render(
      <ItemsTable
        label="Batches"
        columns={columns}
        rows={lines}
        getRowId={(l) => l.id}
        rowTone={(line) => (line.pieces === 0 ? 'negative' : 'default')}
      />,
    );

    expect(screen.getByText('Female condoms').closest('tr')).toHaveClass('bg-destructive/5');
    expect(screen.getByText('Male condoms').closest('tr')).not.toHaveClass('bg-destructive/5');
  });
});
