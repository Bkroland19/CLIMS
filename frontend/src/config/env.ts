/** Build-time configuration, validated once so a bad value fails at startup instead of mid-session. */
export interface AppConfig {
  /** Absolute `https://…` URL or a same-origin path such as `/api/v1`. Never ends in a slash. */
  readonly apiBaseUrl: string;
  /** The hotspot map's base layers, or `off` to draw hotspots on a plain background. */
  readonly mapTiles: MapTiles;
}

/** A raster base layer: OpenStreetMap tiles, or a deployment's own tile server. */
export interface Basemap {
  readonly id: string;
  readonly label: string;
  /** `{z}/{x}/{y}` URL templates; several spread requests over a server's hostnames. */
  readonly tiles: readonly string[];
  /** HTML, shown in the map's corner as the tile licence requires. */
  readonly attribution: string;
  readonly maxZoom: number;
}

export type MapTiles =
  { readonly kind: 'off' } | { readonly kind: 'basemaps'; readonly basemaps: readonly Basemap[] };

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * The OpenStreetMap community's own tile servers. Their usage policies allow an
 * app like this one at light use with attribution; a busy deployment should run
 * or buy a tile server and set NEXT_PUBLIC_MAP_TILES to it.
 */
export const OSM_BASEMAPS: readonly Basemap[] = [
  {
    id: 'streets',
    label: 'Streets',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
  },
  {
    id: 'humanitarian',
    label: 'Humanitarian',
    tiles: ['a', 'b', 'c'].map(
      (host) => `https://${host}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`,
    ),
    attribution: `${OSM_ATTRIBUTION}, style by <a href="https://www.hotosm.org/" target="_blank" rel="noreferrer">Humanitarian OpenStreetMap Team</a>, hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noreferrer">OpenStreetMap France</a>`,
    maxZoom: 19,
  },
];

/** Thrown for configuration a deploy must fix; the message names the variable. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Every route of the Go API lives under /api/v1.
const DEFAULT_API_BASE_URL = '/api/v1';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseApiBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_API_BASE_URL;

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value.replace(/\/+$/, '') || '/';
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(
      `NEXT_PUBLIC_API_BASE_URL must be an absolute URL or a path starting with "/", got "${value}".`,
    );
  }

  // The session token travels in a header on every call; plain HTTP would put
  // it on the wire in the clear. Loopback is exempt so local stacks still work.
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new ConfigError(
      `NEXT_PUBLIC_API_BASE_URL must use https (http is allowed for localhost only), got "${value}".`,
    );
  }

  return value.replace(/\/+$/, '');
}

/** Turns raw `NEXT_PUBLIC_*` values into a validated {@link AppConfig}. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${String(character.charCodeAt(0))};`);
}

/**
 * NEXT_PUBLIC_MAP_TILES: empty for the OpenStreetMap layers, `off` for none
 * (tests, offline demos), or one `https://…/{z}/{x}/{y}.png` template for a
 * deployment's own tile server, credited with NEXT_PUBLIC_MAP_ATTRIBUTION.
 */
export function parseMapTiles(raw: string | undefined, attribution?: string): MapTiles {
  const value = raw?.trim() ?? '';
  if (value === '') return { kind: 'basemaps', basemaps: OSM_BASEMAPS };
  if (value.toLowerCase() === 'off') return { kind: 'off' };

  let url: URL;
  try {
    url = new URL(value.replace(/\{[xyz]\}/g, '0'));
  } catch {
    throw new ConfigError(
      `NEXT_PUBLIC_MAP_TILES must be "off" or a tile URL such as https://tiles.example.org/{z}/{x}/{y}.png, got "${value}".`,
    );
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname);
  if (
    !['{z}', '{x}', '{y}'].every((part) => value.includes(part)) ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback))
  ) {
    throw new ConfigError(
      `NEXT_PUBLIC_MAP_TILES must be an https URL containing {z}, {x} and {y}, got "${value}".`,
    );
  }
  const credit = attribution?.trim();
  return {
    kind: 'basemaps',
    basemaps: [
      {
        id: 'custom',
        label: 'Streets',
        tiles: [value],
        attribution: credit ? escapeHtml(credit) : OSM_ATTRIBUTION,
        maxZoom: 19,
      },
    ],
  };
}

/** The origins the map loads tiles from, for the Content-Security-Policy. */
export function tileOrigins(tiles: MapTiles): string[] {
  if (tiles.kind === 'off') return [];
  const origins = tiles.basemaps.flatMap((basemap) =>
    basemap.tiles.map((template) => new URL(template.replace(/\{[xyz]\}/g, '0')).origin),
  );
  return [...new Set(origins)];
}

/** Turns raw `NEXT_PUBLIC_*` values into a validated {@link AppConfig}. */
export function parseConfig(env: {
  NEXT_PUBLIC_API_BASE_URL?: string;
  NEXT_PUBLIC_MAP_TILES?: string;
  NEXT_PUBLIC_MAP_ATTRIBUTION?: string;
}): AppConfig {
  return {
    apiBaseUrl: parseApiBaseUrl(env.NEXT_PUBLIC_API_BASE_URL),
    mapTiles: parseMapTiles(env.NEXT_PUBLIC_MAP_TILES, env.NEXT_PUBLIC_MAP_ATTRIBUTION),
  };
}
