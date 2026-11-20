import { describe, expect, it } from 'vitest';

import { statusTone } from './status';

describe('statusTone', () => {
  it.each([
    { status: 'active', tone: 'positive' },
    { status: ' Active ', tone: 'positive' },
    { status: 'VERIFIED', tone: 'positive' },
    { status: 'Confirmed', tone: 'positive' },
    { status: 'Sent to MOH', tone: 'positive' },
    { status: 'In queue', tone: 'info' },
    { status: 'Under review', tone: 'info' },
    { status: 'Out for delivery', tone: 'info' },
    { status: 'pending', tone: 'caution' },
    { status: 'Pending verification', tone: 'caution' },
    { status: 'On hold', tone: 'caution' },
    { status: 'Near expiry', tone: 'caution' },
    { status: 'Suspended', tone: 'negative' },
    { status: 'Stocked out', tone: 'negative' },
    { status: 'Errors to fix', tone: 'negative' },
  ])('shows "$status" as $tone', ({ status, tone }) => {
    expect(statusTone(status)).toBe(tone);
  });

  // The prototype shows a switched-off account or hotspot in grey, not red.
  it('shows "inactive" as neutral', () => {
    expect(statusTone('inactive')).toBe('neutral');
  });

  // Its tone depends on what was received, so the caller has to say.
  it('does not guess at "Received"', () => {
    expect(statusTone('Received')).toBe('neutral');
  });

  it.each([null, undefined, '', 'archived', 'inactive-ish', '1'])(
    'shows the unrecognised status %j as neutral',
    (status) => {
      expect(statusTone(status)).toBe('neutral');
    },
  );
});
