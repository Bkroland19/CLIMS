import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StepTracker, type Step } from './StepTracker';

const STEPS: Step[] = [
  { id: 'received', label: 'Received', detail: 'Today, 09:12', state: 'done' },
  { id: 'review', label: 'Review', state: 'current' },
  { id: 'stock', label: 'Stock check', state: 'attention' },
  { id: 'warehouse', label: 'Warehouse request', state: 'skipped' },
  { id: 'dispatch', label: 'Dispatch', state: 'upcoming' },
];

describe('StepTracker', () => {
  it('is a named list with one item per step, in order', () => {
    render(<StepTracker aria-label="Order progress" steps={STEPS} />);
    const list = screen.getByRole('list', { name: 'Order progress' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
      'done',
      'current',
      'attention',
      'skipped',
      'upcoming',
    ]);
  });

  it('says each state in words, numbering steps not yet reached', () => {
    render(<StepTracker aria-label="Order progress" steps={STEPS} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Done: Received');
    expect(items[1]).toHaveTextContent('In progress: Review');
    expect(items[2]).toHaveTextContent('Needs attention: Stock check');
    expect(items[3]).toHaveTextContent('Not needed: Warehouse request');
    expect(items[4]).toHaveTextContent('Step 5: Dispatch');
  });

  it('marks only the current step as current', () => {
    render(<StepTracker aria-label="Order progress" steps={STEPS} />);
    const items = screen.getAllByRole('listitem');
    expect(items.filter((item) => item.getAttribute('aria-current') === 'step')).toEqual([
      items[1],
    ]);
  });

  it('shows the detail line when there is one', () => {
    render(<StepTracker aria-label="Order progress" steps={STEPS} />);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Today, 09:12');
  });

  it('takes its own state words', () => {
    render(
      <StepTracker
        aria-label="Report progress"
        steps={[{ id: 'a', label: 'Figures', state: 'upcoming' }]}
        kicker={(state, position) => `${state} #${position}`}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('upcoming #1: Figures');
  });
});
