import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DetailHeader } from './DetailHeader';
import { StatusBadge } from './StatusBadge';

describe('DetailHeader', () => {
  it('is a region named by its heading', () => {
    render(<DetailHeader title="ORD-104" />);
    expect(screen.getByRole('heading', { level: 2, name: 'ORD-104' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ORD-104' })).toBeInTheDocument();
  });

  it('shows the status, context line, actions and progress band', () => {
    render(
      <DetailHeader
        title="WR-031"
        status={<StatusBadge status="In transit" />}
        description="Wakiso district store · received Today, 09:12"
        actions={<button type="button">Print waybill</button>}
      >
        <p>Progress goes here</p>
      </DetailHeader>,
    );
    expect(screen.getByText('In transit')).toBeInTheDocument();
    expect(screen.getByText('Wakiso district store · received Today, 09:12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print waybill' })).toBeInTheDocument();
    expect(screen.getByText('Progress goes here')).toBeInTheDocument();
  });

  it('leaves out the band when there is nothing for it', () => {
    const { container } = render(<DetailHeader title="ORD-104" />);
    expect(container.querySelector('section')?.children).toHaveLength(1);
  });
});
