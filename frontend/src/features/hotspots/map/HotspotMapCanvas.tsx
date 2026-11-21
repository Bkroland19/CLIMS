'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import './hotspotMap.css';

import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibre,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type CircleLayerSpecification,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react';

import type { Basemap } from '@/config/env';
import { cn } from '@/lib/utils';

import { createClusterElement, type ClusterSlice } from './clusterMarker';
import type { Bounds, ColourBy, MapView } from './filters';
import {
  DISPENSER_CATEGORIES,
  REVIEW_CATEGORIES,
  categoriesFor,
  colourOf,
  type Category,
  type MapPalette,
} from './palette';
import type { PlacedHotspot } from './records';

/*
 * The hotspot map itself: OpenStreetMap raster tiles under the hotspots, drawn
 * with MapLibre GL (WebGL), so twelve thousand points pan smoothly.
 *
 *   clusters  nearby hotspots merge into rings split by category, with the count
 *             inside; a single hotspot is a dot
 *   heatmap   where hotspots are dense, turning into dots as you zoom in
 *   points    every hotspot as a dot
 *
 * The base map is desaturated so the hotspots carry the colour, and inverted in
 * the dark theme. Everything this component knows comes in as props; the page
 * owns the filters and the selection.
 */

// MapLibre runs its tiling in a worker. Bundlers cannot follow the URL it builds
// for that file by itself, so the file is named here and shipped as an asset.
let workerConfigured = false;
function configureWorker() {
  if (workerConfigured) return;
  setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
  workerConfigured = true;
}

export interface HotspotMapHandle {
  /** Frames `bounds`, not closer than `maxZoom`. */
  fitTo: (bounds: Bounds, maxZoom?: number) => void;
  /** Centres on a point, zooming in to at least `zoom`. */
  flyTo: (point: { latitude: number; longitude: number }, zoom?: number) => void;
}

interface HotspotMapCanvasProps {
  /** Not `ref`: `next/dynamic` wrappers may keep `ref` for themselves. */
  handleRef?: Ref<HotspotMapHandle>;
  /** `null` draws the hotspots on a plain background. */
  basemap: Basemap | null;
  dark: boolean;
  palette: MapPalette;
  view: MapView;
  colourBy: ColourBy;
  hotspots: readonly PlacedHotspot[];
  selected: PlacedHotspot | null;
  /** A hotspot pointed at in the list, ringed on the map. */
  highlightedId: string | null;
  initialBounds: Bounds;
  /** The words shown when the pointer rests on a hotspot. */
  describe: (id: string) => { title: string; detail: string } | null;
  onSelect: (id: string | null) => void;
  onViewportChange: (bounds: Bounds) => void;
  /** The map could not start, e.g. WebGL is off. */
  onFailure: (error: unknown) => void;
  /** Base map tiles are failing to load (offline, or blocked). */
  onTilesFailing: () => void;
  /** The map has loaded and can be moved. */
  onReady?: () => void;
  className?: string;
}

const SOURCE = 'hotspots';
const FLAT_SOURCE = 'hotspots-flat';
const FOCUS_SOURCE = 'focus';
const BASEMAP = 'basemap';
const LAYERS = {
  heat: 'hotspot-heat',
  flatPoints: 'hotspot-points-flat',
  points: 'hotspot-points',
  highlight: 'hotspot-highlight',
  selectedHalo: 'hotspot-selected-halo',
  selected: 'hotspot-selected',
} as const;
const POINT_LAYERS = [LAYERS.points, LAYERS.flatPoints];
const CLUSTER_MAX_ZOOM = 14;

const reviewKey = (key: string) => `r_${key}`;
const dispenserKey = (key: string) => `d_${key}`;

/** A cluster property per category: how many of its hotspots fall in it. */
const CLUSTER_PROPERTIES = Object.fromEntries([
  ...REVIEW_CATEGORIES.map(({ key }) => [
    reviewKey(key),
    ['+', ['case', ['==', ['get', 'r'], key], 1, 0]],
  ]),
  ...DISPENSER_CATEGORIES.map(({ key }) => [
    dispenserKey(key),
    ['+', ['case', ['==', ['get', 'd'], key], 1, 0]],
  ]),
]) as Record<string, unknown>;

