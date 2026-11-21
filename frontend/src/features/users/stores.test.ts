import { describe, expect, it } from 'vitest';

import type { Store } from '@/features/geography/api';

import { storeFor, storeLabel, storeNeedFor, storeNeedOf, storesFor } from './stores';

const jms: Store = {
  id: 's-jms',
  code: 'jms',
  name: 'Joint Medical Store',
  store_type: 'national',
  district_id: null,
  district_name: null,
};
const nms: Store = { ...jms, id: 's-nms', code: 'nms', name: 'National Medical Stores' };
const wakiso: Store = {
  id: 's-wakiso',
  code: 'ugWakiso',
  name: 'Wakiso',
  store_type: 'district',
  district_id: 'd-wakiso',
  district_name: 'Wakiso',
};
const stores = [jms, nms, wakiso];

describe('storeNeedFor', () => {
  it('sends DCFPs and delivery agents to their district and warehouse staff to their warehouse', () => {
    expect(storeNeedFor('DFCP')).toEqual({ kind: 'district' });
    expect(storeNeedFor(' dcfp ')).toEqual({ kind: 'district' });
    expect(storeNeedFor('delivery agent')).toEqual({ kind: 'district' });
    expect(storeNeedFor('nms')).toEqual({ kind: 'national', code: 'nms' });
    expect(storeNeedFor('jms')).toEqual({ kind: 'national', code: 'jms' });
    expect(storeNeedFor('moh')).toBeNull();
    expect(storeNeedFor(null)).toBeNull();
  });

  it('takes the first role that works at a store', () => {
    expect(storeNeedOf(['moh', null, 'jms', 'dfcp'])).toEqual({ kind: 'national', code: 'jms' });
    expect(storeNeedOf(['admin'])).toBeNull();
  });
});

describe('storeFor', () => {
  it("gives a district role its district's store and a warehouse role its warehouse", () => {
    expect(storeFor({ kind: 'district' }, stores, 'd-wakiso')).toBe(wakiso);
    expect(storeFor({ kind: 'district' }, stores, '')).toBeNull();
    expect(storeFor({ kind: 'district' }, stores, 'd-unknown')).toBeNull();
    expect(storeFor({ kind: 'national', code: 'nms' }, stores, 'd-wakiso')).toBe(nms);
    expect(storeFor(null, stores, 'd-wakiso')).toBeNull();
  });
});

describe('storesFor', () => {
  it('offers the stores of the kind the role works at, or every store', () => {
    expect(storesFor({ kind: 'district' }, stores)).toEqual([wakiso]);
    expect(storesFor({ kind: 'national', code: 'jms' }, stores)).toEqual([jms, nms]);
    expect(storesFor(null, stores)).toEqual(stores);
  });
});

describe('storeLabel', () => {
  it('names a district store after its district', () => {
    expect(storeLabel(wakiso)).toBe('Wakiso district store');
    expect(storeLabel(jms)).toBe('Joint Medical Store');
    expect(storeLabel({ ...wakiso, district_name: null })).toBe('Wakiso');
  });
});
