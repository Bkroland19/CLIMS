import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('shows the label and the figure', () => {
    render(<StatCard label="Orders in queue" value="4" icon={Inbox} />);
    expect(screen.getByText('Orders in queue')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('announces loading instead of the figure', () => {
    render(<StatCard label="Orders in queue" value="4" icon={Inbox} isLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading orders in queue…');
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('marks a sample figure', () => {
    render(<StatCard label="Orders in queue" value="4" icon={Inbox} isSample />);
    expect(screen.getByText(/sample/i)).toBeInTheDocument();
  });

  it('reads the change in words, since the arrow is hidden', () => {
    const { container } = render(
      <StatCard
        label="Out for delivery"
        value="1,240"
        icon={Inbox}
        trend={{ series: [900, 1000, 1240], goodDirection: 'up', caption: 'vs last week' }}
      />,
    );
    const change = container.querySelector('[data-meaning]');
    expect(change).toHaveTextContent('Up 240');
    expect(change).toHaveAttribute('data-meaning', 'good');
    expect(screen.getByText('vs last week')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
  });

  it('shows a rise as bad when down is good', () => {
    const { container } = render(
      <StatCard
        label="On hold"
        value="3"
        icon={Inbox}
        trend={{ series: [1, 3], goodDirection: 'down', caption: 'vs last week' }}
      />,
    );
    expect(container.querySelector('[data-meaning]')).toHaveAttribute('data-meaning', 'bad');
  });

  it('shows no change as neutral', () => {
    const { container } = render(
      <StatCard
        label="On hold"
        value="3"
        icon={Inbox}
        trend={{ series: [3, 3], goodDirection: 'down', caption: 'vs last week' }}
      />,
    );
    const change = container.querySelector('[data-meaning]');
    expect(change).toHaveTextContent('No change 0');
    expect(change).toHaveAttribute('data-meaning', 'neutral');
  });

  it('leaves the change out when the series is too short', () => {
    const { container } = render(
      <StatCard
        label="On hold"
        value="3"
        icon={Inbox}
        trend={{ series: [3], caption: 'vs last week' }}
      />,
    );
    expect(container.querySelector('[data-meaning]')).toBeNull();
    expect(screen.queryByText('vs last week')).not.toBeInTheDocument();
  });

  it('is a link when given an href', () => {
    render(<StatCard label="Orders in queue" value="4" icon={Inbox} href="/dcfp/orders" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dcfp/orders');
    expect(link).toHaveTextContent('Orders in queue');
  });

  it('is not a link by default', () => {
    render(<StatCard label="Orders in queue" value="4" icon={Inbox} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
