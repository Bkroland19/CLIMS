import { describe, expect, it } from 'vitest';

import type { Lookup, Product } from '@/features/catalogue/api';

import { districtNames } from './names';

const product: Product = {
  id: 'p-1',
  category: 'male',
  type: 'free',
  brand: { id: 'b-1', name: 'Engabu' },
  unit: { id: 'u-1', name: 'Box' },
  pieces_per_unit: 144,
  active: true,
  in_use: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const unit: Lookup = {
  id: 'u-1',
  name: 'Box',
  note: null,
  active: true,
  in_use: true,
  product_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('districtNames', () => {
  it('names the ids an order carries', () => {
    const names = districtNames({
      hotspots: [{ id: 'h-1', name: 'Kasenyi Landing Site' }],
      products: [product],
      units: [unit],
      stores: [
        {
          id: 's-1',
          code: 'jms',
          name: 'Joint Medical Store',
          store_type: 'national',
          district_id: null,
          district_name: null,
        },
      ],
    });

    expect(names.hotspot('h-1')).toBe('Kasenyi Landing Site');
    expect(names.product('p-1')).toBe('Engabu · Male · Free (public sector)');
    expect(names.unit('u-1')).toBe('Box');
    expect(names.store('s-1')).toBe('Joint Medical Store');
  });

  it('falls back plainly for what is unknown or not loaded', () => {
    const names = districtNames({ hotspots: [{ id: 'h-1', name: null }] });

    expect(names.hotspot('h-1')).toBe('Unknown hotspot');
    expect(names.hotspot(null)).toBe('Unknown hotspot');
    expect(names.product('p-1')).toBe('Unknown product');
    expect(names.unit('u-1')).toBeNull();
    expect(names.unit(null)).toBeNull();
    expect(names.store('s-1')).toBe('Unknown store');
  });
});
