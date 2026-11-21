import { describe, expect, it } from 'vitest';

import { createTestHttp } from '@/test/testHttp';

import {
  listDistrictHotspots,
  listDistrictsIn,
  listRegions,
  listSubcounties,
  villageNames,
} from './api';

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });

describe('place lookups', () => {
  it('reads regions, then a region’s districts, then a district’s subcounties', async () => {
    const { http, requests } = createTestHttp(
      ok([{ id: 'r1', name: 'Acholi' }]),
      ok([{ id: 'd1', name: 'Gulu District' }]),
      ok([{ id: 's1', name: 'Bungatira Subcounty' }]),
    );

    await expect(listRegions(http)).resolves.toEqual([{ id: 'r1', name: 'Acholi' }]);
    await expect(listDistrictsIn(http, 'r1')).resolves.toEqual([
      { id: 'd1', name: 'Gulu District' },
    ]);
    await expect(listSubcounties(http, 'd1')).resolves.toEqual([
      { id: 's1', name: 'Bungatira Subcounty' },
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      '/locations/regions',
      '/locations/districts?region_id=r1',
      '/locations/subcounties?district_id=d1',
    ]);
  });

  it('refuses a place without a name', async () => {
    const { http } = createTestHttp(ok([{ id: 'r1', name: ' ' }]));
    await expect(listRegions(http)).rejects.toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('listDistrictHotspots', () => {
  it('names each hotspot, where it is and its review step, sorted by name', async () => {
    const { http, requests } = createTestHttp(
      ok([
        {
          id: 'h2',
          name: ' Kasenyi Landing Site ',
          village: 'Kasenyi',
          subcounty: { id: 's1', name: 'Katabi' },
          status: 'inactive',
          review_status: 'submitted',
        },
        // A converted legacy row: no name, no subcounty, the review step in `status`.
        { id: 'h1', name: null, village: null, subcounty: null, status: 'active' },
        { id: 'h3', name: 'Abaita Bar', village: 'Abaita', subcounty_id: 's1' },
      ]),
    );

    await expect(listDistrictHotspots(http, 'd1')).resolves.toEqual([
      {
        id: 'h1',
        name: '',
        village: '',
        subcountyId: null,
        subcountyName: '',
        reviewStatus: 'active',
      },
      {
        id: 'h3',
        name: 'Abaita Bar',
        village: 'Abaita',
        subcountyId: 's1',
        subcountyName: '',
        reviewStatus: '',
      },
      {
        id: 'h2',
        name: 'Kasenyi Landing Site',
        village: 'Kasenyi',
        subcountyId: 's1',
        subcountyName: 'Katabi',
        reviewStatus: 'submitted',
      },
    ]);
    expect(requests.map((request) => request.url)).toEqual(
      [0, 100, 200, 300].map((offset) => `/hotspots?district_id=d1&limit=100&offset=${offset}`),
    );
  });

  it('reads further pages, a few at a time, until one comes back short', async () => {
    const page = (from: number, count: number) =>
      ok(Array.from({ length: count }, (_, index) => ({ id: `h${from + index}`, name: 'Bar' })));
    const { http, requests } = createTestHttp(
      page(0, 100),
      page(100, 100),
      page(200, 100),
      page(300, 100),
      page(400, 100),
      page(500, 3),
      ok([]),
      ok([]),
    );

    await expect(listDistrictHotspots(http, 'd1')).resolves.toHaveLength(503);
    expect(requests).toHaveLength(8);
    expect(requests[7]?.url).toBe('/hotspots?district_id=d1&limit=100&offset=700');
  });

  it('counts a hotspot that moved across a page boundary once', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: `h${index}` }));
    const { http } = createTestHttp(ok(full), ok([{ id: 'h99' }]), ok([]), ok([]));
    await expect(listDistrictHotspots(http, 'd1')).resolves.toHaveLength(100);
  });

  it('refuses a hotspot without an id', async () => {
    const { http } = createTestHttp(ok([{ name: 'Bar' }]), ok([]), ok([]), ok([]));
    await expect(listDistrictHotspots(http, 'd1')).rejects.toMatchObject({
      kind: 'unexpected_response',
    });
  });
});

describe('villageNames', () => {
  it('lists each village once, ignoring case, sorted', () => {
    expect(
      villageNames([
        { village: 'Kasenyi' },
        { village: 'kasenyi' },
        { village: '' },
        { village: 'Abaita Ababiri' },
      ]),
    ).toEqual(['Abaita Ababiri', 'Kasenyi']);
  });
});
