'use client';

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatNumber } from '@/lib/format';

import {
  ChartCard,
  type ChartCardProps,
  type ChartMode,
  type ChartRow,
  type ChartSeries,
} from './ChartCard';
import { axisNumber } from './format';
import { TooltipValue, type ChartReference } from './TrendChart';

interface BarChartProps extends Omit<ChartCardProps, 'children' | 'legendShape' | 'series'> {
  /** One series, or several stacked in one bar per category. */
  series: ChartSeries | readonly ChartSeries[];
  rows: readonly ChartRow[];
  /** Bars shown in the card; focus mode and the table show them all. Default 10. */
  limit?: number;
  /** Sort by the total, largest first (default), or keep the order given. */
  sort?: 'total' | 'none';
  /** A vertical guide such as a target. */
  reference?: ChartReference;
  /** Fixes the scale's end, e.g. 100 for a percentage. */
  xMax?: number;
}

const ROW_HEIGHT = 28;
const LABEL_LIMIT = 22;

function total(row: ChartRow, series: readonly ChartSeries[]): number {
  return series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0);
}

/**
 * Ranked categories with long names (districts, stores, venue types): horizontal
 * bars, largest first, each with its value at the tip. The card shows the top
 * `limit`; the rest are a click away in focus mode.
 */
export function BarChart({
  series: input,
  rows,
  limit = 10,
  sort = 'total',
  reference,
  xMax,
  valueFormat = formatNumber,
  description,
  ...card
}: BarChartProps) {
  const animate = !useReducedMotion();
  const series: readonly ChartSeries[] = Array.isArray(input) ? input : [input as ChartSeries];
  const stacked = series.length > 1;
  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );
  const ordered =
    sort === 'total' ? [...rows].sort((a, b) => total(b, series) - total(a, series)) : [...rows];
  const last = series.length - 1;
  const hidden = Math.max(0, ordered.length - limit);

  const plot = (mode: ChartMode) => {
    const shown = mode === 'focus' ? ordered : ordered.slice(0, limit);
    const data = shown.map((row) => ({ label: row.label, ...row.values, __total: total(row, series) }));
    return (
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: Math.max(120, shown.length * ROW_HEIGHT + 28) }}
      >
        <RechartsBarChart
          accessibilityLayer
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} strokeDasharray="0" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            domain={[0, xMax ?? 'auto']}
            allowDecimals={false}
            tickFormatter={(value: number) => axisNumber(value)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width="auto"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={0}
            tickFormatter={(value: string) =>
              value.length > LABEL_LIMIT ? `${value.slice(0, LABEL_LIMIT - 1)}…` : value
            }
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value, name, item) => (
                  <TooltipValue
                    color={String(item.color ?? item.payload?.fill ?? '')}
                    label={String(config[String(name)]?.label ?? name)}
                    value={typeof value === 'number' ? valueFormat(value) : '—'}
                  />
                )}
              />
            }
          />
          {reference ? (
            <ReferenceLine
              x={reference.value}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              label={{
                value: reference.label,
                position: 'insideTopRight',
                fill: 'var(--muted-foreground)',
                fontSize: 11,
              }}
            />
          ) : null}
          {series.map((item, index) => (
            <Bar
              isAnimationActive={animate}
              key={item.key}
              dataKey={item.key}
              fill={`var(--color-${item.key})`}
              stackId={stacked ? 'stack' : undefined}
              radius={!stacked || index === last ? [0, 4, 4, 0] : 0}
              stroke={stacked ? 'var(--card)' : undefined}
              strokeWidth={stacked ? 1 : 0}
              maxBarSize={18}
              // A zero still shows as a sliver with its value, so "0%" is not mistaken for "no data".
              minPointSize={index === last ? 2 : 0}
            >
              {index === last ? (
                <LabelList
                  dataKey={stacked ? '__total' : item.key}
                  position="right"
                  offset={6}
                  className="fill-foreground"
                  fontSize={11}
                  formatter={(value: unknown) => (typeof value === 'number' ? valueFormat(value) : '')}
                />
              ) : null}
            </Bar>
          ))}
        </RechartsBarChart>
      </ChartContainer>
    );
  };

  return (
    <ChartCard
      series={series}
      rows={ordered}
      valueFormat={valueFormat}
      legendShape="square"
      description={hidden > 0 ? `${description} Top ${limit} of ${formatNumber(ordered.length)}.` : description}
      {...card}
    >
      {plot}
    </ChartCard>
  );
}
