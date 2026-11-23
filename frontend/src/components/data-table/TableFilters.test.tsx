import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';

import { DataTable, type DataTableColumn } from './DataTable';

const records = [
  { id: 'a', name: 'Kampala', status: 'Active', stock: 5, date: '2026-11-22T21:30:00Z' },
  { id: 'b', name: 'Kabale', status: 'Active', stock: 10, date: '2026-11-21T12:00:00Z' },
  { id: 'c', name: 'Gulu', status: 'Inactive', stock: 0, date: null },
];
type Row = (typeof records)[number];
const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', value: (row) => row.name },
  { id: 'status', header: 'Status', value: (row) => row.status, filter: 'select' },
  {
    id: 'stock',
    header: 'Stock',
    value: (row) => row.stock,
    numeric: true,
    total: (rows) => rows.reduce((sum, row) => sum + row.stock, 0),
  },
  { id: 'date', header: 'Reported', value: (row) => row.date, filter: 'date' },
];
function Table() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  return (
    <DataTable
      label="Districts"
      rows={records}
      columns={columns}
      getRowId={(row) => row.id}
      selection={{ selected, onChange: setSelected, rowLabel: (row) => row.name }}
    />
  );
}
async function editor(user: ReturnType<typeof userEvent.setup>, column: string) {
  await user.click(screen.getByRole('button', { name: /^Filters.*for districts$/ }));
  await user.click(screen.getByRole('combobox', { name: 'Column' }));
  await user.click(screen.getByRole('option', { name: column }));
}

describe('shared table column filtering', () => {
  it('combines categories, quantity and search, updates totals, and removes every constraint', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await editor(user, 'Status');
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.queryByText('Gulu')).not.toBeInTheDocument();
    await editor(user, 'Stock');
    await user.type(screen.getByRole('textbox', { name: /Maximum/ }), '5');
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.queryByText('Kabale')).not.toBeInTheDocument();
    expect(screen.getByText('Kampala')).toBeInTheDocument();
    expect(screen.getByText('Total of 1 matching')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'not found');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(screen.getByText('Gulu')).toBeInTheDocument();
    expect(screen.getByText('Kabale')).toBeInTheDocument();
  });
  it('rejects a reversed range without applying it, then filters by the Uganda date', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await editor(user, 'Reported');
    await user.type(screen.getByLabelText(/From date/), '2026-11-24');
    await user.type(screen.getByLabelText(/To date/), '2026-11-23');
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The end date must be on or after the start date.',
    );
    expect(screen.getByText('Kabale')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/From date/));
    await user.type(screen.getByLabelText(/From date/), '2026-11-23');
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.getByText('Kampala')).toBeInTheDocument();
    expect(screen.queryByText('Kabale')).not.toBeInTheDocument();
    expect(screen.queryByText('Gulu')).not.toBeInTheDocument();
  });
  it('keeps a hidden-column filter visible and removable and limits selection to the results', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await editor(user, 'Status');
    await user.click(screen.getByRole('checkbox', { name: 'Inactive' }));
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    await user.click(screen.getByRole('button', { name: 'View options for districts' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Status' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader', { name: /Status/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Status: .*Remove filter$/ })).toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', { name: 'Select every districts row on this page' }),
    );
    expect(screen.getByRole('checkbox', { name: 'Select Gulu' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /^Status: .*Remove filter$/ }));
    expect(screen.getByRole('checkbox', { name: 'Select Kampala' })).not.toBeChecked();
  });
  it('edits an existing filter and distinguishes empty dates from zero stock', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await editor(user, 'Reported');
    await user.click(screen.getByRole('combobox', { name: 'Condition' }));
    await user.click(screen.getByRole('option', { name: 'Is empty' }));
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.getByText('Gulu')).toBeInTheDocument();
    expect(screen.queryByText('Kampala')).not.toBeInTheDocument();
    await editor(user, 'Reported');
    await user.click(screen.getByRole('combobox', { name: 'Condition' }));
    await user.click(screen.getByRole('option', { name: 'Is not empty' }));
    await user.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.queryByText('Gulu')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Kabale')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Reported: .*Remove filter$/ })).toHaveLength(1);
  });
});
