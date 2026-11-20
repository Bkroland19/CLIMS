import type { ComponentProps } from 'react';

import { sparklineGeometry } from '@/lib/trend';
import { cn } from '@/lib/utils';

interface SparklineProps extends Omit<ComponentProps<'svg'>, 'children' | 'width' | 'height'> {
  /** Oldest first. Non-numeric points are skipped. */
  series: readonly number[];
  /** Box size in pixels. */
  width?: number;
  height?: number;
}

/**
 * A small line with a 12% area fill and a marker on the latest point, for the
 * shape of a trend next to a figure. It is decorative: the figure and its
 * change must be given as text beside it. Colour follows `currentColor`, so
 * set it with a text class. Renders nothing with fewer than two points.
 *
 * ```tsx
 * <Sparkline series={[3, 5, 4, 6]} className="text-info" />
 * ```
 */
export function Sparkline({
  series,
  width = 84,
  height = 32,
  className,
  ...props
}: SparklineProps) {
  const geometry = sparklineGeometry(series, width, height);
  if (!geometry) return null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0 overflow-visible', className)}
      {...props}
    >
      <path d={geometry.area} fill="currentColor" fillOpacity={0.12} />
      <path
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={geometry.end.x}
        cy={geometry.end.y}
        r={2.5}
        className="fill-card"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
}
