import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';

/*
 * Activating an invitation (the mock seeds `demo-vht-2c7f9a41` for Joseph Ssemwogerere,
 * sent to +256 776 902 331; the SMS code is always 123456).
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

const INVITE = '/onboarding?invite=demo-vht-2c7f9a41';

test('activates an account from an invitation, then signs in', async ({ page }) => {
  await page.goto(INVITE);

  await page.getByLabel('Phone number').fill('0776 902 331');
  await page.getByRole('button', { name: 'Send me a code' }).click();

  const code = page.getByLabel('6-digit code');
  await code.fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(
    page.getByText("That code doesn't match. Check the SMS and try again."),
  ).toBeVisible();
  await code.fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();

  await page.getByLabel('Password', { exact: true }).fill('Kasenyi2026');
  await page.getByLabel('Confirm password').fill('Kasenyi2026');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByLabel('First name')).toHaveValue('Joseph');
  await page.getByLabel('Email').fill('joseph.ssemwogerere@example.org');
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.getByText('Tick the box to agree before you continue.')).toBeVisible();
  await page.getByRole('checkbox', { name: /^I agree to the CLIMS terms of use/ }).check();
  await page.getByRole('button', { name: 'Activate account' }).click();

  await expect(page).toHaveURL(/\/sign-in\?activated=1$/);
  await expect(page.getByText('Your account is active')).toBeVisible();

  await page.getByLabel('Email').fill('joseph.ssemwogerere@example.org');
  await page.getByLabel('Password', { exact: true }).fill('Kasenyi2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/moh$/);
});

test('refuses a number the invitation was not sent to', async ({ page }) => {
  await page.goto(INVITE);
  await page.getByLabel('Phone number').fill('0701 000 000');
  await page.getByRole('button', { name: 'Send me a code' }).click();

  await expect(page.getByText('This is not the number the invitation was sent to.')).toBeVisible();
  // The entry is kept (tidied into +256 form) so it can be corrected.
  await expect(page.getByLabel('Phone number')).toHaveValue('+256 701 000 000');
  await expect(page.getByLabel('Phone number')).toHaveAttribute('aria-invalid', 'true');
});

test('sends a new code once the wait is over', async ({ page }) => {
  // `demo-resend-7d3e5b20` (Agnes Namata, +256 772 300 415) had its code sent a minute before the
  // reset. The browser holds the same progress, as if this visitor had asked for that code.
  await page.addInitScript(() => {
    const key = 'clims.onboarding';
    if (window.localStorage.getItem(key) !== null) return;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        invite: 'demo-resend-7d3e5b20',
        phone: '+256772300415',
        code_sent_at: Date.now() - 60_000,
        resend_after_seconds: 45,
        activation_token: null,
        password_set: false,
      }),
    );
  });
  await page.goto('/onboarding?invite=demo-resend-7d3e5b20&step=code');

  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'We sent a new code to' })).toHaveText(
    'We sent a new code to +256 772 300 415.',
  );
  // The wait starts again, and the new code is accepted.
  await expect(page.getByText(/You can ask for a new code in 0:4\d\./)).toBeVisible();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByLabel('Confirm password')).toBeVisible();
});
