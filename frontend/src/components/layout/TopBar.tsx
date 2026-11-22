import { PanelLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import mohSeal from '@/assets/moh-seal.png';
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
        <PanelLeft className="size-4" aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Link
          href={HOME_PATH}
          translate="no"
          className="focus-visible:ring-ring flex shrink-0 items-center gap-2 rounded-md text-base font-bold tracking-tight outline-none focus-visible:ring-2"
        >
          {/* Decorative: the ministry is named in words beside it. */}
          <Image
            src={mohSeal}
            alt=""
            width={28}
            height={28}
            loading="eager"
            className="size-7 shrink-0"
          />
          CLIMS
        </Link>
        {/* On a phone the seal stands for the ministry; the name stays for screen readers. */}
        <span aria-hidden="true" className="bg-border h-4 w-px shrink-0 max-sm:hidden" />
        <span className="text-muted-foreground truncate text-sm max-sm:sr-only">
          Ministry of Health · Uganda
        </span>
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
