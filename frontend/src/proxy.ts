import { NextResponse, type NextRequest } from 'next/server';

import { parseMapTiles, tileOrigins } from '@/config/env';

/** Where the hotspot map's base layer comes from (see `parseMapTiles`). A bad value adds nothing. */
function mapTileOrigins(): string {
  try {
    return tileOrigins(
      parseMapTiles(process.env.NEXT_PUBLIC_MAP_TILES, process.env.NEXT_PUBLIC_MAP_ATTRIBUTION),
    )
      .map((origin) => ` ${origin}`)
      .join('');
  } catch {
    return '';
  }
}

/*
 * Sets the Content-Security-Policy: what a page may load and where it may send data.
 *
 *   script-src   the app's own scripts, the inline scripts Next.js writes
 *                (allowed by a nonce that is new for every request, so markup
 *                injected into a page cannot run code). `unsafe-eval` in
 *                development only, where React uses it for debugging.
 *   style-src    'unsafe-inline' is needed: the UI kit positions popovers and
 *                the charts size themselves with inline style attributes.
 *   connect-src  'self' covers the API when it is served under /api on this
 *                origin. If NEXT_PUBLIC_API_BASE_URL points at another origin,
 *                add that origin here or every API call will be blocked.
 *   img-src and connect-src also name the hotspot map's tile servers: the map
 *                fetches its OpenStreetMap tiles as images. Its drawing worker
 *                is a file of this app's own ('self'), or a blob: it makes.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDevelopment = process.env.NODE_ENV === 'development';
  const tiles = mapTileOrigins();

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob:${tiles}`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self'${tiles}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  // Next.js reads the nonce from the request's policy and puts it on the scripts it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, docs and health paths that belong to the
      // backend, and not static files, which carry no markup to protect.
      source: '/((?!api|docs|health|_next/static|_next/image|favicon.ico).*)',
      // A prefetch is not shown to anyone, so it needs no policy of its own.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
