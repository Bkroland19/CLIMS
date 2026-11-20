import type { Metadata } from 'next';

import { findScreen } from './navigation';
import { workspaces } from './workspaces';

/**
 * The metadata for the screen at `path`, taken from the navigation table so a
 * page's tab title and its heading can never disagree. Throws at build time
 * for a path the table does not know, which is how a page added without a
 * navigation entry is caught. A detail page passes its folder path, e.g.
 * `/dcfp/orders/[id]`.
 */
export function pageMetadata(path: string): Metadata {
  const screen = findScreen(workspaces, path);
  if (!screen) throw new Error(`No navigation entry for "${path}". Add it to workspaces.ts.`);
  return { title: screen.title };
}
