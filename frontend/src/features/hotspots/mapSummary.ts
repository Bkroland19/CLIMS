import { formatNumber } from '@/lib/format';

const have = (count: number) => `${formatNumber(count)} ${count === 1 ? 'has' : 'have'}`;

/**
 * One sentence on how many hotspots are plotted, and why the rest are not:
 * `outside` of the unplotted ones have a position, but not one in Uganda.
 */
export function mapSummary(onMap: number, total: number, outside = 0): string {
  if (total === 0) return 'There are no hotspots to show.';

  const plotted = `${formatNumber(onMap)} of ${formatNumber(total)} ${
    total === 1 ? 'hotspot is' : 'hotspots are'
  } on the map.`;
  const missing = total - onMap - outside;
  if (missing <= 0 && outside <= 0) return plotted;
  if (outside <= 0) return `${plotted} ${have(missing)} no position recorded.`;
  if (missing <= 0) return `${plotted} ${have(outside)} a position outside Uganda.`;
  return `${plotted} ${have(missing)} no position recorded and ${have(outside)} one outside Uganda.`;
}
