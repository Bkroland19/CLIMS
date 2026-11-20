import { expect, test } from '@playwright/test';

import { ADMIN, AUTH_FILE } from './support/env';
import { resetMock } from './support/mock';
import { open } from './support/ui';

// Signed out: these tests start from a browser with no session.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('signs in and lands on the MOH dashboard', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/moh$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MOH dashboard' })).toBeVisible();
});

test('a wrong password keeps the visitor on sign-in with the entries intact', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Could not sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel('Email')).toHaveValue(ADMIN.email);
});

test('empty fields are flagged before anything is sent', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(page.getByText('Enter your password.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
});

test.describe('signed in', () => {
  // Each test gets its own browser context from the saved state, so signing out here clears only
  // this context's session; the file, and every later test that starts from it, stay signed in.
  test.use({ storageState: AUTH_FILE });

  test('signs out from the account menu', async ({ page }) => {
    await open(page, '/moh', 'MOH dashboard');
    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    // The session is gone, not just hidden: opening a signed-in page goes back to sign-in.
    await page.goto('/moh');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
