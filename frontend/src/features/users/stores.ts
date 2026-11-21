import type { Store } from '@/features/geography/api';

/**
 * Which store a role works at. A DCFP or delivery agent works at their
 * district's store; NMS and JMS staff at the warehouse their role is named
 * after. Every other role has no store.
 */
export type StoreNeed = { kind: 'district' } | { kind: 'national'; code: 'nms' | 'jms' };

export function storeNeedFor(roleName: string | null | undefined): StoreNeed | null {
  switch (roleName?.trim().toLowerCase()) {
    case 'dfcp':
    case 'dcfp':
    case 'delivery agent':
      return { kind: 'district' };
    case 'nms':
      return { kind: 'national', code: 'nms' };
    case 'jms':
      return { kind: 'national', code: 'jms' };
    default:
      return null;
  }
}

/** The first store need among several roles, for accounts that hold more than one. */
export function storeNeedOf(roleNames: readonly (string | null | undefined)[]): StoreNeed | null {
  for (const name of roleNames) {
    const need = storeNeedFor(name);
    if (need) return need;
  }
  return null;
}

/** The store a new account gets: its district's store, or its warehouse. */
export function storeFor(
  need: StoreNeed | null,
  stores: readonly Store[],
  districtId: string,
): Store | null {
  if (!need) return null;
  if (need.kind === 'national') return stores.find((store) => store.code === need.code) ?? null;
  if (!districtId) return null;
  return stores.find((store) => store.district_id === districtId) ?? null;
}

/** The stores worth offering when changing an account's store: those of the kind its role works at. */
export function storesFor(need: StoreNeed | null, stores: readonly Store[]): readonly Store[] {
  if (!need) return stores;
  const type = need.kind === 'national' ? 'national' : 'district';
  return stores.filter((store) => store.store_type === type);
}

/** "Wakiso district store" or "National Medical Stores", for a list or a summary. */
export function storeLabel(store: Store): string {
  return store.store_type === 'district' && store.district_name
    ? `${store.district_name} district store`
    : store.name;
}
