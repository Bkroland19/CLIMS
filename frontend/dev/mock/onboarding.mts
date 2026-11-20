/**
 * Account activation from an invitation, for the mock API.
 *
 * None of this exists in the Go API yet. The paths and shapes here are the
 * contract the web client is written against (see
 * `src/features/onboarding/api.ts` and `design/IMPLEMENTATION_PLAN.md`,
 * Phase 9). Replies use the Go API's `{ success, data }` envelope and its
 * `{ success: false, message, error }` failure body. All of these routes are
 * anonymous.
 *
 * Seeded invitations (open http://localhost:3000/onboarding?invite=<token>):
 *   demo-vht-2c7f9a41     pending, VHT and hotspot manager, phone +256 776 902 331
 *   demo-rider-5b18e0d3   pending, rider (asks for a number plate), phone +256 701 334 920
 *   demo-expired-9e04c6aa expired
 *   demo-used-31d7b2f0    already used
 *   demo-resend-7d3e5b20  pending, a code already sent a minute ago, phone +256 772 300 415
 * The SMS code is always 123456. The email taken@example.org is refused as in use.
 */

export interface Reply {
  status: number;
  body: unknown;
}

type Body = Record<string, unknown>;

interface Invitation {
  token: string;
  status: 'pending' | 'expired' | 'used';
  phone: string;
  firstname: string;
  lastname: string;
  email: string | null;
  roles: string[];
  area: string;
  hotspots: string[];
  invited_by: string;
  requires_number_plate: boolean;
  expires_at: string;
  /** When the latest code was sent (epoch ms), or null before any. */
  code_sent_at: number | null;
  wrong_attempts: number;
  activation_token: string | null;
  password_set: boolean;
}

/** Duplicated from `src/features/onboarding/api.ts` (`MOCK_SMS_CODE`): this file cannot import from src. */
const SMS_CODE = '123456';
const RESEND_AFTER_SECONDS = 45;
const CODE_VALID_SECONDS = 600;
const MAX_WRONG_ATTEMPTS = 5;
const TAKEN_EMAIL = 'taken@example.org';

const ok = (data: unknown, status = 200): Reply => ({
  status,
  body: { success: true, message: 'ok', data },
});
const fail = (status: number, message: string, error?: Record<string, string[]>): Reply => ({
  status,
  body: { success: false, message, ...(error ? { error } : {}) },
});

function seedInvitations(): Invitation[] {
  const base = {
    code_sent_at: null,
    wrong_attempts: 0,
    activation_token: null,
    password_set: false,
  };
  return [
    {
      ...base,
      token: 'demo-vht-2c7f9a41',
      status: 'pending',
      phone: '+256776902331',
      firstname: 'Joseph',
      lastname: 'Ssemwogerere',
      email: null,
      roles: ['VHT', 'Hotspot manager'],
      area: 'Katabi TC & Kajjansi TC · Wakiso',
      hotspots: ['Kasenyi Landing Site', 'Bwebajja Nite Spot', 'Kajjansi Weekly Market'],
      invited_by: 'Sarah Namubiru (Wakiso DCFP)',
      requires_number_plate: false,
      expires_at: '2026-12-31T21:00:00Z',
    },
    {
      ...base,
      token: 'demo-rider-5b18e0d3',
      status: 'pending',
      phone: '+256701334920',
      firstname: 'Musa',
      lastname: 'Kato',
      email: 'musa.kato@example.org',
      roles: ['Delivery agent'],
      area: 'Wakiso district',
      hotspots: [],
      invited_by: 'Sarah Namubiru (Wakiso DCFP)',
      requires_number_plate: true,
      expires_at: '2026-12-31T21:00:00Z',
    },
    {
      ...base,
      token: 'demo-expired-9e04c6aa',
      status: 'expired',
      phone: '+256772418903',
      firstname: 'Grace',
      lastname: 'Nakato',
      email: null,
      roles: ['Hotspot manager'],
      area: 'Kasenyi, Katabi TC · Wakiso',
      hotspots: ['Kasenyi Landing Site'],
      invited_by: 'Joseph Ssemwogerere (VHT)',
      requires_number_plate: false,
      expires_at: '2026-10-01T21:00:00Z',
    },
    {
      ...base,
      token: 'demo-used-31d7b2f0',
      status: 'used',
      phone: '+256772600118',
      firstname: 'Daniel',
      lastname: 'Ochieng',
      email: 'daniel.ochieng@example.org',
      roles: ['Warehouse officer'],
      area: 'NMS · Entebbe',
      hotspots: [],
      invited_by: 'The Ministry of Health',
      requires_number_plate: false,
      expires_at: '2026-12-31T21:00:00Z',
    },
    {
      ...base,
      token: 'demo-resend-7d3e5b20',
      status: 'pending',
      phone: '+256772300415',
      firstname: 'Agnes',
      lastname: 'Namata',
      email: null,
      roles: ['Hotspot manager'],
      area: 'Kireka, Kira TC · Wakiso',
      hotspots: ['Kireka Truck Stop Lodge'],
      invited_by: 'Sarah Namubiru (Wakiso DCFP)',
      requires_number_plate: false,
      expires_at: '2026-12-31T21:00:00Z',
      // Its code went out a minute before the reset, so a new one may be asked for straight away.
      code_sent_at: Date.now() - 60_000,
    },
  ];
}

let invitations: Invitation[] = seedInvitations();
let nextToken = 1;

/** Restores the seeded invitations. The same in every dataset: activation has no "empty" case. */
export function seedOnboarding(): void {
  invitations = seedInvitations();
}

