import { expect, test as setup } from '@playwright/test';

import { ADMIN, AUTH_FILE } from './support/env';
import { resetMock } from './support/mock';

/** Signs in once through the real form and saves the browser state the other projects reuse. */
setup('sign in as an administrator', async ({ page, request }) => {
  await resetMock(request);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/moh$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MOH dashboard' })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
