import { describe, expect, it, vi } from 'vitest';

import { readAllPages } from './pages';

const items = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `i-${String(from + index)}` }));

describe('readAllPages', () => {
  it('reads until a page comes back short', async () => {
    const readPage = vi.fn((offset: number, _limit: number) =>
      Promise.resolve(offset < 20 ? items(offset, 10) : items(offset, 4)),
    );

    const result = await readAllPages(readPage, { pageSize: 10, maxPages: 10 });

    expect(readPage.mock.calls.map(([offset, limit]) => [offset, limit])).toEqual([
      [0, 10],
      [10, 10],
      [20, 10],
    ]);
    expect(result.items).toHaveLength(24);
    expect(result.complete).toBe(true);
  });

  it('asks for several pages at once and stops after the batch with a short page', async () => {
    const readPage = vi.fn((offset: number, _limit: number) =>
      Promise.resolve(offset === 0 ? items(0, 10) : items(offset, 2)),
    );

    const result = await readAllPages(readPage, { pageSize: 10, maxPages: 10, pagesAtOnce: 3 });

    expect(readPage).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ complete: true });
    expect(result.items).toHaveLength(14);
  });

  it('says the list may go on when the cap is reached with full pages', async () => {
    const readPage = vi.fn((offset: number, _limit: number) => Promise.resolve(items(offset, 5)));

    const result = await readAllPages(readPage, { pageSize: 5, maxPages: 2 });

    expect(readPage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ complete: false });
    expect(result.items).toHaveLength(10);
  });

  it('keeps an item met twice once, where it was first met', async () => {
    const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]];
    const readPage = vi.fn((offset: number, _limit: number) =>
      Promise.resolve(pages[offset / 2] ?? []),
    );

    const result = await readAllPages(readPage, { pageSize: 2, maxPages: 5 });

    expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
