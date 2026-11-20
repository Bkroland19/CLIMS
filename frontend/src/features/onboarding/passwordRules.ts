import { z } from 'zod';

/*
 * The new-account password rules: the prototype's three (at least 8
 * characters, a number, both entries match) plus the Go API's upper bound
 * (`users.AccountInput`: min=8, max=72; bcrypt reads at most 72 bytes).
 * The same list drives the live checklist and the form's validation, so the
 * two cannot disagree.
 */

const MIN_LENGTH = 8;
const MAX_BYTES = 72;

export interface PasswordRule {
  id: 'length' | 'number' | 'match';
  label: string;
  isMet: (password: string, confirmation: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_LENGTH} characters`,
    isMet: (password) => password.length >= MIN_LENGTH,
  },
  { id: 'number', label: 'Includes a number', isMet: (password) => /\d/.test(password) },
  {
    id: 'match',
    label: 'Both passwords match',
    isMet: (password, confirmation) => password.length > 0 && password === confirmation,
  },
];

const byteLength = (value: string) => new TextEncoder().encode(value).length;

export const passwordFormSchema = z
  .object({
    // Not trimmed: a password may legitimately begin or end with a space.
    password: z
      .string()
      .min(1, 'Create a password.')
      .min(MIN_LENGTH, `Use at least ${MIN_LENGTH} characters.`)
      .regex(/\d/, 'Include at least one number.')
      .refine((value) => byteLength(value) <= MAX_BYTES, 'Use a shorter password.'),
    confirmation: z.string().min(1, 'Type the password again.'),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'The passwords do not match.',
  });

export type PasswordForm = z.infer<typeof passwordFormSchema>;
