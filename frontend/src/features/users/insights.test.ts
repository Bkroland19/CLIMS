import { describe, expect, it } from 'vitest';

import {
  activityFilterFrom,
  effectivePermissions,
  matchesActivity,
  roleDotClass,
  userStats,
} from './insights';
import type { User } from './api';

const now = new Date('2026-11-20T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function user(overrides: Partial<User>): User {
  return {
    id: 'u',
    username: 'u',
    firstname: null,
    lastname: null,
    email: null,
    phone_number: null,
    status: 'active',
    role: null,
    roles: [],
    last_login_at: null,
    login_count: null,
    active_sessions: null,
    created_at: null,
    store_id: null,
    ...overrides,
  };
}

describe('activity filters', () => {
  it.each([
    ['week', daysAgo(2), true],
    ['week', daysAgo(9), false],
    ['month', daysAgo(29), true],
    ['dormant', daysAgo(91), true],
    ['dormant', daysAgo(40), false],
    ['dormant', null, false],
    ['never', null, true],
    ['never', daysAgo(1), false],
    ['all', null, true],
  ])('%s keeps a user last seen %s: %s', (filter, lastLogin, kept) => {
    expect(matchesActivity({ last_login_at: lastLogin }, activityFilterFrom(filter), now)).toBe(
      kept,
    );
  });

  it('falls back to every user for an unknown filter in the address', () => {
    expect(activityFilterFrom('bogus').value).toBe('all');
  });
});

describe('userStats', () => {
  it('counts accounts, those who can sign in, recent and never-used ones', () => {
    const stats = userStats(
      [
        user({ last_login_at: daysAgo(1) }),
        user({ last_login_at: daysAgo(60), status: 'disabled' }),
        user({ last_login_at: null }),
        user({ last_login_at: 'not a date' }),
      ],
      now,
    );
    expect(stats).toEqual({ total: 4, active: 3, recent: 1, never: 2 });
  });
});

describe('effectivePermissions', () => {
  it('joins every role’s codes once, sorted', () => {
    expect(
      effectivePermissions({
        roles: [
          { id: 'a', name: 'dfcp', permissions: ['orders:read', 'hotspots:read'] },
          { id: 'b', name: 'vht', permissions: ['hotspots:read', 'hotspots:submit'] },
        ],
      }),
    ).toEqual(['hotspots:read', 'hotspots:submit', 'orders:read']);
  });
});

describe('roleDotClass', () => {
  it('maps roles to their colour token, with a neutral default', () => {
    expect(roleDotClass('JMS')).toBe('bg-role-warehouse');
    expect(roleDotClass('dfcp')).toBe('bg-role-dcfp');
    expect(roleDotClass('registered user')).toBe('bg-role-system');
    expect(roleDotClass(null)).toBe('bg-role-system');
  });
});
