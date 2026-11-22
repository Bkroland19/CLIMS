/** Every item of an offset-paged list, as far as the cap allowed. */
export interface AllPages<Item> {
  items: Item[];
  /** False when the cap was reached while pages were still full: there may be more. */
  complete: boolean;
}

interface PagingOptions {
  pageSize: number;
  /** The most pages read in all. */
  maxPages: number;
  /** Pages asked for at once. Defaults to 1. */
  pagesAtOnce?: number;
}

/**
 * Reads an offset-paged list that gives no total: pages are asked for a few
 * at a time until one comes back short, or `maxPages` have been read.
 *
 * Items are kept once each, by id and in the order first met: a record that
 * changes between two reads can move across a page boundary and be listed twice.
 */
export async function readAllPages<Item extends { id: string }>(
  readPage: (offset: number, limit: number) => Promise<Item[]>,
  { pageSize, maxPages, pagesAtOnce = 1 }: PagingOptions,
): Promise<AllPages<Item>> {
  const byId = new Map<string, Item>();
  for (let first = 0; first < maxPages; first += pagesAtOnce) {
    const pages = await Promise.all(
      Array.from({ length: Math.min(pagesAtOnce, maxPages - first) }, (_, index) =>
        readPage((first + index) * pageSize, pageSize),
      ),
    );
    for (const item of pages.flat()) byId.set(item.id, item);
    if (pages.some((page) => page.length < pageSize)) {
      return { items: [...byId.values()], complete: true };
    }
  }
  return { items: [...byId.values()], complete: false };
}
