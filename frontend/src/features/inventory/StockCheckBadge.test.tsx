import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StockCheckBadge } from './StockCheckBadge';

describe('StockCheckBadge', () => {
  it('shows available stock as positive', () => {
    const { container } = render(<StockCheckBadge check={{ status: 'available' }} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'positive');
  });

  it('shows the shortfall with thousands separators', () => {
    const { container } = render(<StockCheckBadge check={{ status: 'short', shortBy: 1200 }} />);
    expect(screen.getByText('Short by 1,200')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'caution');
  });

  it.each([null, { status: 'not-needed' } as const])('shows a dash for %j', (check) => {
    render(<StockCheckBadge check={check} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
