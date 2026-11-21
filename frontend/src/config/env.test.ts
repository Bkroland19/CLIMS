import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig, parseMapTiles, tileOrigins } from './env';

describe('parseConfig', () => {
  it.each([
    { name: 'defaults to the same-origin proxy path', input: undefined, expected: '/api/v1' },
    { name: 'treats blank as unset', input: '   ', expected: '/api/v1' },
    { name: 'keeps a relative path', input: '/backend/api', expected: '/backend/api' },
    { name: 'strips trailing slashes from a path', input: '/api///', expected: '/api' },
    { name: 'keeps a bare root path', input: '/', expected: '/' },
    {
      name: 'accepts https',
      input: 'https://api.example.org/v1/',
      expected: 'https://api.example.org/v1',
    },
    {
      name: 'accepts http on localhost',
      input: 'http://localhost:8080',
      expected: 'http://localhost:8080',
    },
    {
      name: 'accepts http on the IPv4 loopback',
      input: 'http://127.0.0.1:8080/api',
      expected: 'http://127.0.0.1:8080/api',
    },
  ])('$name', ({ input, expected }) => {
    expect(parseConfig({ NEXT_PUBLIC_API_BASE_URL: input }).apiBaseUrl).toBe(expected);
  });

  it.each([
    { name: 'plain http to a remote host', input: 'http://api.example.org' },
    { name: 'a non-http scheme', input: 'ftp://api.example.org' },
    { name: 'a protocol-relative URL', input: '//api.example.org' },
    { name: 'a bare hostname', input: 'api.example.org' },
    { name: 'a javascript URL', input: 'javascript:alert(1)' },
  ])('rejects $name', ({ input }) => {
    expect(() => parseConfig({ NEXT_PUBLIC_API_BASE_URL: input })).toThrow(ConfigError);
  });

  it('names the variable in the error so a deploy log is actionable', () => {
    expect(() => parseConfig({ NEXT_PUBLIC_API_BASE_URL: 'nope' })).toThrow(
      /NEXT_PUBLIC_API_BASE_URL/,
    );
  });

  it('uses the OpenStreetMap layers unless told otherwise', () => {
    const { mapTiles } = parseConfig({});
    expect(mapTiles.kind).toBe('basemaps');
    expect(mapTiles.kind === 'basemaps' && mapTiles.basemaps.map(({ id }) => id)).toEqual([
      'streets',
      'humanitarian',
    ]);
    expect(tileOrigins(mapTiles)).toEqual([
      'https://tile.openstreetmap.org',
      'https://a.tile.openstreetmap.fr',
      'https://b.tile.openstreetmap.fr',
      'https://c.tile.openstreetmap.fr',
    ]);
  });

  it('turns the base map off, or points it at a tile server of its own', () => {
    expect(parseConfig({ NEXT_PUBLIC_MAP_TILES: ' off ' }).mapTiles).toEqual({ kind: 'off' });
    const own = parseMapTiles('https://tiles.example.org/{z}/{x}/{y}.png', 'Ministry <tiles>');
    expect(own).toEqual({
      kind: 'basemaps',
      basemaps: [
        expect.objectContaining({
          tiles: ['https://tiles.example.org/{z}/{x}/{y}.png'],
          attribution: 'Ministry &#60;tiles&#62;',
        }),
      ],
    });
    expect(tileOrigins(own)).toEqual(['https://tiles.example.org']);
  });

  it.each([
    'tiles.example.org/{z}/{x}/{y}.png',
    'http://tiles.example.org/{z}/{x}/{y}.png',
    'https://tiles.example.org/{z}/{x}.png',
  ])('refuses the tile setting %s, naming the variable', (value) => {
    expect(() => parseMapTiles(value)).toThrow(/NEXT_PUBLIC_MAP_TILES/);
  });
});
