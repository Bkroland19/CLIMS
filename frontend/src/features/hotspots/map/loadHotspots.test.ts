import { describe, expect, it, vi } from 'vitest';

import { ApiError, type HttpClient } from '@/lib/api';

import { PAGE_SIZE, loadHotspots, type Partition } from './loadHotspots';

/** A fake API holding `counts[district]` hotspots per district (`all` for no filter). */
function fakeApi(counts: Record<string, number>, fail: (url: URL) => Error | null = () => null) {
  const get = vi.fn((path: string) => {
    const url = new URL(path, 'http://api.test');
    const error = fail(url);
    if (error) return Promise.reject(error);
    const district = url.searchParams.get('district_id') ?? 'all';
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    const total = counts[district] ?? 0;
    const data = Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, index) => ({
        id: `${district}-${String(offset + index)}`,
        latitude: 0.3,
        longitude: 32.5,
        review_status: 'active',
      }),
    );
    return Promise.resolve({ data });
  });
  return { http: { get } as unknown as HttpClient, get };
}

const district = (id: string): Partition => ({ districtId: id, label: `District ${id}` });
const noWait = () => Promise.resolve();

describe('loadHotspots', () => {
  it('pages through one list several pages at a time and stops at the last', async () => {
    const { http, get } = fakeApi({ all: 2 * PAGE_SIZE + 30 });
    const result = await loadHotspots(http, [{ districtId: null, label: 'Mine' }], {
      concurrency: 4,
    });

    expect(result.hotspots).toHaveLength(2 * PAGE_SIZE + 30);
    expect(result.failed).toEqual([]);
    const offsets = get.mock.calls.map(([path]) =>
      new URL(path, 'http://x').searchParams.get('offset'),
    );
    // Four lanes start at once; the ones past the end come back empty and stop.
    expect(offsets.sort()).toEqual(['0', '100', '200', '300']);
    expect(get.mock.calls.every(([path]) => !path.includes('district_id'))).toBe(true);
  });

  it('reads each district on its own and reports progress', async () => {
    const { http, get } = fakeApi({ a: 150, b: 0, c: 99 });
    const progress = vi.fn();
    const result = await loadHotspots(http, [district('a'), district('b'), district('c')], {
      onProgress: progress,
    });

    expect(result.hotspots).toHaveLength(249);
    expect(result.partitionsTotal).toBe(3);
    // District a needs a second page; b and c fit in one.
    expect(get).toHaveBeenCalledTimes(4);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ partitionsDone: 3, partitionsTotal: 3 }),
    );
  });

  it('retries a dropped connection, then carries on', async () => {
    let failures = 0;
    const { http } = fakeApi({ a: 10 }, () =>
      failures++ < 2 ? new ApiError({ kind: 'network', message: 'offline' }) : null,
    );
    const result = await loadHotspots(http, [district('a')], { wait: noWait });
    expect(result.hotspots).toHaveLength(10);
  });

  it('names the districts that still failed and keeps the rest', async () => {
    const { http } = fakeApi({ a: 5, b: 5 }, (url) =>
      url.searchParams.get('district_id') === 'b'
        ? new ApiError({ kind: 'server', message: 'boom', status: 500 })
        : null,
    );
    const result = await loadHotspots(http, [district('a'), district('b')], { wait: noWait });
    expect(result.hotspots).toHaveLength(5);
    expect(result.failed).toEqual([district('b')]);
  });

  it('does not retry a refusal, and fails outright when nothing loads', async () => {
    const refused = new ApiError({ kind: 'forbidden', message: 'no', status: 403 });
    const { http, get } = fakeApi({ a: 5 }, () => refused);
    await expect(
      loadHotspots(http, [district('a')], { wait: noWait, concurrency: 1 }),
    ).rejects.toBe(refused);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('stops when the request is cancelled', async () => {
    const controller = new AbortController();
    const cancelled = new ApiError({ kind: 'cancelled', message: 'cancelled' });
    const { http } = fakeApi({ a: 500 }, () => {
      controller.abort();
      return cancelled;
    });
    await expect(
      loadHotspots(http, [district('a'), district('b')], { signal: controller.signal }),
    ).rejects.toBe(cancelled);
  });
});