/** The same normalisation as `src/lib/phone.ts`, reduced to what the mock needs. */
function e164(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s().+-]/g, '');
  const national = digits.startsWith('256')
    ? digits.slice(3).replace(/^0/, '')
    : digits.replace(/^0/, '');
  return /^7\d{8}$/.test(national) ? `+256${national}` : null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function view(invitation: Invitation) {
  return {
    status: invitation.status,
    firstname: invitation.firstname,
    lastname: invitation.lastname,
    email: invitation.email,
    roles: invitation.roles,
    area: invitation.area,
    hotspots: invitation.hotspots,
    invited_by: invitation.invited_by,
    requires_number_plate: invitation.requires_number_plate,
    expires_at: invitation.expires_at,
  };
}

/** Why a step cannot go ahead on this invitation, or null when it can. */
function notPending(invitation: Invitation): Reply | null {
  if (invitation.status === 'expired') return fail(410, 'This invitation has expired.');
  if (invitation.status === 'used') return fail(409, 'This invitation has already been used.');
  return null;
}

function sendCode(invitation: Invitation, body: Body): Reply {
  const phone = e164(body.phone);
  if (!phone) {
    return fail(422, 'validation failed', { phone: ['Enter a Ugandan mobile number.'] });
  }
  if (phone !== invitation.phone) {
    return fail(422, 'validation failed', {
      phone: ['This is not the number the invitation was sent to.'],
    });
  }
  const now = Date.now();
  if (invitation.code_sent_at !== null) {
    const wait = Math.ceil((invitation.code_sent_at + RESEND_AFTER_SECONDS * 1000 - now) / 1000);
    if (wait > 0) return fail(429, `Wait ${wait} seconds before asking for a new code.`);
  }
  invitation.code_sent_at = now;
  invitation.wrong_attempts = 0;
  invitation.activation_token = null;
  invitation.password_set = false;
  return ok({ resend_after_seconds: RESEND_AFTER_SECONDS, expires_in_seconds: CODE_VALID_SECONDS });
}

function verify(invitation: Invitation, body: Body): Reply {
  if (e164(body.phone) !== invitation.phone || invitation.code_sent_at === null) {
    return fail(422, 'validation failed', { code: ['Ask for a code first.'] });
  }
  const expired = Date.now() - invitation.code_sent_at > CODE_VALID_SECONDS * 1000;
  if (expired || invitation.wrong_attempts >= MAX_WRONG_ATTEMPTS) {
    return fail(422, 'validation failed', {
      code: ['That code has expired. Ask for a new one.'],
    });
  }
  if (text(body.code) !== SMS_CODE) {
    invitation.wrong_attempts += 1;
    return fail(422, 'validation failed', {
      code: ["That code doesn't match. Check the SMS and try again."],
    });
  }
  invitation.activation_token = `mock-activation-${String(nextToken++)}`;
  return ok({ activation_token: invitation.activation_token });
}

function hasActivationToken(invitation: Invitation, body: Body): boolean {
  return (
    invitation.activation_token !== null && body.activation_token === invitation.activation_token
  );
}

const VERIFICATION_LAPSED = 'Your phone verification has lapsed. Go back and ask for a new code.';

function setPassword(invitation: Invitation, body: Body): Reply {
  if (!hasActivationToken(invitation, body)) return fail(403, VERIFICATION_LAPSED);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || !/\d/.test(password)) {
    return fail(422, 'validation failed', {
      password: ['Use at least 8 characters, including a number.'],
    });
  }
  invitation.password_set = true;
  return ok(null);
}

function activate(invitation: Invitation, body: Body): Reply {
  if (!hasActivationToken(invitation, body)) return fail(403, VERIFICATION_LAPSED);
  if (!invitation.password_set) return fail(422, 'Create a password first.');
  const error: Record<string, string[]> = {};
  const email = text(body.email).toLowerCase();
  if (!text(body.firstname)) error.firstname = ['Enter your first name.'];
  if (!text(body.lastname)) error.lastname = ['Enter your last name.'];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error.email = ['Enter a valid email address.'];
  else if (email === TAKEN_EMAIL) error.email = ['That email is already used by another account.'];
  if (invitation.requires_number_plate && text(body.number_plate).length < 5) {
    error.number_plate = ['Enter the number plate.'];
  }
  if (body.accepted_terms !== true) error.accepted_terms = ['Agree to the terms to continue.'];
  if (Object.keys(error).length > 0) return fail(422, 'validation failed', error);

  invitation.status = 'used';
  invitation.activation_token = null;
  return ok({ email });
}

/**
 * Answers a request for an invitation, or returns null when the path is not
 * one. `parts` is the path after `/api/v1`, split on `/`:
 * `auth / invitations / <token> [/ code | verify | password | activate]`.
 */
export function handleOnboarding(
  method: string,
  parts: readonly string[],
  body: Body,
): Reply | null {
  const [resource, collection, token, action] = parts;
  if (resource !== 'auth' || collection !== 'invitations' || token === undefined) return null;

  const invitation = invitations.find((candidate) => candidate.token === token);
  if (!invitation) return fail(404, 'invitation not found');

  if (action === undefined) {
    return method === 'GET' ? ok(view(invitation)) : fail(405, 'Method not allowed');
  }
  if (method !== 'POST') return fail(405, 'Method not allowed');

  const blocked = notPending(invitation);
  if (blocked) return blocked;

  switch (action) {
    case 'code':
      return sendCode(invitation, body);
    case 'verify':
      return verify(invitation, body);
    case 'password':
      return setPassword(invitation, body);
    case 'activate':
      return activate(invitation, body);
    default:
      return fail(404, 'Not found');
  }
}
