import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '@/lib/api';

import { eventSentence, getHotspotDetail, listHotspotEvents } from './detail';

const http = (body: unknown) =>
  ({ get: vi.fn().mockResolvedValue(body) }) as unknown as HttpClient & {
    get: ReturnType<typeof vi.fn>;
  };

describe('hotspot detail', () => {
  it('reads the hotspot and its comments from one reply', async () => {
    const client = http({
      id: 'h1',
      name: 'Lake view bar',
      review_status: 'rejected',
      comments: [
        { id: 'c1', user_id: 'u1', action: 'rejected', comment: 'Duplicate', created_at: 'x' },
      ],
    });
    const detail = await getHotspotDetail(client, 'h/1');
    expect(client.get).toHaveBeenCalledWith('/hotspots/h%2F1', { signal: undefined });
    expect(detail.hotspot.review).toBe('rejected');
    expect(detail.comments).toEqual([
      { id: 'c1', action: 'rejected', comment: 'Duplicate', created_at: 'x' },
    ]);
  });

  it('treats a missing thread as no comments', async () => {
    expect((await getHotspotDetail(http({ id: 'h1', comments: null }), 'h1')).comments).toEqual([]);
  });

  it('lists the history', async () => {
    const client = http([{ id: 'e1', action: 'activated', status: 'active', created_at: 'x' }]);
    expect(await listHotspotEvents(client, 'h1')).toEqual([
      { id: 'e1', action: 'activated', status: 'active', created_at: 'x' },
    ]);
    expect(client.get).toHaveBeenCalledWith('/hotspots/h1/events', { signal: undefined });
  });

  it.each([
    ['submitted', 'Submitted for review'],
    ['resubmitted', 'Edited and sent back for review'],
    ['moved_district', 'Moved district'],
    ['', 'Updated'],
  ])('describes %s', (action, expected) => {
    expect(eventSentence(action)).toBe(expected);
  });
});
