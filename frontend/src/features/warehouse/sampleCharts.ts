import type { ChartRow } from '@/components/charts/ChartCard';

/*
 * SAMPLE DATA. The warehouse dashboard's charts have no API yet: there is no
 * dispatch history or requests-by-district report endpoint. Every chart
 * built from these is marked `isSample`.
 */

export const SAMPLE_WEEKLY_DISPATCHES: ChartRow[] = [
  ['W40', 42000],
  ['W41', 38000],
  ['W42', 51000],
  ['W43', 46000],
  ['W44', 30000],
  ['W45', 55000],
  ['W46', 48000],
  ['W47', 36000],
].map(([label, male]) => ({ label: String(label), values: { male: Number(male) } }));

export const SAMPLE_REQUESTS_BY_DISTRICT = [
  { label: 'Wakiso', value: 6 },
  { label: 'Mukono', value: 4 },
  { label: 'Jinja', value: 3 },
  { label: 'Mbarara', value: 3 },
  { label: 'Masaka', value: 2 },
];
