import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

import { allPaths, routeParams } from '@/navigation/navigation';
import { workspaces } from '@/navigation/workspaces';

import { appRouter, TestLink, testRouter } from './navigation';

// A route change is a redirect effect plus a render of a whole screen. The 1s
// default is too tight for that on a loaded CI runner.
configure({ asyncUtilTimeout: 5000 });

/*
 * Next.js supplies its router from the framework, which is not running here.
 * These stand-ins keep the same hooks and the same <Link>, backed by an
 * in-memory address (see ./navigation).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => appRouter,
  usePathname: () => useSyncExternalStore(testRouter.subscribe, () => testRouter.pathname),
  useSearchParams: () => {
    const search = useSyncExternalStore(testRouter.subscribe, () => testRouter.search);
    return new URLSearchParams(search);
  },
  // The params of the route the address resolves to, e.g. `{ id: 'ORD-1' }` at `/dcfp/orders/ORD-1`.
  useParams: () => {
    const pathname = useSyncExternalStore(testRouter.subscribe, () => testRouter.pathname);
    return routeParams(allPaths(workspaces), pathname);
  },
  redirect: (href: string) => {
    throw new Error(`redirect("${href}") runs on the server and cannot be rendered in a test.`);
  },
  notFound: () => {
    throw new Error('notFound() runs on the server and cannot be rendered in a test.');
  },
}));

vi.mock('next/link', () => ({ default: TestLink }));

/*
 * Next.js keeps `useSearchParams` and `usePathname` in step with the History API,
 * so a page may write its address with `history.replaceState` (no server round
 * trip). The test router follows those calls the same way.
 */
for (const method of ['pushState', 'replaceState'] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (data: unknown, unused: string, href?: string | URL | null) => {
    original(data, unused, href);
    if (href !== undefined && href !== null) testRouter.replace(String(href));
  };
}

beforeEach(() => {
  testRouter.reset();
});

afterEach(() => {
  cleanup();
});

/*
 * jsdom has no layout engine. These are the browser APIs the UI kit probes for
 * on mount; each stand-in does nothing, which is what "no layout" means.
 */
const noop = (): void => undefined;

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  },
});

Object.assign(Element.prototype, {
  scrollIntoView: noop,
  hasPointerCapture: () => false,
  releasePointerCapture: noop,
});
