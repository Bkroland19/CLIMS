'use client';

import { CircleAlert, Grid2x2, Layers, MapPinOff, RefreshCw, Sparkles, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ExportButton } from '@/components/ExportButton';
import { PageActions } from '@/components/PageActions';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAppConfig } from '@/config/ConfigProvider';
import { useCan } from '@/features/auth/queries';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { useRegions } from '@/features/geography/queries';
import type { ExportColumn } from '@/lib/export/excel';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { HotspotDetail } from './map/HotspotDetail';
import { HotspotList, hotspotName, placeLine } from './map/HotspotList';
import type { HotspotMapHandle } from './map/HotspotMapCanvas';
import {
  ALL_REVIEW,
  activeFilterCount,
  boundsOf,
  byName,
  countBy,
  isWithin,
  matchesFilters,
  matchesQuery,
  nearestTo,
  parseMapState,
  searchTextOf,
  toggleShown,
  writeMapState,
  type Bounds,
  type ColourBy,
  type MapFilters,
  type MapState,
  type MapView,
} from './map/filters';
import { MapLegend } from './map/MapLegend';
import {
  CompactSelect,
  ExpandButton,
  FacetMenu,
  SearchBox,
  Segmented,
  VIEW_LABELS,
  type FacetOption,
} from './map/MapToolbar';
import {
  DISPENSER_CATEGORIES,
  REVIEW_CATEGORIES,
  categoriesFor,
  colourOf,
  useIsDarkTheme,
  useMapPalette,
  type MapPalette,
} from './map/palette';
import {
  DISPENSER_LABELS,
  DISPENSER_STATES,
  POSITION_LABELS,
  REVIEW_LABELS,
  VENUE_KINDS,
  VENUE_LABELS,
  isPlaced,
  type MapHotspot,
} from './map/records';
import { UGANDA_BOUNDS } from './map/uganda';
import { useMapHotspots, type MapScope } from './map/useMapHotspots';
import { VENUE_ICONS } from './map/venueIcons';
import { mapSummary } from './mapSummary';
import { useLocationDistricts } from './queries';

/*
 * The hotspot map: every hotspot the user can see on OpenStreetMap, clustered,
 * filtered and searchable, with a side panel listing what is in view and the
 * chosen hotspot's details. The view (filters, colouring, selection) is kept in
 * the page address, so it can be shared.
 *
 * MOH sees the whole country, loaded district by district, or one district
 * chosen in the top bar; a DCFP sees their district and a VHT their own
 * submissions, as the API scopes them.
 */

const HotspotMapCanvas = dynamic(() => import('./map/HotspotMapCanvas'), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

const VIEW_OPTIONS = (['clusters', 'heatmap', 'points'] as const).map((value) => ({
  value,
  label: VIEW_LABELS[value],
  icon: value === 'clusters' ? <Grid2x2 /> : value === 'heatmap' ? <Sparkles /> : <Layers />,
}));

const EXPORT_COLUMNS: readonly ExportColumn<MapHotspot>[] = [
  { header: 'Name', value: (hotspot) => hotspot.name },
  { header: 'Type', value: (hotspot) => hotspot.type },
  { header: 'Status', value: (hotspot) => REVIEW_LABELS[hotspot.review] },
  { header: 'Village', value: (hotspot) => hotspot.village },
  { header: 'Subcounty', value: (hotspot) => hotspot.subcounty?.name ?? null },
  { header: 'District', value: (hotspot) => hotspot.district?.name ?? null },
  { header: 'Region', value: (hotspot) => hotspot.region?.name ?? null },
  // As recorded, so a position left off the map can be found and corrected.
  { header: 'Latitude', value: (hotspot) => hotspot.recordedLatitude },
  { header: 'Longitude', value: (hotspot) => hotspot.recordedLongitude },
  { header: 'Position check', value: (hotspot) => POSITION_LABELS[hotspot.position] },
  { header: 'Dispenser', value: (hotspot) => DISPENSER_LABELS[hotspot.dispenser] },
  { header: 'Dispenser condition', value: (hotspot) => hotspot.dispenserCondition },
  { header: 'Contact person', value: (hotspot) => hotspot.contactName },
  { header: 'Contact phone', value: (hotspot) => hotspot.contactPhone },
  { header: 'Last updated', value: (hotspot) => hotspot.updatedAt },
];

type ListMode = 'view' | 'unplaced';

/** Counts for one filter, under every other filter, so a hidden choice still shows its count. */
function facetCounts<Key extends string>(
  hotspots: readonly MapHotspot[],
  filters: MapFilters,
  without: keyof MapFilters,
  keyOf: (hotspot: MapHotspot) => Key,
): Map<Key, number> {
  const others = { ...filters, [without]: null };
  return countBy(
    hotspots.filter((hotspot) => matchesFilters(hotspot, others)),
    keyOf,
  );
}

function hotspotColour(palette: MapPalette, colourBy: ColourBy) {
  return (hotspot: MapHotspot) => {
    const key = colourBy === 'review' ? hotspot.review : hotspot.dispenser;
    const category = categoriesFor(colourBy).find((candidate) => candidate.key === key);
    return category ? colourOf(palette, category) : palette.mutedForeground;
  };
}

function MapOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background/70 absolute inset-0 z-10 grid place-items-center p-4 backdrop-blur-[2px]">
      <div className="bg-card w-full max-w-sm rounded-lg border shadow-sm">{children}</div>
    </div>
  );
}

