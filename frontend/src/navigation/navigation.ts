import type { LucideIcon } from 'lucide-react';

import type { PageSkeletonLayout } from '@/components/states/PageSkeleton';

/** The shape a page's content takes, used to pick its loading skeleton. */
export type PageLayout = PageSkeletonLayout;

/**
 * How many things wait for the user on each page, keyed by page path. A
 * sidebar item shows the total for its pages; each tab shows its own.
 */
export type NavCounts = Readonly<Partial<Record<string, number>>>;

/** One screen with its own address. */
export interface NavPage {
  path: string;
  /** The page's tab label, shown when its sidebar item has more than one page. */
  tab: string;
  /** Full page title for the heading band and the browser tab. */
  title: string;
  /** One line on what the page is for, under the title. */
  description?: string;
  layout: PageLayout;
}

/**
 * A page about one record, reached from a list rather than the sidebar. Its
 * path names its variable segments the way the `src/app` folders do, e.g.
 * `/dcfp/orders/[id]`.
 */
export interface NavDetail {
  path: string;
  /** The last breadcrumb, and the page title. */
  label: string;
  layout: PageLayout;
}

/** A sidebar entry. Its pages are the tabs of one task; the first is where the entry goes. */
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  pages: readonly [NavPage, ...NavPage[]];
  details?: readonly NavDetail[];
}

/** A labelled run of sidebar entries. */
export interface NavSection {
  label: string;
  items: readonly NavItem[];
}

/** Everything one kind of organisation or role works in. */
export interface Workspace {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Every path in the workspace starts with this one. Its first page lives here. */
  basePath: string;
  sections: readonly NavSection[];
}

/** Where an address sits in the navigation. `page` and `detail` are both null for an unknown address. */
export interface NavLocation {
  workspace: Workspace;
  item: NavItem | null;
  page: NavPage | null;
  detail: NavDetail | null;
}

function normalise(pathname: string): string {
  const [path = '/'] = pathname.split(/[?#]/);
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * The values of `pattern`'s `[name]` segments in `pathname`, decoded, or null
 * when the address does not fit the pattern. A `[name]` segment matches any
 * one non-empty segment.
 */
export function matchParams(pattern: string, pathname: string): Record<string, string> | null {
  const wanted = pattern.split('/');
  const actual = normalise(pathname).split('/');
  if (wanted.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of wanted.entries()) {
    const value = actual[index] ?? '';
    const name = /^\[([^\]/]+)\]$/.exec(segment)?.[1];
    if (name === undefined) {
      if (segment !== value) return null;
    } else {
      if (value === '') return null;
      params[name] = safeDecode(value);
    }
  }
  return params;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Whether `pathname` fits `pattern`, where a `[name]` segment matches any one segment. */
export function matchesPath(pattern: string, pathname: string): boolean {
  return matchParams(pattern, pathname) !== null;
}

/**
 * The route parameters of `pathname`: from the first of `patterns` it fits,
 * preferring a pattern with no variable segments, as the router does.
 */
export function routeParams(patterns: readonly string[], pathname: string): Record<string, string> {
  const ordered = [...patterns].sort((a, b) => Number(a.includes('[')) - Number(b.includes('[')));
  for (const pattern of ordered) {
    const params = matchParams(pattern, pathname);
    if (params) return params;
  }
  return {};
}

/** The total waiting across an item's pages. */
export function countOf(item: NavItem, counts: NavCounts | undefined): number {
  return item.pages.reduce((total, page) => total + (counts?.[page.path] ?? 0), 0);
}

/** Every item in a workspace, in sidebar order. */
export function itemsOf(workspace: Workspace): NavItem[] {
  return workspace.sections.flatMap((section) => section.items);
}

/** Every page and detail path in the table, as the `src/app` folders would write them. */
export function allPaths(workspaces: readonly Workspace[]): string[] {
  return workspaces.flatMap((workspace) =>
    itemsOf(workspace).flatMap((item) => [
      ...item.pages.map((page) => page.path),
      ...(item.details ?? []).map((detail) => detail.path),
    ]),
  );
}

/**
 * The workspace an address belongs to: the one with the longest base path
 * that starts it. An address outside every workspace (a mistyped one, say)
 * falls back to the first, so the shell always has a sidebar to show.
 */
export function workspaceFor(workspaces: readonly Workspace[], pathname: string): Workspace {
  const path = normalise(pathname);
  let best: Workspace | undefined;
  for (const workspace of workspaces) {
    const base = workspace.basePath;
    const contains = path === base || path.startsWith(base === '/' ? '/' : `${base}/`);
    if (contains && (!best || base.length > best.basePath.length)) best = workspace;
  }
  const fallback = best ?? workspaces[0];
  if (!fallback) throw new Error('The navigation table has no workspaces.');
  return fallback;
}

/** Where `pathname` sits: its workspace, sidebar item, and page or detail. */
export function locate(workspaces: readonly Workspace[], pathname: string): NavLocation {
  const path = normalise(pathname);
  for (const workspace of workspaces) {
    for (const item of itemsOf(workspace)) {
      const page = item.pages.find((candidate) => candidate.path === path);
      if (page) return { workspace, item, page, detail: null };
      const detail = item.details?.find((candidate) => matchesPath(candidate.path, path));
      if (detail) return { workspace, item, page: null, detail };
    }
  }
  return { workspace: workspaceFor(workspaces, path), item: null, page: null, detail: null };
}

/** The title and layout of the page or detail at `pathname`, or null when there is none. */
export function findScreen(
  workspaces: readonly Workspace[],
  pathname: string,
): { title: string; layout: PageLayout } | null {
  const { page, detail } = locate(workspaces, pathname);
  if (page) return { title: page.title, layout: page.layout };
  if (detail) return { title: detail.label, layout: detail.layout };
  return null;
}
