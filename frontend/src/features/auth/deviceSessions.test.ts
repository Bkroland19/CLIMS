import { describe, expect, it } from 'vitest';

import { describeDevice, liveSessions, type DeviceSession } from './deviceSessions';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome on Windows',
      'computer',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      'Edge on Windows',
      'computer',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'Safari on macOS',
      'computer',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
      'phone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
      'phone',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Firefox on Linux',
      'computer',
    ],
    ['okhttp/4.12.0', 'Android app', 'phone'],
    ['CLIMS/42 CFNetwork/1568.200.51 Darwin/24.1.0', 'iOS app', 'phone'],
    ['curl/8.5.0', 'curl', 'unknown'],
  ])('names %s', (agent, label, kind) => {
    expect(describeDevice(agent)).toEqual({ label, kind });
  });

  it('says so when there is no user agent, and shortens one that runs on', () => {
    expect(describeDevice(null)).toEqual({ label: 'Unknown device', kind: 'unknown' });
    expect(describeDevice('   ')).toEqual({ label: 'Unknown device', kind: 'unknown' });
    expect(describeDevice('x'.repeat(300)).label).toHaveLength(40);
  });
});

describe('liveSessions', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const session = (id: string, overrides: Partial<DeviceSession> = {}): DeviceSession => ({
    id,
    user_agent: null,
    ip_address: null,
    created_at: '2026-11-19T08:00:00Z',
    last_seen_at: '2026-11-20T09:00:00Z',
    expires_at: '2026-12-19T08:00:00Z',
    revoked_at: null,
    current: false,
    ...overrides,
  });

  it('keeps signed-in sessions, the current device first, then the most recently active', () => {
    const list = liveSessions(
      [
        session('older', { last_seen_at: '2026-11-18T09:00:00Z' }),
        session('recent', { last_seen_at: '2026-11-20T11:00:00Z' }),
        session('this', { current: true, last_seen_at: '2026-11-20T08:00:00Z' }),
        session('signed-out', { revoked_at: '2026-11-20T10:00:00Z' }),
        session('expired', { expires_at: '2026-11-20T11:59:00Z' }),
      ],
      now,
    );
    expect(list.map((item) => item.id)).toEqual(['this', 'recent', 'older']);
  });
});
