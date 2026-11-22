import { Check, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  countOf,
  type NavCounts,
  type NavItem,
  type NavLocation,
  type NavSection,
  type Workspace,
} from '@/navigation/navigation';

/** Read after a badge's number by screen readers, which cannot see the pill. */
const COUNT_SUFFIX = 'need attention';

interface NavEntryProps {
  item: NavItem;
  location: NavLocation;
  counts: NavCounts | undefined;
}

function NavEntry({ item, location, counts }: NavEntryProps) {
  const { setOpenMobile } = useSidebar();
  const href = item.pages[0].path;
  const isActive = location.item === item;
  const isExactPage = location.page?.path === href;
  const count = countOf(item, counts);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        className={cn(
          'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground h-8 gap-2.5 rounded-lg pr-2 pl-2.5 text-[0.8125rem] font-medium',
          'data-[active=true]:bg-primary/12 data-[active=true]:text-sidebar-foreground data-[active=true]:font-semibold',
          count > 0 && 'pr-10',
        )}
      >
        <Link
          href={href}
          // The current item's link may lead to its first tab rather than this
          // exact page, so it is "current" without being "this page".
          aria-current={isExactPage ? 'page' : isActive ? 'true' : undefined}
          onClick={() => {
            setOpenMobile(false);
          }}
        >
          <Icon
            className={cn('size-4!', isActive ? 'text-success' : 'text-muted-foreground')}
            aria-hidden="true"
          />
          <span>{item.label}</span>
          {count > 0 ? <span className="sr-only">{`, ${count} ${COUNT_SUFFIX}`}</span> : null}
        </Link>
      </SidebarMenuButton>
      {count > 0 ? (
        <>
          <SidebarMenuBadge
            aria-hidden="true"
            className="bg-foreground text-background peer-data-active/menu-button:text-background peer-hover/menu-button:text-background top-1.5! right-2 rounded-full px-1.5 text-[0.6875rem] font-semibold"
          >
            {count}
          </SidebarMenuBadge>
          {/* Icon mode has no room for the number; a dot says "something is waiting". */}
          <span
            aria-hidden="true"
            className="bg-destructive ring-sidebar pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full ring-2 group-data-[collapsible=icon]:block"
          />
        </>
      ) : null}
    </SidebarMenuItem>
  );
}

interface NavSectionGroupProps {
  section: NavSection;
  isFirst: boolean;
  location: NavLocation;
  counts: NavCounts | undefined;
}

function NavSectionGroup({ section, isFirst, location, counts }: NavSectionGroupProps) {
  const labelId = useId();
  return (
    <SidebarGroup className="p-0" role="group" aria-labelledby={labelId}>
      {/* With the labels hidden in icon mode, a rule keeps the sections apart. */}
      {isFirst ? null : (
        <SidebarSeparator className="mb-2 hidden group-data-[collapsible=icon]:block" />
      )}
      <SidebarGroupLabel
        id={labelId}
        className="text-muted-foreground h-auto px-2.5 pb-1.5 text-[0.65625rem] font-semibold tracking-[0.08em] uppercase"
      >
        {section.label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-px">
        {section.items.map((item) => (
          <NavEntry key={item.id} item={item} location={location} counts={counts} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

interface WorkspaceSwitcherProps {
  workspaces: readonly Workspace[];
  current: Workspace;
}

/** The sidebar's foot: which workspace this is, and the way to the others. */
function WorkspaceSwitcher({ workspaces, current }: WorkspaceSwitcherProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = current.icon;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={`Workspace: ${current.label}`}
              className="hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent h-auto gap-2 rounded-lg px-1 py-1"
            >
              <span className="bg-primary/14 text-success flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
                  {current.readOnly ? 'Workspace · read-only' : 'Workspace'}
                </span>
                <span className="truncate text-[0.8125rem] font-semibold">{current.label}</span>
              </span>
              <ChevronsUpDown
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="w-60">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
              Switch workspace
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.map((workspace) => {
              const WorkspaceIcon = workspace.icon;
              const isCurrent = workspace === current;
              return (
                <DropdownMenuItem key={workspace.id} asChild>
                  <Link
                    href={workspace.basePath}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      setOpenMobile(false);
                    }}
                  >
                    <WorkspaceIcon aria-hidden="true" />
                    <span className="flex-1 truncate">{workspace.label}</span>
                    {workspace.readOnly ? (
                      <span className="text-muted-foreground text-xs">Read-only</span>
                    ) : null}
                    {isCurrent ? <Check className="text-success" aria-hidden="true" /> : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

interface AppSidebarProps {
  workspaces: readonly Workspace[];
  /** Where the current address sits in the navigation. */
  location: NavLocation;
  /** Badge counts by page path. Leave out while there is nothing to count. */
  counts?: NavCounts;
}

/**
 * The primary navigation: the current workspace's labelled sections, with
 * count badges, and a workspace switcher at the foot. Collapses to icons on
 * desktop and becomes a sheet on phones; the top bar's button toggles both.
 */
export function AppSidebar({ workspaces, location, counts }: AppSidebarProps) {
  const { workspace } = location;

  return (
    <Sidebar
      collapsible="icon"
      // Sits under the full-width top bar rather than beside it.
      className="top-header h-[calc(100svh-var(--spacing-header))]!"
    >
      <SidebarContent>
        <nav
          aria-label="Main"
          className="flex flex-col gap-3.5 px-2.5 pt-3 pb-3 group-data-[collapsible=icon]:px-2"
        >
          {workspace.sections.map((section, index) => (
            <NavSectionGroup
              key={section.label}
              section={section}
              isFirst={index === 0}
              location={location}
              counts={counts}
            />
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t px-2.5 py-2 group-data-[collapsible=icon]:px-2">
        <WorkspaceSwitcher workspaces={workspaces} current={workspace} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
