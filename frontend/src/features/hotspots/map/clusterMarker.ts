import { formatNumber } from '@/lib/format';

import type { Category } from './palette';

/*
 * A cluster of hotspots drawn as a ring split by category (review status, or
 * dispenser state), with the count in the middle. It is a real <button>: Tab
 * reaches it, Enter zooms into it, and its name says what is in it in words.
 */

export interface ClusterSlice {
  category: Category<string>;
  colour: string;
  count: number;
}

/** "84", "1.2k", "18k": short enough for the ring at any size. */
export function compactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(Math.floor(count / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return `${String(Math.floor(count / 1000))}k`;
}

/** The ring's diameter in px: it grows with the count, by order of magnitude. */
export function clusterSize(count: number): number {
  if (count < 10) return 30;
  if (count < 100) return 36;
  if (count < 1000) return 44;
  return 52;
}

/** "312 hotspots: 280 active, 32 deactivated. Zoom in to see them." */
export function clusterLabel(total: number, slices: readonly ClusterSlice[]): string {
  const parts = slices
    .filter((slice) => slice.count > 0)
    .map((slice) => `${formatNumber(slice.count)} ${slice.category.label.toLowerCase()}`);
  return `${formatNumber(total)} hotspots: ${parts.join(', ')}. Zoom in to see them.`;
}

const SVG = 'http://www.w3.org/2000/svg';

export function createClusterElement(
  total: number,
  slices: readonly ClusterSlice[],
  surface: { card: string; foreground: string; border: string },
): HTMLButtonElement {
  const size = clusterSize(total);
  const stroke = size < 40 ? 5 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hotspot-cluster';
  button.dataset.size = size >= 44 ? 'large' : 'small';
  button.style.width = `${String(size)}px`;
  button.style.height = `${String(size)}px`;
  button.setAttribute('aria-label', clusterLabel(total, slices));

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${String(size)} ${String(size)}`);
  svg.setAttribute('aria-hidden', 'true');
  const centre = String(size / 2);

  const disc = document.createElementNS(SVG, 'circle');
  disc.setAttribute('cx', centre);
  disc.setAttribute('cy', centre);
  disc.setAttribute('r', String(size / 2 - 0.5));
  disc.setAttribute('fill', surface.card);
  disc.setAttribute('stroke', surface.border);
  svg.append(disc);

  // Each slice is a dashed circle: its dash is its share of the ring, offset past
  // the slices before it. The ring starts at 12 o'clock.
  let start = 0;
  const shown = slices.filter((slice) => slice.count > 0);
  for (const slice of shown) {
    const length = (slice.count / total) * circumference;
    const arc = document.createElementNS(SVG, 'circle');
    arc.setAttribute('cx', centre);
    arc.setAttribute('cy', centre);
    arc.setAttribute('r', String(radius));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', slice.colour);
    arc.setAttribute('stroke-width', String(stroke));
    // A hairline gap between slices keeps neighbouring colours apart.
    const gap = shown.length > 1 ? Math.min(1, length / 2) : 0;
    arc.setAttribute(
      'stroke-dasharray',
      `${String(Math.max(0, length - gap))} ${String(circumference)}`,
    );
    arc.setAttribute('stroke-dashoffset', String(-start));
    arc.setAttribute('transform', `rotate(-90 ${centre} ${centre})`);
    svg.append(arc);
    start += length;
  }

  const count = document.createElement('span');
  count.className = 'hotspot-cluster__count';
  count.textContent = compactCount(total);
  count.style.color = surface.foreground;
  count.setAttribute('aria-hidden', 'true');

  button.append(svg, count);
  return button;
}
