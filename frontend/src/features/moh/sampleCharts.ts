import type { ChartRow } from '@/components/charts/ChartCard';

/*
 * SAMPLE DATA. The MOH dashboard's charts have no API yet: there is no
 * warehouse stock history, weekly national order count or stockout report
 * endpoint. Every chart built from these is marked `isSample`.
 */

const WEEKS = ['W36', 'W37', 'W38', 'W39', 'W40', 'W41', 'W42', 'W43', 'W44', 'W45', 'W46', 'W47'];

/** Male condoms at NMS and JMS, in thousands of pieces, over the last 12 weeks. */
export const SAMPLE_WAREHOUSE_STOCK: ChartRow[] = [
  [520, 180],
  [505, 172],
  [490, 165],
  [560, 190],
  [545, 182],
  [530, 176],
  [515, 168],
  [500, 160],
  [585, 175],
  [560, 166],
  [505, 158],
  [512, 162],
].map(([nms = 0, jms = 0], index) => ({
  label: WEEKS[index] ?? '',
  values: { nms: nms * 1000, jms: jms * 1000 },
}));

/** Hotspot orders received and fulfilled per week, nationally, over the last 8 weeks. */
export const SAMPLE_NATIONAL_ORDERS: ChartRow[] = [
  [38, 35],
  [44, 40],
  [41, 39],
  [52, 47],
  [47, 45],
  [55, 50],
  [49, 46],
  [43, 37],
].map(([received = 0, fulfilled = 0], index) => ({
  label: WEEKS[index + 4] ?? '',
  values: { received, fulfilled },
}));

/** Stockouts reported per district in the last 30 days. */
export const SAMPLE_STOCKOUTS_BY_DISTRICT = [
  { label: 'Gulu', value: 9 },
  { label: 'Mukono', value: 7 },
  { label: 'Wakiso', value: 6 },
  { label: 'Kampala', value: 5 },
  { label: 'Mbarara', value: 2 },
];