export default function HotspotMapPage({
  canSwitchDistrict = false,
}: {
  canSwitchDistrict?: boolean;
}) {
  const { mapTiles } = useAppConfig();
  const can = useCan();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const state = useMemo(() => parseMapState(new URLSearchParams(paramsKey)), [paramsKey]);

  // Written with the History API, which Next.js follows, so changing a filter or
  // the selection is not a navigation.
  const setState = useCallback(
    (patch: Partial<MapState>) => {
      const current = new URLSearchParams(paramsKey);
      const next = writeMapState(current, { ...parseMapState(current), ...patch });
      const query = next.toString();
      window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [paramsKey, pathname],
  );

  // Whose hotspots to load.
  const context = useDistrictContext();
  const allDistricts = can('hotspots:all_districts');
  const chosenDistrictId = canSwitchDistrict ? (context?.districtId ?? null) : null;
  const missingDistrictId = Boolean(canSwitchDistrict && context?.district && !chosenDistrictId);
  const districts = useLocationDistricts(allDistricts && chosenDistrictId === null);
  const regions = useRegions(allDistricts && chosenDistrictId === null);
  const scope: MapScope | null = chosenDistrictId
    ? { kind: 'district', districtId: chosenDistrictId, label: context?.district ?? 'District' }
    : allDistricts
      ? districts.data
        ? { kind: 'national', districts: districts.data }
        : null
      : { kind: 'own' };
  const { query: map, progress } = useMapHotspots(
    scope ?? { kind: 'own' },
    scope !== null && !missingDistrictId,
  );
  const result = map.data;
  // Sorted by name once, when the load completes; every list below filters this
  // order rather than sorting again. While loading, arrival order will do.
  const loaded = useMemo(
    () => (result ? [...result.hotspots].sort(byName) : (progress?.hotspots ?? [])),
    [result, progress],
  );
  const isLoading = !result && !map.isError;

  // Filters and search.
  const filters: MapFilters = useMemo(
    () => ({
      review: state.review,
      dispenser: state.dispenser,
      venue: state.venue,
      regionId: state.regionId,
    }),
    [state.review, state.dispenser, state.venue, state.regionId],
  );
  const [searchInput, setSearchInput] = useState('');
  const search = useDeferredValue(searchInput.trim());
  const searching = search !== '';
  const searchIndex = useMemo(
    () =>
      searching ? new Map(loaded.map((hotspot) => [hotspot.id, searchTextOf(hotspot)])) : null,
    [loaded, searching],
  );
  const filtered = useMemo(
    () => loaded.filter((hotspot) => matchesFilters(hotspot, filters)),
    [loaded, filters],
  );
  const matches = useMemo(
    () =>
      searchIndex
        ? filtered.filter((hotspot) => matchesQuery(searchIndex.get(hotspot.id) ?? '', search))
        : null,
    [filtered, search, searchIndex],
  );
  const shown = matches ?? filtered;
  const placed = useMemo(() => shown.filter(isPlaced), [shown]);
  const allPlaced = useMemo(() => loaded.filter(isPlaced), [loaded]);
  // A wrong position (swapped, or outside Uganda) is listed before a missing one:
  // those are the records with something to correct. Each group stays in name order.
  const unplaced = useMemo(
    () =>
      filtered
        .filter((hotspot) => !isPlaced(hotspot))
        .sort((a, b) => Number(a.position === 'missing') - Number(b.position === 'missing')),
    [filtered],
  );

  // Colours.
  const palette = useMapPalette();
  const dark = useIsDarkTheme();
  const colourFor = useMemo(
    () => hotspotColour(palette, state.colourBy),
    [palette, state.colourBy],
  );

  const facets = useMemo(() => {
    const review = facetCounts(loaded, filters, 'review', (hotspot) => hotspot.review);
    const dispenser = facetCounts(loaded, filters, 'dispenser', (hotspot) => hotspot.dispenser);
    const venue = facetCounts(loaded, filters, 'venue', (hotspot) => hotspot.venue);
    return {
      review: REVIEW_CATEGORIES.map((category): FacetOption<(typeof ALL_REVIEW)[number]> => ({
        key: category.key,
        label: category.label,
        count: review.get(category.key) ?? 0,
        colour: colourOf(palette, category),
      })),
      dispenser: DISPENSER_CATEGORIES.map(
        (category): FacetOption<(typeof DISPENSER_STATES)[number]> => ({
          key: category.key,
          label: category.label,
          count: dispenser.get(category.key) ?? 0,
          colour: colourOf(palette, category),
        }),
      ),
      venue: VENUE_KINDS.map((key) => ({
        key,
        label: VENUE_LABELS[key],
        count: venue.get(key) ?? 0,
        icon: VENUE_ICONS[key],
      })).filter((option) => option.count > 0 || state.venue?.includes(option.key)),
    };
  }, [loaded, filters, palette, state.venue]);

  // The map's viewport, for the list of what is in view.
  const mapRef = useRef<HotspotMapHandle>(null);
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const inView = useMemo(
    () => (viewport ? placed.filter((hotspot) => isWithin(hotspot, viewport)) : placed),
    [placed, viewport],
  );

  const [listMode, setListMode] = useState<ListMode>('view');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [mapFailure, setMapFailure] = useState<unknown>(null);
  const [tilesFailing, setTilesFailing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusDetail = useRef(false);

  // Selection.
  const byId = useMemo(() => new Map(loaded.map((hotspot) => [hotspot.id, hotspot])), [loaded]);
  const selectedRecord = state.selectedId ? (byId.get(state.selectedId) ?? null) : null;
  const selectedPlaced = selectedRecord && isPlaced(selectedRecord) ? selectedRecord : null;
  const neighbours = useMemo(
    () => (selectedPlaced ? nearestTo(selectedPlaced, allPlaced, 5) : []),
    [selectedPlaced, allPlaced],
  );

  const select = useCallback(
    (id: string | null, options: { fly?: boolean; focus?: boolean } = {}) => {
      setState({ selectedId: id });
      setHighlightedId(null);
      focusDetail.current = options.focus ?? false;
      if (id && options.fly) {
        const target = byId.get(id);
        if (target && isPlaced(target)) mapRef.current?.flyTo(target, 14);
      }
    },
    [byId, setState],
  );

  // Move focus into the panel when it changes under the user's hand.
  useEffect(() => {
    if (!focusDetail.current) return;
    focusDetail.current = false;
    const target = state.selectedId
      ? document.getElementById(`hotspot-${state.selectedId}-name`)
      : document.getElementById('hotspot-panel-heading');
    target?.focus();
  }, [state.selectedId]);

  // Frame the hotspots once each load completes, and again when the region changes.
  const framed = useRef<string | null>(null);
  const frameKey =
    result && mapReady
      ? `${scope?.kind ?? ''}:${chosenDistrictId ?? ''}:${state.regionId ?? ''}`
      : null;
  const sharedSelection = useRef(state.selectedId);
  useEffect(() => {
    if (!frameKey || framed.current === frameKey) return;
    framed.current = frameKey;
    // A shared link to one hotspot opens on that hotspot.
    const linked = sharedSelection.current ? byId.get(sharedSelection.current) : null;
    sharedSelection.current = null;
    if (linked && isPlaced(linked)) {
      mapRef.current?.flyTo(linked, 14);
      return;
    }
    // The national map opens on the whole country; a region, a district or a
    // user's own hotspots open on where those hotspots are.
    const national = scope?.kind === 'national' && state.regionId === null;
    const bounds = national ? UGANDA_BOUNDS : boundsOf(filtered.filter(isPlaced));
    if (bounds) mapRef.current?.fitTo(bounds, 13);
  }, [frameKey, filtered, byId, scope?.kind, state.regionId]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const describe = useCallback(
    (id: string) => {
      const hotspot = byId.get(id);
      if (!hotspot) return null;
      const status =
        state.colourBy === 'review'
          ? REVIEW_LABELS[hotspot.review]
          : DISPENSER_LABELS[hotspot.dispenser];
      return { title: hotspotName(hotspot), detail: `${status} · ${placeLine(hotspot)}` };
    },
    [byId, state.colourBy],
  );

  const basemap = mapTiles.kind === 'basemaps' ? mapTiles.basemaps : [];
  const [basemapId, setBasemapId] = useState(basemap[0]?.id ?? 'none');
  const activeBasemap = basemap.find(({ id }) => id === basemapId) ?? basemap[0] ?? null;

  const filterCount = activeFilterCount(filters);
  const clearFilters = () => {
    setState({ review: null, dispenser: null, venue: null, regionId: null });
    setSearchInput('');
  };

  const submitSearch = () => {
    if (!matches || matches.length === 0) return;
    const [first] = matches;
    if (matches.length === 1 && first) {
      select(first.id, { fly: true, focus: true });
      return;
    }
    const bounds = boundsOf(matches.filter(isPlaced));
    if (bounds) mapRef.current?.fitTo(bounds, 14);
  };

  const legendOptions = state.colourBy === 'review' ? facets.review : facets.dispenser;
  const legendShown = state.colourBy === 'review' ? state.review : state.dispenser;
  const toggleLegend = (key: string) => {
    if (state.colourBy === 'review') {
      setState({
        review: toggleShown(state.review, key as (typeof ALL_REVIEW)[number], ALL_REVIEW),
      });
    } else {
      setState({
        dispenser: toggleShown(
          state.dispenser,
          key as (typeof DISPENSER_STATES)[number],
          DISPENSER_STATES,
        ),
      });
    }
  };

  // What the side panel lists.
  const listing =
    matches !== null
      ? {
          title: 'Search results',
          items: matches,
          emptyTitle: 'No hotspots match',
          emptyHint: 'Check the spelling, or search for a village, district or phone number.',
        }
      : listMode === 'unplaced'
        ? {
            title: 'Not on the map',
            items: unplaced,
            emptyTitle: 'Every hotspot is on the map',
            emptyHint: 'All the hotspots shown have a position in Uganda.',
          }
        : {
            title: 'In view',
            items: inView,
            emptyTitle: isLoading ? 'Loading hotspots' : 'No hotspots in view',
            emptyHint: isLoading
              ? 'They appear here as each district arrives.'
              : 'Zoom out or move the map to see hotspots here.',
          };
  const inViewActive = inView.filter((hotspot) => hotspot.review === 'active').length;
  const inViewSubmitted = inView.filter((hotspot) => hotspot.review === 'submitted').length;
  const inViewKnownDispenser = inView.filter((hotspot) => hotspot.hasDispenser !== null);
  const coverage =
    inViewKnownDispenser.length > 0
      ? Math.round(
          (inViewKnownDispenser.filter((hotspot) => hotspot.hasDispenser).length /
            inViewKnownDispenser.length) *
            100,
        )
      : null;

  if (missingDistrictId) {
    return (
      <div className="bg-card rounded-card border">
        <EmptyState
          icon={MapPinOff}
          title="No map data for this district"
          description="This district is not in the location directory yet. Choose another district, or All districts."
        />
      </div>
    );
  }

  const failedDistricts = result?.failed ?? [];
  const nothingLoaded = Boolean(result) && loaded.length === 0;
  const filteredOut = loaded.length > 0 && shown.length === 0;

  return (
    <>
      <PageActions>
        <ExportButton
          name={matches ? 'Hotspot search' : 'Hotspots'}
          columns={EXPORT_COLUMNS}
          rows={isLoading ? undefined : shown}
        />
      </PageActions>

      <div
        className={cn(
          'flex min-w-0 flex-col gap-3',
          expanded && 'bg-background fixed inset-0 z-40 p-3',
        )}
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label={expanded ? 'Hotspot map, full view' : undefined}
      >
        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <SearchBox
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={submitSearch}
                resultCount={matches?.length ?? null}
              />
              <ExpandButton
                className="sm:hidden"
                expanded={expanded}
                onToggle={() => {
                  setExpanded((current) => !current);
                }}
              />
            </div>
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <FacetMenu
                label="Status"
                options={facets.review}
                shown={state.review}
                onToggle={(key) => {
                  setState({ review: toggleShown(state.review, key, ALL_REVIEW) });
                }}
                onShowAll={() => {
                  setState({ review: null });
                }}
              />
              <FacetMenu
                label="Dispenser"
                options={facets.dispenser}
                shown={state.dispenser}
                onToggle={(key) => {
                  setState({ dispenser: toggleShown(state.dispenser, key, DISPENSER_STATES) });
                }}
                onShowAll={() => {
                  setState({ dispenser: null });
                }}
              />
              <FacetMenu
                label="Venue"
                options={facets.venue}
                shown={state.venue}
                onToggle={(key) => {
                  setState({ venue: toggleShown(state.venue, key, VENUE_KINDS) });
                }}
                onShowAll={() => {
                  setState({ venue: null });
                }}
              />
              {regions.data && regions.data.length > 0 ? (
                <CompactSelect
                  className="[&_[data-slot=select-trigger]]:min-w-36"
                  label="Region"
                  value={state.regionId ?? 'all'}
                  options={[
                    { value: 'all', label: 'All regions' },
                    ...regions.data.map(({ id, name }) => ({ value: id, label: name })),
                  ]}
                  onChange={(value) => {
                    setState({ regionId: value === 'all' ? null : value });
                  }}
                />
              ) : null}
              {filterCount > 0 || searchInput ? (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={clearFilters}>
                  <X data-icon="inline-start" aria-hidden="true" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
          <ExpandButton
            className="max-sm:hidden"
            expanded={expanded}
            onToggle={() => {
              setExpanded((current) => !current);
            }}
          />
        </div>

        {failedDistricts.length > 0 ? (
          <div
            role="status"
            className="bg-warning/10 text-foreground flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-sm"
          >
            <CircleAlert aria-hidden="true" className="text-warning size-4 shrink-0" />
            <p className="min-w-0 flex-1">
              {failedDistricts.length === 1
                ? `Hotspots in ${failedDistricts[0]?.label ?? 'one district'} could not be loaded.`
                : `Hotspots in ${formatNumber(failedDistricts.length)} districts could not be loaded (${failedDistricts
                    .slice(0, 3)
                    .map(({ label }) => label)
                    .join(', ')}${failedDistricts.length > 3 ? ' and more' : ''}).`}{' '}
              The rest of the map is complete.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={map.isFetching}
              onClick={() => void map.refetch()}
            >
              <RefreshCw
                data-icon="inline-start"
                aria-hidden="true"
                className={map.isFetching ? 'animate-spin' : undefined}
              />
              Load again
            </Button>
          </div>
        ) : null}

        <div
          className={cn(
            'bg-card rounded-card grid min-h-0 overflow-hidden border lg:grid-cols-[minmax(0,1fr)_22rem]',
            expanded ? 'flex-1 grid-rows-[minmax(0,1fr)_minmax(0,40%)] lg:grid-rows-1' : '',
          )}
        >
          {/* Map */}
          <div
            className={cn(
              'relative min-h-0',
              expanded
                ? 'h-full'
                : 'h-[62svh] min-h-80 lg:h-[clamp(30rem,calc(100dvh-18.5rem),56rem)]',
            )}
          >
            {mapFailure ? (
              <div className="grid size-full place-items-center p-4">
                <ErrorState
                  title="This browser cannot draw the map"
                  error={
                    new Error(
                      'The map needs WebGL, which is switched off or unavailable here. The list beside it still works.',
                    )
                  }
                />
              </div>
            ) : (
              <HotspotMapCanvas
                handleRef={mapRef}
                basemap={activeBasemap}
                dark={dark}
                palette={palette}
                view={state.view}
                colourBy={state.colourBy}
                hotspots={placed}
                selected={selectedPlaced}
                highlightedId={highlightedId}
                initialBounds={UGANDA_BOUNDS}
                describe={describe}
                onSelect={(id) => {
                  select(id);
                }}
                onViewportChange={setViewport}
                onFailure={setMapFailure}
                onTilesFailing={() => {
                  setTilesFailing(true);
                }}
                onReady={() => {
                  setMapReady(true);
                }}
              />
            )}

            {/* How the map draws, and loading progress */}
            {!mapFailure ? (
              <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2">
                <div className="bg-card/95 pointer-events-auto flex max-w-full flex-col gap-1 overflow-x-auto rounded-lg border p-1 shadow-xs backdrop-blur-sm">
                  <Segmented<MapView>
                    label="Map style"
                    value={state.view}
                    options={VIEW_OPTIONS}
                    onChange={(view) => {
                      setState({ view });
                    }}
                  />
                  {basemap.length > 1 ? (
                    <Segmented
                      label="Base map"
                      value={activeBasemap?.id ?? ''}
                      options={basemap.map(({ id, label }) => ({ value: id, label }))}
                      onChange={setBasemapId}
                    />
                  ) : null}
                </div>
                {isLoading ? (
                  <div
                    role="status"
                    className="bg-card/95 pointer-events-auto flex max-w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-[0.8125rem] shadow-xs"
                  >
                    <Spinner aria-hidden="true" className="size-4 shrink-0" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate">
                        {!scope
                          ? 'Loading the district list…'
                          : progress && progress.partitionsTotal > 1
                            ? `Loading hotspots · ${formatNumber(progress.partitionsDone)} of ${formatNumber(progress.partitionsTotal)} districts`
                            : 'Loading hotspots…'}
                      </span>
                      {progress ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {formatNumber(progress.hotspots.length)} found so far
                        </span>
                      ) : null}
                      {progress && progress.partitionsTotal > 1 ? (
                        <span
                          role="progressbar"
                          aria-label="Districts loaded"
                          aria-valuemin={0}
                          aria-valuemax={progress.partitionsTotal}
                          aria-valuenow={progress.partitionsDone}
                          className="bg-muted h-1 w-40 overflow-hidden rounded-full"
                        >
                          <span
                            className="bg-primary block h-full rounded-full transition-[width] duration-300"
                            style={{
                              width: `${String(Math.round((progress.partitionsDone / progress.partitionsTotal) * 100))}%`,
                            }}
                          />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tilesFailing && !mapFailure ? (
              <p
                role="status"
                className="bg-card/95 absolute top-28 left-1/2 z-10 max-w-[calc(100%-6rem)] -translate-x-1/2 rounded-lg border px-3 py-1.5 text-center text-xs shadow-xs"
              >
                The street map could not load. Hotspots are still shown.
              </p>
            ) : null}

            {/* Legend */}
            {!mapFailure && loaded.length > 0 ? (
              <MapLegend
                colourBy={state.colourBy}
                onColourByChange={(colourBy) => {
                  setState({ colourBy });
                }}
                options={legendOptions}
                shown={legendShown}
                onToggle={toggleLegend}
                className="absolute bottom-3 left-3 z-10 w-64"
              />
            ) : null}

            {/* Selected hotspot, on screens where the panel is below the map */}
            {selectedRecord && !expanded ? (
              <div className="bg-card/95 absolute inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-lg border px-3 py-2 shadow-sm lg:hidden">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colourFor(selectedRecord) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hotspotName(selectedRecord)}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {placeLine(selectedRecord)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    panelRef.current?.scrollIntoView({ block: 'start' });
                    document.getElementById(`hotspot-${selectedRecord.id}-name`)?.focus({
                      preventScroll: true,
                    });
                  }}
                >
                  Details
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={() => {
                    select(null);
                  }}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ) : null}

            {map.isError && !result ? (
              <MapOverlay>
                <ErrorState
                  title="Could not load hotspots"
                  error={map.error}
                  onRetry={() => void map.refetch()}
                  isRetrying={map.isFetching}
                />
              </MapOverlay>
            ) : districts.isError && !scope ? (
              <MapOverlay>
                <ErrorState
                  title="Could not load the district list"
                  error={districts.error}
                  onRetry={() => void districts.refetch()}
                  isRetrying={districts.isFetching}
                />
              </MapOverlay>
            ) : nothingLoaded ? (
              <MapOverlay>
                <EmptyState
                  icon={MapPinOff}
                  title="No hotspots yet"
                  description={
                    allDistricts
                      ? 'Hotspots appear here once VHTs submit them.'
                      : 'Hotspots you can see appear here once they are submitted.'
                  }
                />
              </MapOverlay>
            ) : filteredOut && !isLoading ? (
              <MapOverlay>
                <EmptyState
                  icon={MapPinOff}
                  title="No hotspots match"
                  description="Nothing fits these filters and search together. Clear them to see every hotspot again."
                  action={
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              </MapOverlay>
            ) : null}
          </div>

          {/* Side panel */}
          <div
            ref={panelRef}
            className={cn(
              'flex min-h-0 scroll-mt-16 flex-col border-t lg:border-t-0 lg:border-l',
              expanded
                ? 'overflow-y-auto'
                : 'lg:h-[clamp(30rem,calc(100dvh-18.5rem),56rem)] lg:overflow-y-auto',
            )}
          >
            {state.selectedId ? (
              <HotspotDetail
                key={state.selectedId}
                id={state.selectedId}
                known={selectedRecord}
                neighbours={neighbours}
                colourOf={colourFor}
                onBack={() => {
                  select(null, { focus: true });
                }}
                onSelect={(id) => {
                  select(id, { fly: true, focus: true });
                }}
                onZoom={(hotspot) => {
                  if (isPlaced(hotspot)) mapRef.current?.flyTo(hotspot, 16);
                }}
              />
            ) : (
              <>
                <div className="bg-card sticky top-0 z-10 flex flex-col gap-2 border-b px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id="hotspot-panel-heading"
                      tabIndex={-1}
                      className="text-sm font-semibold outline-none"
                    >
                      {listing.title}
                    </h2>
                    <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
                      {isLoading && !progress
                        ? '…'
                        : `${formatNumber(listing.items.length)} ${listing.items.length === 1 ? 'hotspot' : 'hotspots'}`}
                    </span>
                  </div>
                  {matches === null && listMode === 'view' && inView.length > 0 ? (
                    <dl className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/60 rounded-md px-2 py-1.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">Active</dt>
                        <dd className="text-sm font-semibold tabular-nums">
                          {formatNumber(inViewActive)}
                        </dd>
                      </div>
                      <div className="bg-muted/60 rounded-md px-2 py-1.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">Awaiting review</dt>
                        <dd className="text-sm font-semibold tabular-nums">
                          {formatNumber(inViewSubmitted)}
                        </dd>
                      </div>
                      <div className="bg-muted/60 rounded-md px-2 py-1.5">
                        <dt className="text-muted-foreground text-[0.6875rem]">With dispenser</dt>
                        <dd className="text-sm font-semibold tabular-nums">
                          {coverage === null ? '—' : `${String(coverage)}%`}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  {listMode === 'unplaced' && matches === null ? (
                    <p className="text-muted-foreground text-xs">
                      Their recorded position is missing, has latitude and longitude the wrong way
                      round, or is outside Uganda. Correct it where the hotspot was recorded.
                    </p>
                  ) : null}
                  {listMode === 'unplaced' && matches === null ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto self-start px-0"
                      onClick={() => {
                        setListMode('view');
                      }}
                    >
                      Back to hotspots in view
                    </Button>
                  ) : null}
                </div>
                <HotspotList
                  resetKey={`${listing.title}:${search}`}
                  hotspots={listing.items}
                  colourBy={state.colourBy}
                  colourOf={colourFor}
                  showPosition={listMode === 'unplaced' && matches === null}
                  emptyTitle={listing.emptyTitle}
                  emptyHint={listing.emptyHint}
                  onSelect={(id) => {
                    select(id, { fly: true, focus: true });
                  }}
                  onHighlight={setHighlightedId}
                />
              </>
            )}
          </div>
        </div>

        {result || progress ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <p className="text-muted-foreground tabular-nums" aria-live="polite">
              {isLoading
                ? `${formatNumber(loaded.length)} hotspots loaded so far.`
                : mapSummary(
                    filtered.length - unplaced.length,
                    filtered.length,
                    unplaced.filter((hotspot) => hotspot.position !== 'missing').length,
                  )}
              {filterCount > 0 && !isLoading
                ? ` Filters hide ${formatNumber(loaded.length - filtered.length)}.`
                : ''}
            </p>
            {!isLoading && unplaced.length > 0 && listMode !== 'unplaced' ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => {
                  setListMode('unplaced');
                  select(null);
                  requestAnimationFrame(() => {
                    document.getElementById('hotspot-panel-heading')?.focus();
                  });
                }}
              >
                List the {formatNumber(unplaced.length)} not on the map
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
