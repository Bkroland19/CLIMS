import type { User } from './api';
import { isActive } from './access';

/*
 * What the users list can tell an administrator at a glance, worked out from
 * the fields the Go API already returns: status, roles with their permission
 * codes, `last_login_at` and `active_sessions`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since `value`, or null when the person has never signed in. */
function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : Math.max(0, (now.getTime() - time) / DAY_MS);
}

/** The activity filters, in the order shown. `activity` in the address picks one. */
export const ACTIVITY_FILTERS = [
  { value: 'all', label: 'Any activity', keeps: () => true },
  {
    value: 'week',
    label: 'Signed in this week',
    keeps: (days: number | null) => days !== null && days <= 7,
  },
  {
    value: 'month',
    label: 'Signed in this month',
    keeps: (days: number | null) => days !== null && days <= 30,
  },
  {
    value: 'dormant',
    label: 'Not seen for 90+ days',
    keeps: (days: number | null) => days !== null && days > 90,
  },
  { value: 'never', label: 'Never signed in', keeps: (days: number | null) => days === null },
] as const satisfies readonly {
  value: string;
  label: string;
  keeps: (days: number | null) => boolean;
}[];

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]['value'];

export function activityFilterFrom(param: string | null): (typeof ACTIVITY_FILTERS)[number] {
  return ACTIVITY_FILTERS.find((filter) => filter.value === param) ?? ACTIVITY_FILTERS[0];
}

/** Whether `user` passes the activity filter `filter` at `now`. */
export function matchesActivity(
  user: Pick<User, 'last_login_at'>,
  filter: (typeof ACTIVITY_FILTERS)[number],
  now: Date,
): boolean {
  return filter.keeps(daysSince(user.last_login_at, now));
}

export interface UserStats {
  total: number;
  active: number;
  /** Signed in during the last 30 days. */
  recent: number;
  never: number;
}

/** The figures above the users list. */
export function userStats(users: readonly User[], now: Date): UserStats {
  let active = 0;
  let recent = 0;
  let never = 0;
  for (const user of users) {
    if (isActive(user)) active += 1;
    const days = daysSince(user.last_login_at, now);
    if (days === null) never += 1;
    else if (days <= 30) recent += 1;
  }
  return { total: users.length, active, recent, never };
}

/** Every permission code the user's roles grant, sorted. */
export function effectivePermissions(user: Pick<User, 'roles'>): string[] {
  return [...new Set(user.roles.flatMap((role) => role.permissions))].sort();
}

/**
 * The role colour token for a role's dot (DESIGN.md "Role colours"). The dot
 * always sits beside the role's name: some of these are under 3:1 on white.
 */
const ROLE_DOTS: Readonly<Record<string, string>> = {
  admin: 'bg-role-system',
  moh: 'bg-role-moh',
  dfcp: 'bg-role-dcfp',
  dcfp: 'bg-role-dcfp',
  nms: 'bg-role-warehouse',
  jms: 'bg-role-warehouse',
  vht: 'bg-role-vht',
  'hotspot manager': 'bg-role-hotspot-manager',
  'delivery agent': 'bg-role-rider',
};

export function roleDotClass(name: string | null): string {
  return (name && ROLE_DOTS[name.trim().toLowerCase()]) ?? 'bg-role-system';
}
