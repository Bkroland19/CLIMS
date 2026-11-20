import { z } from 'zod';

import { parseBody, type HttpClient } from '@/lib/api';

/*
 * Account activation from an invitation: look the invitation up, prove the
 * phone number with an SMS code, set a password, confirm the details.
 *
 * NOT YET IN THE GO API. The Go API has only `POST /auth/register`,
 * `POST /auth/login` and `GET /auth/me`. These paths and shapes are the
 * contract the web client is written against and the mock API
 * (`dev/mock/onboarding.mts`) serves; Phase 9 of `design/IMPLEMENTATION_PLAN.md`
 * lists them for the backend. The onboarding screen shows a sample-data
 * notice until the real endpoints exist.
 *
 * Every request is anonymous: the visitor has no account yet, and a 401 here
 * must not end somebody else's session in the same browser.
 */

/** The opaque token from the invitation link, `/onboarding?invite=<token>`. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

/**
 * The SMS code the development mock API accepts. Shown on the code step as a
 * labelled sample hint, as the prototype does; remove with the notice once
 * the real endpoints exist.
 */
export const MOCK_SMS_CODE = '123456';

const invitationSchema = z.object({
  /** `pending` can be activated; the others explain why it cannot. */
  status: z.enum(['pending', 'expired', 'used']),
  firstname: z.string(),
  lastname: z.string(),
  email: z.string().nullable(),
  /** Display names of the roles the invitation grants, e.g. "VHT". */
  roles: z.array(z.string()),
  /** Where the person works, e.g. "Katabi TC & Kajjansi TC · Wakiso". */
  area: z.string(),
  /** Hotspots the person covers; empty for roles that cover none. */
  hotspots: z.array(z.string()),
  /** Who sent the invitation, e.g. "Sarah Namubiru (Wakiso DCFP)". */
  invited_by: z.string(),
  /** Riders give their motorbike's number plate. */
  requires_number_plate: z.boolean(),
  expires_at: z.string(),
});

export type Invitation = z.infer<typeof invitationSchema>;

const codeSentSchema = z.object({
  /** How long before another code may be requested. */
  resend_after_seconds: z.number().int().nonnegative(),
  /** How long the code stays valid. */
  expires_in_seconds: z.number().int().positive(),
});

export type CodeSent = z.infer<typeof codeSentSchema>;

const verifiedSchema = z.object({
  /** Short-lived proof that the phone was verified, sent with the next two steps. */
  activation_token: z.string().min(1),
});

const activatedSchema = z.object({
  /** The address the person signs in with. */
  email: z.string(),
});

const invitationPath = (token: string) => `/auth/invitations/${encodeURIComponent(token)}`;

/** The invitation behind `token`. An unknown token rejects with a `not_found` ApiError. */
export async function getInvitation(
  http: HttpClient,
  token: string,
  signal?: AbortSignal,
): Promise<Invitation> {
  const body = await http.get(invitationPath(token), { signal, anonymous: true });
  return parseBody(invitationSchema, body, 'invitation');
}

export interface SendCodeInput {
  /** E.164, e.g. `+256772123456`. Must be the number the invitation was sent to. */
  phone: string;
}

/** Sends (or resends) the SMS code. A wrong number is a `phone` field error. */
export async function sendCode(
  http: HttpClient,
  token: string,
  input: SendCodeInput,
): Promise<CodeSent> {
  const body = await http.post(`${invitationPath(token)}/code`, input, { anonymous: true });
  return parseBody(codeSentSchema, body, 'invitation code');
}

export interface VerifyCodeInput {
  phone: string;
  code: string;
}

/** Checks the SMS code. A wrong or expired code is a `code` field error. */
export async function verifyCode(
  http: HttpClient,
  token: string,
  input: VerifyCodeInput,
): Promise<string> {
  const body = await http.post(`${invitationPath(token)}/verify`, input, { anonymous: true });
  return parseBody(verifiedSchema, body, 'invitation verification').activation_token;
}

export interface SetPasswordInput {
  activation_token: string;
  password: string;
}

/** Sets the new account's password. A weak password is a `password` field error. */
export async function setPassword(
  http: HttpClient,
  token: string,
  input: SetPasswordInput,
): Promise<void> {
  await http.post(`${invitationPath(token)}/password`, input, { anonymous: true });
}

export interface ActivateInput {
  activation_token: string;
  firstname: string;
  lastname: string;
  email: string;
  /** Only for invitations that require one; otherwise `null`. */
  number_plate: string | null;
  accepted_terms: true;
}

/** Activates the account. The invitation is used up; the person then signs in. */
export async function activate(
  http: HttpClient,
  token: string,
  input: ActivateInput,
): Promise<{ email: string }> {
  const body = await http.post(`${invitationPath(token)}/activate`, input, { anonymous: true });
  return parseBody(activatedSchema, body, 'activation');
}
