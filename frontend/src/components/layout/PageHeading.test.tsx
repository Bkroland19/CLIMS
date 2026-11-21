import { render, screen, within } from '@testing-library/react';
import { Inbox, LayoutDashboard } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { locate, type NavItem, type Workspace } from '@/navigation/navigation';

import { AppSidebar } from './AppSidebar';
import { PageHeading } from './PageHeading';

const orders: NavItem = {
  id: 'orders',
  label: 'Orders',
  icon: Inbox,
  pages: [
    {
      path: '/dcfp/orders',
      tab: 'Queue',
      title: 'Orders',
      description: 'Stockout notifications from hotspots.',
      layout: 'table',
    },
    { path: '/dcfp/orders/held', tab: 'Held for stock', title: 'Orders', layout: 'table' },
  ],
  details: [{ path: '/dcfp/orders/[id]', label: 'Review order', layout: 'detail' }],
};

const table: readonly Workspace[] = [
  {
    id: 'dcfp',
    label: 'District focal person',
    icon: Inbox,
    basePath: '/dcfp',
    sections: [
      {
        label: 'Overview',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            pages: [
              { path: '/dcfp', tab: 'Dashboard', title: 'District dashboard', layout: 'dashboard' },
            ],
          },
        ],
      },
      { label: 'Fulfilment', items: [orders] },
    ],
  },
];

const breadcrumb = () => screen.queryByRole('navigation', { name: /breadcrumb/i });

describe('PageHeading', () => {
  it('shows the title, description and tabs of a section page, with no breadcrumb', () => {
    render(<PageHeading location={locate(table, '/dcfp/orders')} />);

    expect(breadcrumb()).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Back to/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByText('Stockout notifications from hotspots.')).toBeInTheDocument();

    const tabs = screen.getByRole('navigation', { name: 'Orders pages' });
    expect(within(tabs).getByRole('link', { name: 'Queue' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Held for stock' })).toHaveAttribute(
      'href',
      '/dcfp/orders/held',
    );
  });

  it('puts a count on a tab, read out with its meaning', () => {
    render(
      <PageHeading location={locate(table, '/dcfp/orders')} counts={{ '/dcfp/orders/held': 4 }} />,
    );

    const tabs = screen.getByRole('navigation', { name: 'Orders pages' });
    expect(
      within(tabs).getByRole('link', { name: 'Held for stock, 4 need attention' }),
    ).toBeInTheDocument();
    expect(within(tabs).getByRole('link', { name: 'Queue' })).toBeInTheDocument();
  });

  it('names the record on a detail page, links back to its section and shows no tabs', () => {
    render(<PageHeading location={locate(table, '/dcfp/orders/ORD-1042')} />);

    expect(breadcrumb()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Orders' })).toHaveAttribute(
      'href',
      '/dcfp/orders',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Review order' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Orders pages' })).not.toBeInTheDocument();
  });

  it('titles an unknown address "Page not found"', () => {
    render(<PageHeading location={locate(table, '/dcfp/nothing')} />);

    expect(breadcrumb()).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Back to/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('AppSidebar', () => {
  const renderSidebar = (pathname: string, counts?: Record<string, number>) =>
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar workspaces={table} location={locate(table, pathname)} counts={counts} />
        </SidebarProvider>
      </TooltipProvider>,
    );

  it('labels each section and marks the current item', () => {
    renderSidebar('/dcfp/orders/held');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const fulfilment = within(nav).getByRole('group', { name: 'Fulfilment' });
    expect(within(fulfilment).getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it("badges an item with the total of its pages' counts", () => {
    renderSidebar('/dcfp', { '/dcfp/orders': 3, '/dcfp/orders/held': 2 });

    expect(screen.getByRole('link', { name: 'Orders, 5 need attention' })).toHaveAttribute(
      'href',
      '/dcfp/orders',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('marks the current item on a detail page', () => {
    renderSidebar('/dcfp/orders/ORD-1');
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'true');
  });

  it('shows the workspace at its foot', () => {
    renderSidebar('/dcfp');
    expect(
      screen.getByRole('button', { name: /Workspace\s*District focal person/ }),
    ).toBeInTheDocument();
  });
});
