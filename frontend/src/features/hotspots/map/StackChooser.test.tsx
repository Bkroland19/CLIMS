import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MapHotspot } from './records';
import { StackChooser } from './StackChooser';

const record = (id: string, name: string | null, review: MapHotspot['review']): MapHotspot => ({
  id,
  name,
  type: 'Bar',
  venue: 'bar',
  village: 'Seja',
  region: null,
  district: { id: 'b0000000-0000-4000-8000-000000000001', name: 'Buvuma' },
  subcounty: null,
  position: 'placed',
  latitude: 0.3295,
  longitude: 32.6016,
  recordedLatitude: 0.3295,
  recordedLongitude: 32.6016,
  review,
  hasDispenser: true,
  dispenserCondition: 'Good',
  dispenser: 'working',
  contactName: null,
  contactPhone: null,
  createdAt: null,
  updatedAt: null,
});

const stack = [
  record('a0000000-0000-4000-8000-000000000003', 'Lake view bar', 'active'),
  record('a0000000-0000-4000-8000-000000000001', null, 'active'),
  record('a0000000-0000-4000-8000-000000000002', 'Aber guest house', 'submitted'),
];

function renderChooser(overrides: Partial<Parameters<typeof StackChooser>[0]> = {}) {
  const props = {
    hotspots: stack,
    samePlace: true,
    colourBy: 'review' as const,
    colourOf: () => '#45ba50',
    onSelect: vi.fn(),
    onHighlight: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<StackChooser {...props} />);
  return props;
}

describe('StackChooser', () => {
  it('lists every stacked hotspot by name, unnamed last, and takes focus', () => {
    renderChooser();
    const dialog = screen.getByRole('dialog', { name: '3 hotspots here' });
    expect(dialog).toHaveTextContent('All recorded at exactly the same position.');
    expect(screen.getByText('3 hotspots here')).toHaveFocus();
    const names = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label') !== 'Close')
      .map((button) => button.querySelector('.text-sm')?.textContent);
    expect(names).toEqual(['Aber guest house', 'Lake view bar', 'Unnamed hotspot']);
    // Only the exception carries a chip.
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('says when the pins only overlap', () => {
    renderChooser({ samePlace: false });
    expect(screen.getByRole('dialog')).toHaveTextContent('Their pins overlap at this zoom.');
  });

  it('reports a click as a pointer choice', async () => {
    const user = userEvent.setup();
    const props = renderChooser();
    await user.click(screen.getByRole('button', { name: /Lake view bar/ }));
    expect(props.onSelect).toHaveBeenLastCalledWith('a0000000-0000-4000-8000-000000000003', false);
  });

  it('reports Enter as a keyboard choice, so focus can follow it', async () => {
    const user = userEvent.setup();
    const props = renderChooser();
    await user.tab(); // from the title to the close button
    await user.tab(); // the first hotspot
    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenLastCalledWith('a0000000-0000-4000-8000-000000000002', true);
  });

  it('raises the pointed-at hotspot and lowers it on leaving', async () => {
    const user = userEvent.setup();
    const props = renderChooser();
    await user.hover(screen.getByRole('button', { name: /Lake view bar/ }));
    expect(props.onHighlight).toHaveBeenLastCalledWith('a0000000-0000-4000-8000-000000000003');
    await user.unhover(screen.getByRole('list'));
    expect(props.onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('closes on Escape without letting the key through', async () => {
    const user = userEvent.setup();
    const props = renderChooser();
    const outside = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', outside);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', outside);
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(outside).toHaveReturnedWith(true);
  });
});
