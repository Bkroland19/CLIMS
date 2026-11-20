import { describe, expect, it } from 'vitest';

import { anEvent } from '@/test/fulfilmentFixtures';

import { historyOf, timelineEntries } from './activity';

const now = new Date('2026-11-20T09:00:00Z');

const events = [
  anEvent({ id: 'EV-3', at: '2026-11-19T10:00:00Z', reference: 'ORD-0141', text: 'Confirmed' }),
  anEvent({ id: 'EV-2', at: '2026-11-19T09:00:00Z', reference: 'WR-2026-0032', text: 'Requested' }),
  anEvent({ id: 'EV-1', at: '2026-11-19T07:35:00Z', reference: 'ORD-0141', text: 'Notified' }),
  anEvent({ id: 'EV-0', at: '2026-11-18T07:00:00Z', reference: null, text: 'Signed in' }),
];

describe('historyOf', () => {
  it("keeps one record's events, oldest first", () => {
    expect(historyOf(events, ['ORD-0141']).map((event) => event.id)).toEqual(['EV-1', 'EV-3']);
  });

  it('can follow several records at once', () => {
    expect(historyOf(events, ['ORD-0141', 'WR-2026-0032'])).toHaveLength(3);
  });

  it('never matches events about no record', () => {
    expect(historyOf(events, [])).toEqual([]);
  });
});

describe('timelineEntries', () => {
  it("names the actor and role in a record's history", () => {
    const [entry] = timelineEntries([events[2] ?? anEvent()], { now });
    expect(entry).toMatchObject({ id: 'EV-1', text: 'Notified', role: 'hotspot-manager' });
    expect(entry?.meta).toMatch(/^Grace Nakato · Hotspot manager · /);
  });

  it('leads with the record in a feed across records', () => {
    const [entry] = timelineEntries([events[1] ?? anEvent()], { feed: true, now });
    expect(entry?.meta).toMatch(/^WR-2026-0032 · Grace Nakato · /);
  });

  it('leaves out a missing reference rather than printing a gap', () => {
    const [entry] = timelineEntries([events[3] ?? anEvent()], { feed: true, now });
    expect(entry?.meta).toMatch(/^Grace Nakato · /);
  });
});
