'use client';

import { ArrowLeft, Copy, Crosshair, Navigation, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailList } from '@/components/DetailList';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/lib/copyText';
import { EMPTY_VALUE, formatDate, formatText, formatTimestamp } from '@/lib/format';

import { eventSentence, useHotspotDetail, useHotspotEvents } from './detail';
import { formatDistance, type Neighbour } from './filters';
import { hotspotName, placeLine } from './HotspotList';
import {
  DISPENSER_SHORT_LABELS,
  DISPENSER_TONES,
  REVIEW_HINTS,
  REVIEW_LABELS,
  isPlaced,
  type MapHotspot,
} from './records';

/*
 * One hotspot in the side panel: where it is, who runs it, its dispenser, the
 * hotspots nearest to it (for planning a delivery round), its comments and its
 * history. The list row it came from had the basics; the rest is read from
 * `GET /hotspots/{id}` and `/events` when it opens.
 */

const COMMENT_KINDS: Record<string, string> = {
  comment: 'Comment',
  activated: 'Reason for activating',
  deactivated: 'Reason for deactivating',
  rejected: 'Reason for rejecting',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t px-4 py-3">
      <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pending({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton key={line} className="h-4 w-full last:w-2/3" />
      ))}
    </div>
  );
}

const coordinate = (value: number) => value.toFixed(6);

interface HotspotDetailProps {
  id: string;
  /** The record from the map's list, shown at once; the API's copy replaces it. */
  known: MapHotspot | null;
  neighbours: readonly Neighbour[];
  onBack: () => void;
  onSelect: (id: string) => void;
  onZoom: (hotspot: MapHotspot) => void;
  colourOf: (hotspot: MapHotspot) => string;
}

export function HotspotDetail({
  id,
  known,
  neighbours,
  onBack,
  onSelect,
  onZoom,
  colourOf,
}: HotspotDetailProps) {
  const detail = useHotspotDetail(id);
  const events = useHotspotEvents(id);
  const hotspot = detail.data?.hotspot ?? known;
  const comments = detail.data?.comments ?? [];

  return (
    <article aria-labelledby={`hotspot-${id}-name`} className="flex flex-col">
      <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
        <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to list
        </Button>
        {hotspot ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h2
                id={`hotspot-${id}-name`}
                tabIndex={-1}
                className="text-base leading-snug font-semibold break-words outline-none"
              >
                {hotspotName(hotspot)}
              </h2>
              <p className="text-muted-foreground text-[0.8125rem]">{placeLine(hotspot)}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={REVIEW_LABELS[hotspot.review]} />
                <StatusBadge
                  status={DISPENSER_SHORT_LABELS[hotspot.dispenser]}
                  tone={DISPENSER_TONES[hotspot.dispenser]}
                />
              </div>
              <p className="text-muted-foreground text-xs">{REVIEW_HINTS[hotspot.review]}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {isPlaced(hotspot) ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onZoom(hotspot);
                    }}
                  >
                    <Crosshair data-icon="inline-start" aria-hidden="true" />
                    Zoom to
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://www.openstreetmap.org/directions?route=%3B${String(hotspot.latitude)}%2C${String(hotspot.longitude)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation data-icon="inline-start" aria-hidden="true" />
                      Directions
                      <span className="sr-only"> (opens OpenStreetMap in a new tab)</span>
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void copyText(
                        `${coordinate(hotspot.latitude)}, ${coordinate(hotspot.longitude)}`,
                        'coordinates',
                      );
                    }}
                  >
                    <Copy data-icon="inline-start" aria-hidden="true" />
                    Copy coordinates
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No position is recorded, so this hotspot is not on the map.
                </p>
              )}
            </div>
          </>
        ) : detail.isError ? (
          <p role="alert" className="text-destructive text-sm">
            Could not load this hotspot. It may have been removed, or be outside your district.
          </p>
        ) : (
          <Pending lines={3} />
        )}
      </div>

      {hotspot ? (
        <>
          <Section title="Contact person">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{formatText(hotspot.contactName)}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatText(hotspot.contactPhone)}
                </p>
              </div>
              {hotspot.contactPhone ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${hotspot.contactPhone.replace(/[^\d+]/g, '')}`}>
                    <Phone data-icon="inline-start" aria-hidden="true" />
                    Call
                  </a>
                </Button>
              ) : null}
            </div>
          </Section>

          <Section title="Details">
            <DetailList
              items={[
                { label: 'Type', value: formatText(hotspot.type) },
                { label: 'Village', value: formatText(hotspot.village) },
                { label: 'Subcounty', value: formatText(hotspot.subcounty?.name) },
                { label: 'District', value: formatText(hotspot.district?.name) },
                { label: 'Region', value: formatText(hotspot.region?.name) },
                {
                  label: 'Dispenser',
                  value:
                    hotspot.hasDispenser === null
                      ? EMPTY_VALUE
                      : hotspot.hasDispenser
                        ? `Yes${hotspot.dispenserCondition ? `, ${hotspot.dispenserCondition.toLowerCase()}` : ''}`
                        : 'No',
                },
                {
                  label: 'Position',
                  value: isPlaced(hotspot) ? (
                    <span className="tabular-nums">
                      {coordinate(hotspot.latitude)}, {coordinate(hotspot.longitude)}
                    </span>
                  ) : (
                    EMPTY_VALUE
                  ),
                },
                { label: 'Added', value: formatDate(hotspot.createdAt) },
                { label: 'Last updated', value: formatDate(hotspot.updatedAt) },
              ]}
            />
          </Section>
        </>
      ) : null}

      {neighbours.length > 0 ? (
        <Section title="Nearest hotspots">
          <ul className="-mx-2 flex flex-col">
            {neighbours.map(({ hotspot: neighbour, km }) => (
              <li key={neighbour.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(neighbour.id);
                  }}
                  className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colourOf(neighbour) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{hotspotName(neighbour)}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatDistance(km)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Straight-line distance, among the hotspots loaded.
          </p>
        </Section>
      ) : null}

      <Section title="Comments">
        {detail.isPending ? (
          <Pending />
        ) : detail.isError ? (
          <p className="text-muted-foreground text-sm">Could not load the comments.</p>
        ) : comments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-0.5">
                <p className="text-sm break-words whitespace-pre-line">{comment.comment}</p>
                <p className="text-muted-foreground text-xs">
                  {COMMENT_KINDS[comment.action] ?? 'Comment'} ·{' '}
                  {formatTimestamp(comment.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="History">
        {events.isPending ? (
          <Pending />
        ) : events.isError ? (
          <p className="text-muted-foreground text-sm">Could not load the history.</p>
        ) : events.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No steps recorded. Hotspots brought over from the old system start without history.
          </p>
        ) : (
          <ActivityTimeline
            entries={events.data.map((event) => ({
              id: event.id,
              text: eventSentence(event.action),
              meta: formatTimestamp(event.created_at),
              role: 'system',
            }))}
          />
        )}
      </Section>
    </article>
  );
}
