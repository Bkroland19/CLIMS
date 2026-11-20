import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RadioCardGroup, type RadioCardOption } from './RadioCardGroup';

type Warehouse = 'NMS' | 'JMS' | 'MAUL';

const options: RadioCardOption<Warehouse>[] = [
  { value: 'NMS', label: 'NMS', description: 'Entebbe · usual lead time 1–2 days' },
  { value: 'JMS', label: 'JMS', description: 'Kampala · usual lead time 1–3 days' },
  { value: 'MAUL', label: 'MAUL', disabled: true, aside: <span>Closed</span> },
];

function Harness({ onChange }: { onChange?: (value: Warehouse) => void }) {
  const [value, setValue] = useState<Warehouse | null>('NMS');
  return (
    <RadioCardGroup
      legend="Order from"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={options}
    />
  );
}

describe('RadioCardGroup', () => {
  it('is a named group of radios, each described by its detail line', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Order from' })).toBeInTheDocument();
    const nms = screen.getByRole('radio', { name: 'NMS' });
    expect(nms).toBeChecked();
    expect(nms).toHaveAccessibleDescription('Entebbe · usual lead time 1–2 days');
    const maul = screen.getByRole('radio', { name: 'MAUL' });
    expect(maul).toBeDisabled();
    // The aside (e.g. a rider's status) is read as part of the description.
    expect(maul).toHaveAccessibleDescription('Closed');
  });

  it('chooses an option by clicking its card', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByText('Kampala · usual lead time 1–3 days'));

    expect(onChange).toHaveBeenCalledWith('JMS');
    expect(screen.getByRole('radio', { name: 'JMS' })).toBeChecked();
  });

  it('moves the choice with the arrow keys, skipping disabled options', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'NMS' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'JMS' })).toBeChecked();
    await user.keyboard('{ArrowDown}');
    // MAUL is disabled, so the choice wraps round to NMS.
    expect(screen.getByRole('radio', { name: 'NMS' })).toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'JMS' })).toBeChecked();
  });

  it('can turn the whole group off', () => {
    render(
      <RadioCardGroup
        legend="Rider"
        hideLegend
        value={null}
        onValueChange={vi.fn()}
        options={options}
        disabled
      />,
    );

    expect(screen.getByText('Rider')).toHaveClass('sr-only');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('shows an error under the cards and ties it to the group', () => {
    render(
      <RadioCardGroup
        legend="Reason"
        value={null}
        onValueChange={vi.fn()}
        options={options}
        error="Choose a reason for the hold."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a reason for the hold.');
    expect(screen.getByRole('group', { name: 'Reason' })).toHaveAccessibleDescription(
      'Choose a reason for the hold.',
    );
  });

  it('has no error text or group description without an error', () => {
    render(<Harness />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Order from' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});
