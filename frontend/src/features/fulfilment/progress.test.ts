import { describe, expect, it } from 'vitest';

import { anOrder, aRequest, DISPATCH_DETAILS } from '@/test/fulfilmentFixtures';

import { orderSteps, requestSteps } from './progress';

const states = (steps: { state: string }[]) => steps.map((step) => step.state);

describe('orderSteps', () => {
  it('starts at review for a new order', () => {
    expect(states(orderSteps(anOrder(), null))).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('moves to the decision once stock is checked, and says what the check found', () => {
    const steps = orderSteps(anOrder(), 'short');
    expect(states(steps).slice(1, 4)).toEqual(['done', 'done', 'current']);
    expect(steps[2]?.detail).toBe('Not available');
  });

  it('flags a held order as needing attention', () => {
    const steps = orderSteps(anOrder({ status: 'on_hold' }), null);
    expect(steps[3]).toMatchObject({ label: 'On hold', state: 'attention' });
  });

  it('marks dispatch current for a confirmed order and done once it is out', () => {
    expect(orderSteps(anOrder({ status: 'confirmed' }), null)[4]?.state).toBe('current');
    const out = orderSteps(
      anOrder({
        status: 'in_transit',
        delivery: {
          note_number: 'DN-2026-0088',
          rider: { id: 'R1', name: 'Musa Kato', phone: '+256 701 334 920', plate: 'UFB 412K' },
          assigned_at: '2026-11-19T08:00:00Z',
          collected_at: null,
          delivered_at: null,
        },
      }),
      null,
    );
    expect(out[4]).toMatchObject({ state: 'done', detail: 'DN-2026-0088' });
    expect(out[5]?.state).toBe('current');
  });

  it('is all done once the hotspot has received it', () => {
    expect(states(orderSteps(anOrder({ status: 'received' }), null))).toEqual(
      Array(6).fill('done'),
    );
  });
});

describe('requestSteps', () => {
  it('waits on the warehouse after sending', () => {
    const steps = requestSteps(aRequest());
    expect(states(steps)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(steps[1]).toMatchObject({ label: 'NMS review', detail: 'Not opened yet' });
  });

  it('needs attention when the warehouse holds it', () => {
    expect(requestSteps(aRequest({ status: 'on_hold' }))[1]?.state).toBe('attention');
  });

  it('asks the district to receive it once dispatched', () => {
    const steps = requestSteps(aRequest({ status: 'dispatched', dispatch: DISPATCH_DETAILS }));
    expect(states(steps)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
  });
});
