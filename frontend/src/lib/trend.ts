/** Which way a figure moving is good news. */
export type GoodDirection = 'up' | 'down';

/** Whether the latest change is good, bad, or neither. */
export type TrendMeaning = 'good' | 'bad' | 'neutral';

export interface TrendChange {
  /** Latest value minus the one before it. */
  delta: number;
  direction: 'up' | 'down' | 'flat';
  meaning: TrendMeaning;
}

/**
 * The change between the last two points of a series. With no
 * `goodDirection`, or no change, the change is neutral: a figure that is
 * neither good nor bad when it rises is never coloured as either. Returns null
 * when there are fewer than two finite points.
 */
export function trendChange(
  series: readonly number[],
  goodDirection?: GoodDirection,
): TrendChange | null {
  const points = series.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;
  // Both indexes are in range: the length check above guarantees two points.
  const delta = (points.at(-1) ?? 0) - (points.at(-2) ?? 0);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const meaning: TrendMeaning =
    direction === 'flat' || !goodDirection
      ? 'neutral'
      : direction === goodDirection
        ? 'good'
        : 'bad';
  return { delta, direction, meaning };
}

export interface SparklineGeometry {
  /** SVG path for the line. */
  line: string;
  /** The line closed down to the baseline, for the area fill. */
  area: string;
  /** Where the last point sits, for the end marker. */
  end: { x: number; y: number };
}

/** Space kept above and below the line so the stroke and end marker are not clipped. */
const PAD_TOP = 6;
const PAD_BOTTOM = 4;

/**
 * Lays a series out across a `width` × `height` box: first point on the left
 * edge, last on the right, lowest value at the bottom. A flat series sits on
 * the bottom line. Returns null when there are fewer than two finite points.
 */
export function sparklineGeometry(
  series: readonly number[],
  width: number,
  height: number,
): SparklineGeometry | null {
  const points = series.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const usable = height - PAD_TOP - PAD_BOTTOM;
  const coords = points.map((value, index) => ({
    x: (index / (points.length - 1)) * width,
    y: height - PAD_BOTTOM - ((value - min) / range) * usable,
  }));
  const line = `M${coords.map(({ x, y }) => `${round(x)},${round(y)}`).join(' L')}`;
  const end = coords.at(-1) ?? { x: width, y: height };
  return {
    line,
    area: `${line} L${round(width)},${round(height)} L0,${round(height)} Z`,
    end: { x: round(end.x), y: round(end.y) },
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
