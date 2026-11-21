import Link from 'next/link';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import type { NavCounts, NavItem, NavLocation } from '@/navigation/navigation';

/** The title when the address matches no page. */
const NOT_FOUND_TITLE = 'Page not found';
/** Read after a tab badge's number by screen readers. */
const COUNT_SUFFIX = 'need attention';

interface PageTabsProps {
  item: NavItem;
  currentPath: string | undefined;
  counts: NavCounts | undefined;
}

/**
 * The pages of one sidebar item, as links. Each tab is its own address, so a
 * tab can be bookmarked, shared and reached with the back button; this is
 * navigation, not an in-page tab panel.
 */
function PageTabs({ item, currentPath, counts }: PageTabsProps) {
  return (
    <nav
      aria-label={`${item.label} pages`}
      className="-mb-px flex [scrollbar-width:none] gap-7 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      {item.pages.map((page) => {
        const isCurrent = page.path === currentPath;
        const count = counts?.[page.path] ?? 0;
        return (
          <Link
            key={page.path}
            href={page.path}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-ring flex h-9 shrink-0 items-center gap-2 rounded-t-md border-b-2 px-0.5 text-sm outline-none focus-visible:ring-2',
              isCurrent
                ? 'border-foreground text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground border-transparent font-medium',
            )}
          >
            {page.tab}
            {count > 0 ? (
              <>
                <span
                  aria-hidden="true"
                  className="bg-foreground text-background flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.25 text-[0.65625rem] font-semibold"
                >
                  {count}
                </span>
                <span className="sr-only">{`, ${count} ${COUNT_SUFFIX}`}</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

interface PageHeadingProps {
  /** Where the current address sits in the navigation. */
  location: NavLocation;
  /** Tab badge counts by page path. */
  counts?: NavCounts;
  /** The title when the address has no page or record, instead of "Page not found". */
  fallbackTitle?: string;
}

/**
 * The band under the top bar: breadcrumb (workspace / section / record), the
 * page title, one line on what the page is for, and the section's tabs.
 * Everything comes from the navigation table.
 */
export function PageHeading({ location, counts, fallbackTitle }: PageHeadingProps) {
  const { workspace, item, page, detail } = location;
  const title = page?.title ?? detail?.label ?? fallbackTitle ?? NOT_FOUND_TITLE;
  const tabbedItem = page && item && item.pages.length > 1 ? item : null;
  const sectionHref = item?.pages[0].path;
  const isOnSectionHome = page !== null && page.path === sectionHref;

  return (
    <div className="bg-card border-b">
      <div className={cn('mx-auto max-w-360 px-4 pt-3 md:px-5', tabbedItem ? 'pb-0' : 'pb-3.5')}>
        <Breadcrumb aria-label="Breadcrumb">
          <BreadcrumbList className="flex-nowrap gap-1.5 overflow-hidden text-[0.8125rem] whitespace-nowrap">
            <BreadcrumbItem className="shrink-0">{workspace.label}</BreadcrumbItem>
            {item && sectionHref ? (
              <>
                <BreadcrumbSeparator className="text-border">/</BreadcrumbSeparator>
                <BreadcrumbItem className="min-w-0">
                  {isOnSectionHome ? (
                    <BreadcrumbPage className="truncate font-semibold">{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="truncate font-semibold">
                      <Link href={sectionHref}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </>
            ) : null}
            {detail ? (
              <>
                <BreadcrumbSeparator className="text-border">/</BreadcrumbSeparator>
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate font-semibold">{detail.label}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {page?.description ? (
          <p className="text-muted-foreground mt-1 max-w-190 text-sm text-pretty">
            {page.description}
          </p>
        ) : null}
        {tabbedItem ? (
          <div className="mt-2">
            <PageTabs item={tabbedItem} currentPath={page?.path} counts={counts} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
