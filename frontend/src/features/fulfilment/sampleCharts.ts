import type { ChartRow } from '@/components/charts/ChartCard';

/*
 * SAMPLE DATA. The DCFP dashboard's charts have no API yet: there is no
 * stock history, weekly order count or stockout report endpoint. Every chart
 * built from these is marked `isSample`.
 */

export const SAMPLE_STORE_STOCK: ChartRow[] = [
  ['20 Oct', 6400],
  ['24 Oct', 5900],
  ['28 Oct', 5200],
  ['1 Nov', 7800],
  ['5 Nov', 6900],
  ['9 Nov', 5600],
  ['13 Nov', 3900],
  ['17 Nov', 1400],
].map(([label, male]) => ({ label: String(label), values: { male: Number(male) } }));

export const SAMPLE_WEEKLY_ORDERS: ChartRow[] = [
  ['W40', 6, 5],
  ['W41', 9, 8],
  ['W42', 7, 7],
  ['W43', 11, 9],
  ['W44', 8, 8],
  ['W45', 10, 9],
  ['W46', 9, 7],
  ['W47', 7, 4],
].map(([label, received, delivered]) => ({
  label: String(label),
  values: { received: Number(received), delivered: Number(delivered) },
}));

export const SAMPLE_STOCKOUTS_BY_SUBCOUNTY = [
  { label: 'Nansana Municipality', value: 4 },
  { label: 'Katabi TC', value: 3 },
  { label: 'Kajjansi TC', value: 2 },
  { label: 'Kira Municipality', value: 2 },
  { label: 'Ssisa', value: 1 },
];
