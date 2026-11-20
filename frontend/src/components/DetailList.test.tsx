import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DetailList } from './DetailList';

const items = [
  { label: 'Waybill', value: 'WB-NMS-26-1187' },
  { label: 'Driver', value: <strong>Robert Ssali</strong> },
];

describe('DetailList', () => {
  it('pairs each label with its value in a description list', () => {
    const { container } = render(<DetailList items={items} />);

    const terms = within(container).getAllByRole('term');
    const definitions = within(container).getAllByRole('definition');
    expect(terms.map((term) => term.textContent)).toEqual(['Waybill', 'Driver']);
    expect(definitions[1]).toContainElement(screen.getByText('Robert Ssali'));
  });

  it('lays the facts out in columns in the grid variant', () => {
    const { container } = render(
      <DetailList variant="grid" items={items} aria-label="Consignment" />,
    );

    const list = container.querySelector('dl');
    expect(list).toHaveClass('grid');
    expect(list).toHaveAttribute('aria-label', 'Consignment');
    expect(screen.getByText('WB-NMS-26-1187')).toBeInTheDocument();
  });
});
