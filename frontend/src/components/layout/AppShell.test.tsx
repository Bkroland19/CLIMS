import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '@/lib/storage/jsonStorage';
import { workspaces } from '@/navigation/workspaces';
import { renderApp } from '@/test/renderApp';

import { AppShell } from './AppShell';

/** A page whose link to the order queue disappears once it has been followed. */
function Page() {
  const pathname = usePathname();
  return pathname === '/dcfp' ? <Link href="/dcfp/orders">Open the order queue</Link> : null;
}

function renderShell() {
  return renderApp(
    <AppShell workspaces={workspaces} storage={createMemoryStorage({})}>
      <Page />
    </AppShell>,
    { route: '/dcfp', signedIn: true },
  );
}

describe('AppShell', () => {
  it('offers a skip link to the main region as the first thing to tab to', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('starts the next page at its main region when the followed link goes away', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: 'Open the order queue' }));

    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus();
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Orders');
  });

  it('leaves focus on a sidebar link that stays on screen', async () => {
    const user = userEvent.setup();
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const [, second] = Array.from(nav.querySelectorAll('a'));
    if (!second) throw new Error('The DCFP workspace has more than one sidebar item.');

    await user.click(second);

    await waitFor(() => {
      expect(second).toHaveAttribute('aria-current');
    });
    expect(second).toHaveFocus();
  });
});
