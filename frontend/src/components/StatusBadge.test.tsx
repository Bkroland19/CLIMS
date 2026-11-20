import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('shows the status word as written, trimmed', () => {
    render(<StatusBadge status="  In queue " />);
    expect(screen.getByText('In queue')).toBeInTheDocument();
  });

  it('gives the dot no accessible text, so only the word is read out', () => {
    const { container } = render(<StatusBadge status="On hold" />);
    const chip = container.firstElementChild;
    expect(chip).toHaveTextContent(/^On hold$/);
    expect(chip?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it.each([
    { status: 'Delivered', tone: 'positive' },
    { status: 'In queue', tone: 'info' },
    { status: 'On hold', tone: 'caution' },
    { status: 'Stocked out', tone: 'negative' },
    { status: 'Received', tone: 'neutral' },
  ])('looks up the $tone tone for "$status"', ({ status, tone }) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', tone);
  });

  it('uses the tone it is given over the one the word would get', () => {
    const { container } = render(<StatusBadge status="Received" tone="positive" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'positive');
  });

  it.each([null, undefined, '', '   '])('shows a dash for the missing status %j', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('passes className and native attributes through', () => {
    render(<StatusBadge status="Active" className="ml-2" title="Account status" />);
    const chip = screen.getByTitle('Account status');
    expect(chip).toHaveClass('ml-2');
    expect(chip).toHaveTextContent('Active');
  });
});
