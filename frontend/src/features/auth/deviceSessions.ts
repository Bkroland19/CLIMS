import { z } from 'zod';

import { optionalText } from '@/lib/api';

/*
 * A signed-in device: one server session, as `GET /auth/sessions` and
 * `GET /users/:id/sessions` list them (`backend/internal/features/users/sessions.go`).
 * The lists include sessions that were signed out but have not expired yet;
 * `revoked_at` marks those.
 */
export const deviceSessionSchema = z.object({
  id: z.string().min(1),
  user_agent: optionalText,
  ip_address: optionalText,
  created_at: z.string().min(1),
  last_seen_at: z.string().min(1),
  expires_at: z.string().min(1),
  revoked_at: z.string().nullish().default(null),
  /** True for the session that made the request: the device being used now. */
  current: z
    .boolean()
    .nullish()
    .transform((value) => value === true),
});

export type DeviceSession = z.infer<typeof deviceSessionSchema>;

/**
 * The sessions still signed in, the current device first and then the most
 * recently active. Signed-out and expired ones are left out.
 */
export function liveSessions(
  sessions: readonly DeviceSession[],
  now: Date = new Date(),
): DeviceSession[] {
  return sessions
    .filter((session) => session.revoked_at === null && new Date(session.expires_at) > now)
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at),
    );
}

export type DeviceKind = 'phone' | 'computer' | 'unknown';

export interface DeviceDescription {
  /** What a person recognises, e.g. "Chrome on Windows" or "Android app". */
  label: string;
  kind: DeviceKind;
}

const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly [RegExp, string, DeviceKind][] = [
  [/\biPhone\b/, 'iPhone', 'phone'],
  [/\biPad\b/, 'iPad', 'phone'],
  [/\bAndroid\b/, 'Android', 'phone'],
  [/\bCrOS\b/, 'ChromeOS', 'computer'],
  [/\bWindows\b/, 'Windows', 'computer'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS', 'computer'],
  [/\bLinux\b/, 'Linux', 'computer'],
];

/**
 * Names the device behind a user agent. Browsers read as "<browser> on
 * <system>"; the mobile app's HTTP stacks (OkHttp on Android, CFNetwork on
 * iOS) as an app on that system; anything else by the product it names.
 */
export function describeDevice(userAgent: string | null): DeviceDescription {
  const agent = userAgent?.trim() ?? '';
  if (!agent) return { label: 'Unknown device', kind: 'unknown' };
  if (/^okhttp\//i.test(agent)) return { label: 'Android app', kind: 'phone' };
  if (/\bCFNetwork\//.test(agent)) return { label: 'iOS app', kind: 'phone' };

  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent));
  if (browser && system) return { label: `${browser} on ${system[1]}`, kind: system[2] };
  if (browser) return { label: browser, kind: 'unknown' };
  if (system) return { label: system[1], kind: system[2] };

  // A client that names itself first, e.g. "curl/8.5.0" or "PostmanRuntime/7.39".
  const product = /^[^\s/]+/.exec(agent)?.[0] ?? agent;
  return { label: product.length > 40 ? `${product.slice(0, 39)}…` : product, kind: 'unknown' };
}