function toFeatures(hotspots: readonly PlacedHotspot[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((hotspot) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [hotspot.longitude, hotspot.latitude] },
      properties: { id: hotspot.id, r: hotspot.review, d: hotspot.dispenser },
    })),
  };
}

function colourExpression(colourBy: ColourBy, palette: MapPalette): ExpressionSpecification {
  const property = colourBy === 'review' ? 'r' : 'd';
  const pairs = categoriesFor(colourBy).flatMap((category) => [
    category.key,
    colourOf(palette, category),
  ]);
  return [
    'match',
    ['get', property],
    ...pairs,
    palette.mutedForeground,
  ] as unknown as ExpressionSpecification;
}

function withAlpha(colour: string, alpha: number): string {
  const hex = colour.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return colour;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

const DOT_RADIUS: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5,
  3,
  9,
  4.5,
  13,
  6.5,
  17,
  9,
];

function basemapPaint(dark: boolean) {
  // Dark: invert the light tiles and turn the hues back, so water stays blue.
  return dark
    ? {
        'raster-brightness-min': 0.88,
        'raster-brightness-max': 0.06,
        'raster-hue-rotate': 180,
        'raster-saturation': -0.55,
        'raster-contrast': -0.1,
      }
    : {
        'raster-brightness-min': 0.04,
        'raster-brightness-max': 1,
        'raster-hue-rotate': 0,
        'raster-saturation': -0.6,
        'raster-contrast': -0.08,
      };
}

function applyBasemap(map: MapLibre, basemap: Basemap | null, dark: boolean) {
  if (map.getLayer(BASEMAP)) map.removeLayer(BASEMAP);
  if (map.getSource(BASEMAP)) map.removeSource(BASEMAP);
  if (!basemap) return;
  map.addSource(BASEMAP, {
    type: 'raster',
    tiles: [...basemap.tiles],
    tileSize: 256,
    maxzoom: basemap.maxZoom,
    attribution: basemap.attribution,
  });
  map.addLayer(
    { id: BASEMAP, type: 'raster', source: BASEMAP, paint: basemapPaint(dark) },
    map.getLayer(LAYERS.heat) ? LAYERS.heat : undefined,
  );
}

function sliceCounts(
  properties: Record<string, unknown>,
  colourBy: ColourBy,
  palette: MapPalette,
): ClusterSlice[] {
  return categoriesFor(colourBy).map((category: Category<string>) => {
    const name = colourBy === 'review' ? reviewKey(category.key) : dispenserKey(category.key);
    const value = properties[name];
    return {
      category,
      colour: colourOf(palette, category),
      count: typeof value === 'number' ? value : 0,
    };
  });
}

function prefersCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export default function HotspotMapCanvas({
  handleRef,
  basemap,
  dark,
  palette,
  view,
  colourBy,
  hotspots,
  selected,
  highlightedId,
  initialBounds,
  describe,
  onSelect,
  onViewportChange,
  onFailure,
  onTilesFailing,
  onReady,
  className,
}: HotspotMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  // Cluster rings are DOM elements, rebuilt when the data or colours change.
  const clusters = useRef({
    generation: 0,
    cache: new Map<string, Marker>(),
    onScreen: new Map<string, Marker>(),
  });
  const look = useRef({ view, colourBy, palette });

  const select = useEffectEvent((id: string | null) => {
    onSelect(id);
  });
  const viewportChanged = useEffectEvent((bounds: Bounds) => {
    onViewportChange(bounds);
  });
  const failed = useEffectEvent((error: unknown) => {
    onFailure(error);
  });
  const tilesFailing = useEffectEvent(() => {
    onTilesFailing();
  });
  const loaded = useEffectEvent(() => {
    onReady?.();
  });
  const label = useEffectEvent((id: string) => describe(id));
  const startingView = useEffectEvent(() => ({ basemap, dark, palette, initialBounds }));

  useImperativeHandle(
    handleRef,
    () => ({
      fitTo: (bounds, maxZoom = 13) => {
        const map = mapRef.current;
        if (!map) return;
        if (bounds.west === bounds.east && bounds.south === bounds.north) {
          map.flyTo({ center: [bounds.west, bounds.south], zoom: Math.min(maxZoom, 15) });
          return;
        }
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          // Clear of the style card (top left), the controls (right) and the key (bottom).
          { padding: { top: 96, right: 56, bottom: 170, left: 40 }, maxZoom },
        );
      },
      flyTo: (point, zoom = 14) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(map.getZoom(), zoom),
        });
      },
    }),
    [],
  );

  // Create the map once; everything else updates it in place.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const start = startingView();
    let map: MapLibre;
    try {
      configureWorker();
      map = new MapLibre({
        container,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': start.palette.muted },
            },
          ],
        },
        bounds: [
          [start.initialBounds.west, start.initialBounds.south],
          [start.initialBounds.east, start.initialBounds.north],
        ],
        fitBoundsOptions: { padding: 24 },
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        fadeDuration: 150,
        locale: {
          'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to move the map',
        },
      });
    } catch (error) {
      failed(error);
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (prefersCoarsePointer()) map.cooperativeGestures.enable();

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true, timeout: 10_000 },
        fitBoundsOptions: { maxZoom: 14 },
      }),
      'top-right',
    );
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    let tileErrors = 0;
    map.on('error', (event) => {
      if ((event as { sourceId?: unknown }).sourceId !== BASEMAP) return;
      tileErrors += 1;
      if (tileErrors === 4) tilesFailing();
    });

    map.on('load', () => {
      applyBasemap(map, start.basemap, start.dark);
      const empty = toFeatures([]);
      map.addSource(SOURCE, {
        type: 'geojson',
        data: empty,
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: CLUSTER_PROPERTIES,
      });
      map.addSource(FLAT_SOURCE, { type: 'geojson', data: empty });
      map.addSource(FOCUS_SOURCE, { type: 'geojson', data: empty });

      const { colourBy: initialColour, palette: initialPalette } = look.current;
      const dotPaint: CircleLayerSpecification['paint'] = {
        'circle-radius': DOT_RADIUS,
        'circle-color': colourExpression(initialColour, initialPalette),
        'circle-stroke-color': initialPalette.card,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 12, 1.5],
      };

      map.addLayer({
        id: LAYERS.heat,
        type: 'heatmap',
        source: FLAT_SOURCE,
        maxzoom: 16,
        layout: { visibility: 'none' },
      });
      map.addLayer({
        id: LAYERS.flatPoints,
        type: 'circle',
        source: FLAT_SOURCE,
        layout: { visibility: 'none' },
        paint: dotPaint,
      });
      map.addLayer({
        id: LAYERS.points,
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: dotPaint,
      });
      map.addLayer({
        id: LAYERS.highlight,
        type: 'circle',
        source: FOCUS_SOURCE,
        filter: ['==', ['get', 'kind'], 'highlight'],
        paint: {
          'circle-radius': 11,
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': initialPalette.foreground,
          'circle-stroke-opacity': 0.55,
        },
      });
      map.addLayer({
        id: LAYERS.selectedHalo,
        type: 'circle',
        source: FOCUS_SOURCE,
        filter: ['==', ['get', 'kind'], 'selected'],
        paint: {
          'circle-radius': 14,
          'circle-color': initialPalette.foreground,
          'circle-opacity': 0.12,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': initialPalette.foreground,
        },
      });
      map.addLayer({
        id: LAYERS.selected,
        type: 'circle',
        source: FOCUS_SOURCE,
        filter: ['==', ['get', 'kind'], 'selected'],
        paint: {
          'circle-radius': 7,
          'circle-color': colourExpression(initialColour, initialPalette),
          'circle-stroke-color': initialPalette.card,
          'circle-stroke-width': 2,
        },
      });
      setReady(true);
      loaded();
      const bounds = map.getBounds();
      viewportChanged({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    });

    map.on('moveend', () => {
      const bounds = map.getBounds();
      viewportChanged({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    });

    // Hover: the hotspot's name and status, written as text (names are user input).
    const hover = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: 'hotspot-hover',
      maxWidth: '260px',
    });
    const showHover = (event: {
      features?: MapGeoJSONFeature[];
      lngLat: { lng: number; lat: number };
    }) => {
      const id: unknown = event.features?.[0]?.properties.id;
      const words = typeof id === 'string' ? label(id) : null;
      if (!words) return;
      map.getCanvas().style.cursor = 'pointer';
      const body = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'hotspot-hover__title';
      title.textContent = words.title;
      const detail = document.createElement('p');
      detail.className = 'hotspot-hover__detail';
      detail.textContent = words.detail;
      body.append(title, detail);
      hover.setLngLat(event.lngLat).setDOMContent(body).addTo(map);
    };
    const hideHover = () => {
      map.getCanvas().style.cursor = '';
      hover.remove();
    };
    for (const layer of POINT_LAYERS) {
      map.on('mousemove', layer, showHover);
      map.on('mouseleave', layer, hideHover);
      map.on('click', layer, (event) => {
        const id: unknown = event.features?.[0]?.properties.id;
        if (typeof id === 'string') select(id);
      });
    }
    map.on('click', (event) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.hotspot-cluster')) return;
      const visible = POINT_LAYERS.filter((layer) => map.getLayer(layer));
      if (map.queryRenderedFeatures(event.point, { layers: visible }).length === 0) select(null);
    });

    // Cluster rings follow the clustered source as it re-tiles on every frame.
    const state = clusters.current;
    const renderClusters = () => {
      if (!map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;
      const { view: currentView, colourBy: currentColour, palette: currentPalette } = look.current;
      const next = new Map<string, Marker>();
      if (currentView === 'clusters') {
        for (const feature of map.querySourceFeatures(SOURCE)) {
          const properties = feature.properties as Record<string, unknown>;
          const clusterId = properties.cluster_id;
          const total = properties.point_count;
          if (typeof clusterId !== 'number' || typeof total !== 'number') continue;
          const key = `${String(state.generation)}:${String(clusterId)}`;
          if (next.has(key)) continue;
          let marker = state.cache.get(key);
          if (!marker && feature.geometry.type === 'Point') {
            const [lng = 0, lat = 0] = feature.geometry.coordinates;
            const element = createClusterElement(
              total,
              sliceCounts(properties, currentColour, currentPalette),
              currentPalette,
            );
            element.addEventListener('click', (click) => {
              click.stopPropagation();
              const source = map.getSource<GeoJSONSource>(SOURCE);
              void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
                map.easeTo({ center: [lng, lat], zoom: Math.min(zoom, CLUSTER_MAX_ZOOM + 1) });
              });
            });
            marker = new Marker({ element }).setLngLat([lng, lat]);
            state.cache.set(key, marker);
          }
          if (!marker) continue;
          next.set(key, marker);
          if (!state.onScreen.has(key)) marker.addTo(map);
        }
      }
      for (const [key, marker] of state.onScreen) {
        if (!next.has(key)) marker.remove();
      }
      state.onScreen = next;
    };
    map.on('render', renderClusters);

    return () => {
      for (const marker of state.onScreen.values()) marker.remove();
      state.cache.clear();
      state.onScreen.clear();
      hover.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  /** Forgets every cluster ring, so the next frame draws them afresh. */
  const resetClusters = useEffectEvent(() => {
    const state = clusters.current;
    for (const marker of state.onScreen.values()) marker.remove();
    state.onScreen.clear();
    state.cache.clear();
    state.generation += 1;
    mapRef.current?.triggerRepaint();
  });

  // Only the source the current style draws from is fed; the other catches up
  // when the style changes. Each feed re-tiles in the worker.
  const fed = useRef<{ clustered: unknown; flat: unknown }>({ clustered: null, flat: null });
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sourceId = view === 'clusters' ? SOURCE : FLAT_SOURCE;
    const slot = view === 'clusters' ? 'clustered' : 'flat';
    if (fed.current[slot] === hotspots) return;
    fed.current[slot] = hotspots;
    void map.getSource<GeoJSONSource>(sourceId)?.setData(toFeatures(hotspots));
    if (view === 'clusters') resetClusters();
  }, [ready, hotspots, view]);

  useEffect(() => {
    const map = mapRef.current;
    look.current = { view, colourBy, palette };
    if (!ready || !map) return;
    const colour = colourExpression(colourBy, palette);
    for (const layer of [LAYERS.points, LAYERS.flatPoints, LAYERS.selected]) {
      map.setPaintProperty(layer, 'circle-color', colour);
    }
    for (const layer of [LAYERS.points, LAYERS.flatPoints, LAYERS.selected]) {
      map.setPaintProperty(layer, 'circle-stroke-color', palette.card);
    }
    map.setPaintProperty(LAYERS.highlight, 'circle-stroke-color', palette.foreground);
    map.setPaintProperty(LAYERS.selectedHalo, 'circle-color', palette.foreground);
    map.setPaintProperty(LAYERS.selectedHalo, 'circle-stroke-color', palette.foreground);
    map.setPaintProperty('background', 'background-color', palette.muted);
    map.setPaintProperty(LAYERS.heat, 'heatmap-color', [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0, 0, 0, 0)',
      0.12,
      withAlpha(palette.heat1, 0.35),
      0.35,
      withAlpha(palette.heat1, 0.75),
      0.6,
      palette.heat2,
      0.82,
      palette.heat3,
      1,
      palette.heat4,
    ]);
    map.setPaintProperty(LAYERS.heat, 'heatmap-radius', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      7,
      9,
      14,
      13,
      26,
    ]);
    map.setPaintProperty(LAYERS.heat, 'heatmap-intensity', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      0.7,
      13,
      2.2,
    ]);
    map.setPaintProperty(LAYERS.heat, 'heatmap-opacity', [
      'interpolate',
      ['linear'],
      ['zoom'],
      11,
      0.85,
      15,
      0.25,
    ]);

    map.setLayoutProperty(LAYERS.points, 'visibility', view === 'clusters' ? 'visible' : 'none');
    map.setLayoutProperty(LAYERS.heat, 'visibility', view === 'heatmap' ? 'visible' : 'none');
    map.setLayoutProperty(
      LAYERS.flatPoints,
      'visibility',
      view === 'clusters' ? 'none' : 'visible',
    );
    // On the heatmap, the dots fade in as the heat fades out.
    map.setPaintProperty(
      LAYERS.flatPoints,
      'circle-opacity',
      view === 'heatmap' ? ['interpolate', ['linear'], ['zoom'], 11, 0, 13.5, 1] : 1,
    );
    map.setPaintProperty(
      LAYERS.flatPoints,
      'circle-stroke-opacity',
      view === 'heatmap' ? ['interpolate', ['linear'], ['zoom'], 11, 0, 13.5, 1] : 1,
    );
    resetClusters();
  }, [ready, view, colourBy, palette]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyBasemap(map, basemap, dark);
  }, [ready, basemap, dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: Feature[] = [];
    const highlighted = highlightedId ? hotspots.find(({ id }) => id === highlightedId) : null;
    if (highlighted && highlighted.id !== selected?.id) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [highlighted.longitude, highlighted.latitude] },
        properties: { kind: 'highlight' },
      });
    }
    if (selected) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [selected.longitude, selected.latitude] },
        properties: { kind: 'selected', r: selected.review, d: selected.dispenser },
      });
    }
    void map
      .getSource<GeoJSONSource>(FOCUS_SOURCE)
      ?.setData({ type: 'FeatureCollection', features });
  }, [ready, selected, highlightedId, hotspots]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Hotspot map. Use the list beside it to browse hotspots by keyboard."
      className={cn('hotspot-map size-full', className)}
    />
  );
}
