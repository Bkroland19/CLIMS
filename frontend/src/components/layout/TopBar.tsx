import { PanelLeft } from 'lucide-react';
import Link from 'next/link';

import {
  type AppNotification,
  type NotificationActions,
  NotificationsBell,
} from '@/components/layout/NotificationsBell';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { HOME_PATH } from '@/navigation/paths';

interface TopBarProps {
  /** Passed to the bell; leave out while there is no notification feed. */
  notifications?: readonly AppNotification[];
  notificationActions?: NotificationActions;
}

/** The full-width bar above the sidebar and page: menu toggle, product, bell, theme and account. */
export function TopBar({ notifications, notificationActions }: TopBarProps) {
  const { isMobile, state, toggleSidebar } = useSidebar();
  const toggleLabel = isMobile
    ? 'Open menu'
    : state === 'collapsed'
      ? 'Expand sidebar'
      : 'Collapse sidebar';

  return (
    <header
      data-print-hide
      className="bg-card h-header sticky top-0 z-40 flex shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="text-muted-foreground hover:text-foreground"
      >
        <PanelLeft className="size-4.5" aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Link
          href={HOME_PATH}
          translate="no"
          className="focus-visible:ring-ring rounded-md text-[1.0625rem] font-bold tracking-tight outline-none focus-visible:ring-2"
        >
          CLIMS
        </Link>
        <span aria-hidden="true" className="bg-border h-5 w-px shrink-0" />
        <span className="text-muted-foreground truncate text-sm">Ministry of Health · Uganda</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <NotificationsBell notifications={notifications} actions={notificationActions} />
        <ThemeToggle />
      </div>
      <div className="flex min-w-0 shrink-0 items-center border-l pl-3">
        <UserMenu />
      </div>
    </header>
  );
}
