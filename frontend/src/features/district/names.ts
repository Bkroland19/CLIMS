import { productName, type Lookup, type Product } from '@/features/catalogue/api';
import type { Store } from '@/features/geography/api';
import type { Hotspot } from '@/features/hotspots/api';

/**
 * Names for the ids orders carry. Orders name their hotspot, product, unit
 * and stores by id only, so screens look the names up in the lists below.
 */
export interface DistrictNames {
  hotspot(id: string | null): string;
  product(id: string): string;
  unit(id: string | null): string | null;
  store(id: string): string;
}

interface NameSources {
  hotspots?: readonly Pick<Hotspot, 'id' | 'name'>[];
  products?: readonly Product[];
  units?: readonly Lookup[];
  stores?: readonly Store[];
}

/** Looks names up in whichever lists have loaded; anything not found gets a plain fallback. */
export function districtNames({ hotspots, products, units, stores }: NameSources): DistrictNames {
  const hotspotNames = new Map(hotspots?.map((hotspot) => [hotspot.id, hotspot.name]));
  const productNames = new Map(products?.map((product) => [product.id, productName(product)]));
  const unitNames = new Map(units?.map((unit) => [unit.id, unit.name]));
  const storeNames = new Map(stores?.map((store) => [store.id, store.name]));
  return {
    hotspot: (id) => (id ? hotspotNames.get(id) : null) ?? 'Unknown hotspot',
    product: (id) => productNames.get(id) ?? 'Unknown product',
    unit: (id) => (id ? (unitNames.get(id) ?? null) : null),
    store: (id) => storeNames.get(id) ?? 'Unknown store',
  };
}
