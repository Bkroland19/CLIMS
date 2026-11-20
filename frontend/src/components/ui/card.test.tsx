import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardHeader, CardTitle } from './card';

describe('CardTitle', () => {
  it('is a level-two heading, a section under the page title', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Quantities</CardTitle>
        </CardHeader>
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Quantities' })).toBeInTheDocument();
  });

  it('takes the level of the heading it is given with asChild', () => {
    render(
      <CardTitle asChild className="text-sm">
        <h3>Batches</h3>
      </CardTitle>,
    );

    const heading = screen.getByRole('heading', { level: 3, name: 'Batches' });
    expect(heading).toHaveAttribute('data-slot', 'card-title');
    expect(heading).toHaveClass('text-sm');
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
