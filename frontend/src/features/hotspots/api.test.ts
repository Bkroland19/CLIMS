import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '@/lib/api';

import { actOnHotspot, listHotspots, mappableHotspots, type Hotspot } from './api';

function fakeHttp(body: unknown = {}) {
  return {
    get: vi.fn().mockResolvedValue(body),
    post: vi.fn().mockResolvedValue(body),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient & { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

const wire = {
  id: '6f1e2c50-9d8a-4f3b-8c1e-2b7a9d0c4e11',
  name: 'Lake view bar',
  type: 'Guest house',
  village: 'Seja',
  contact_person_name: null,
  contact_person_telephone: '',
  has_condom_dispenser: true,
  dispenser_condition: 'Poor',
  latitude: 0.31,
  longitude: 32.63,
  comment: null,
  status: 'submitted',
  rejection_reason: null,
  district_id: '7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11',
  submitted_by_id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  created_at: '2026-11-19T10:00:00Z',
};

describe('listHotspots', () => {
  it('reads the Go API envelope and normalises blanks to null', async () => {
    const http = fakeHttp({ success: true, data: [wire] });

    const [hotspot] = await listHotspots(http);

    expect(http.get).toHaveBeenCalledWith('/hotspots?limit=100', { signal: undefined });
    expect(hotspot).toMatchObject({
      name: 'Lake view bar',
      contact_person_telephone: null,
      has_condom_dispenser: true,
    });
  });

  it('sends the district UUID so the API filters before limiting results', async () => {
    const http = fakeHttp({ success: true, data: [] });
    const signal = new AbortController().signal;

    await listHotspots(http, signal, wire.district_id);

    expect(http.get).toHaveBeenCalledWith(`/hotspots?limit=100&district_id=${wire.district_id}`, {
      signal,
    });
  });
});

describe('actOnHotspot', () => {
  it('sends a reason only when rejecting', async () => {
    const http = fakeHttp();

    await actOnHotspot(http, wire.id, 'verify');
    await actOnHotspot(http, wire.id, 'reject', 'Duplicate');

    expect(http.post).toHaveBeenNthCalledWith(1, `/hotspots/${wire.id}/actions/verify`, undefined);
    expect(http.post).toHaveBeenNthCalledWith(2, `/hotspots/${wire.id}/actions/reject`, {
      reason: 'Duplicate',
    });
  });
});

describe('mappableHotspots', () => {
  const at = (latitude: number | null, longitude: number | null) =>
    ({ ...wire, latitude, longitude }) as unknown as Hotspot;

  it('keeps hotspots with usable coordinates only', () => {
    const hotspots = [at(0.31, 32.63), at(null, 32), at(0, 0), at(91, 32), at(0.3, 181)];

    expect(mappableHotspots(hotspots)).toHaveLength(1);
  });
});
