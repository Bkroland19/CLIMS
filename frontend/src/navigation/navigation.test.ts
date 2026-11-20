import { Inbox, Landmark, LayoutDashboard } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  allPaths,
  countOf,
  findScreen,
  locate,
  matchesPath,
  matchParams,
  type NavItem,
  routeParams,
  workspaceFor,
  type Workspace,
} from './navigation';

const orders: NavItem = {
  id: 'orders',
  label: 'Orders',
  icon: Inbox,
  pages: [
    { path: '/dcfp/orders', tab: 'Queue', title: 'Orders', layout: 'table' },
    { path: '/dcfp/orders/held', tab: 'Held for stock', title: 'Orders', layout: 'table' },
  ],
  details: [{ path: '/dcfp/orders/[id]', label: 'Review order', layout: 'detail' }],
};

const table: readonly Workspace[] = [
  {
    id: 'moh',
    label: 'Ministry of Health',
    icon: Landmark,
    basePath: '/moh',
    sections: [
      {
        label: 'Overview',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            pages: [
              { path: '/moh', tab: 'Dashboard', title: 'MOH dashboard', layout: 'dashboard' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'dcfp',
    label: 'District focal person',
    icon: Landmark,
    basePath: '/dcfp',
    sections: [{ label: 'Fulfilment', items: [orders] }],
  },
];

describe('matchesPath', () => {
  it.each([
    ['/dcfp/orders', '/dcfp/orders', true],
    ['/dcfp/orders', '/dcfp/orders/', true],
    ['/dcfp/orders', '/dcfp/orders?page=2', true],
    ['/dcfp/orders/[id]', '/dcfp/orders/ORD-1042', true],
    ['/dcfp/orders/[id]', '/dcfp/orders', false],
    ['/dcfp/orders/[id]', '/dcfp/orders/ORD-1042/edit', false],
    ['/dcfp/orders/[id]', '/dcfp/stock/ORD-1042', false],
  ])('matches %s against %s: %s', (pattern, pathname, expected) => {
    expect(matchesPath(pattern, pathname)).toBe(expected);
  });
});

describe('workspaceFor', () => {
  it('picks the workspace whose base path starts the address', () => {
    expect(workspaceFor(table, '/dcfp/orders/ORD-1').id).toBe('dcfp');
    expect(workspaceFor(table, '/moh').id).toBe('moh');
  });

  it('does not mistake a shared prefix for a parent path', () => {
    expect(workspaceFor(table, '/dcfpx').id).toBe('moh');
  });

  it('falls back to the first workspace for an address outside all of them', () => {
    expect(workspaceFor(table, '/no/such/page').id).toBe('moh');
  });
});

describe('locate', () => {
  it('finds a page, its item and workspace', () => {
    const where = locate(table, '/dcfp/orders/held');
    expect(where.workspace.id).toBe('dcfp');
    expect(where.item).toBe(orders);
    expect(where.page?.tab).toBe('Held for stock');
    expect(where.detail).toBeNull();
  });

  it('prefers an exact page over a detail pattern that would also match', () => {
    expect(locate(table, '/dcfp/orders/held').detail).toBeNull();
  });

  it('finds a detail page by its pattern', () => {
    const where = locate(table, '/dcfp/orders/ORD-1042');
    expect(where.item).toBe(orders);
    expect(where.page).toBeNull();
    expect(where.detail?.label).toBe('Review order');
  });

  it('keeps the workspace for an unknown address inside it', () => {
    const where = locate(table, '/dcfp/nothing/here');
    expect(where.workspace.id).toBe('dcfp');
    expect(where.item).toBeNull();
  });
});

describe('findScreen', () => {
  it('gives a page its title and layout', () => {
    expect(findScreen(table, '/moh')).toEqual({ title: 'MOH dashboard', layout: 'dashboard' });
  });

  it('gives a detail page its label as its title, from the folder path or a real one', () => {
    const expected = { title: 'Review order', layout: 'detail' };
    expect(findScreen(table, '/dcfp/orders/[id]')).toEqual(expected);
    expect(findScreen(table, '/dcfp/orders/ORD-7')).toEqual(expected);
  });

  it('returns null for an address with no screen', () => {
    expect(findScreen(table, '/moh/nothing')).toBeNull();
  });
});

describe('allPaths', () => {
  it('lists pages and detail patterns', () => {
    expect(allPaths(table)).toEqual([
      '/moh',
      '/dcfp/orders',
      '/dcfp/orders/held',
      '/dcfp/orders/[id]',
    ]);
  });
});

describe('countOf', () => {
  it("adds up the counts of an item's pages", () => {
    expect(countOf(orders, { '/dcfp/orders': 3, '/dcfp/orders/held': 2, '/moh': 9 })).toBe(5);
  });

  it('is zero with no counts', () => {
    expect(countOf(orders, undefined)).toBe(0);
    expect(countOf(orders, {})).toBe(0);
  });
});

describe('matchParams', () => {
  it('reads the variable segments, decoded', () => {
    expect(matchParams('/dcfp/orders/[id]', '/dcfp/orders/ORD%200141')).toEqual({
      id: 'ORD 0141',
    });
    expect(matchParams('/a/[x]/b/[y]', '/a/1/b/2/')).toEqual({ x: '1', y: '2' });
  });

  it('gives no params for a pattern without variables that fits', () => {
    expect(matchParams('/dcfp/orders', '/dcfp/orders?status=queued')).toEqual({});
  });

  it.each([
    ['/dcfp/orders/[id]', '/dcfp/orders'],
    ['/dcfp/orders/[id]', '/dcfp/orders/ORD-1/extra'],
    ['/dcfp/orders/[id]', '/dcfp/requests/WR-1'],
    ['/dcfp/orders/[id]', '/dcfp/orders//'],
  ])('refuses %s for %s', (pattern, pathname) => {
    expect(matchParams(pattern, pathname)).toBeNull();
  });

  it('keeps a segment that is not valid percent-encoding as written', () => {
    expect(matchParams('/x/[id]', '/x/50%')).toEqual({ id: '50%' });
  });
});

describe('routeParams', () => {
  const patterns = ['/dcfp/restock/[id]', '/dcfp/restock/new', '/dcfp/orders/[id]'];

  it('prefers a fixed path over a variable one, as the router does', () => {
    expect(routeParams(patterns, '/dcfp/restock/new')).toEqual({});
  });

  it('reads the params of the first pattern that fits', () => {
    expect(routeParams(patterns, '/dcfp/restock/WR-2026-0032')).toEqual({ id: 'WR-2026-0032' });
    expect(routeParams(patterns, '/dcfp/orders/ORD-0141')).toEqual({ id: 'ORD-0141' });
  });

  it('gives empty params for an address nothing fits', () => {
    expect(routeParams(patterns, '/moh/users')).toEqual({});
  });
});
