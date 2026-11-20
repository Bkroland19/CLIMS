import { expect, test } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './support/axe';
import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * MOH administration against the mock: users, roles and permissions, the product catalogue and
 * the geography. The mock seeds 13 users, one of them (Brian Mugisha) deactivated, and six
 * products, one of them (CND-006, Protector Plus) inactive.
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test.describe('users', () => {
  test('creates a user', async ({ page }) => {
    await open(page, '/moh/users', 'User management');
    await page.getByRole('button', { name: 'Add user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add user' });

    // Required fields are flagged before anything is sent.
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByText('Enter a first name.')).toBeVisible();

    await dialog.getByLabel('First name').fill('Esther');
    await dialog.getByLabel('Last name').fill('Atim');
    await dialog.getByLabel('Username').fill('esther.atim');
    await dialog.getByLabel('Email').fill('esther.atim@example.org');
    await dialog.getByLabel('Phone number').fill('0772 123 456');
    await dialog.getByLabel('Password').fill('a-long-password-1');
    await dialog.getByRole('checkbox', { name: /^District focal person/ }).check();
    await dialog.getByRole('button', { name: 'Create user' }).click();

    await expectToast(page, 'User created');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('link', { name: /^All 14/ })).toBeVisible();
  });

  test('edits a user’s roles', async ({ page }) => {
    await open(page, '/moh/users', 'User management');
    await page.getByRole('button', { name: 'Actions for Ruth Akello' }).click();
    await page.getByRole('menuitem', { name: 'Edit roles' }).click();

    const dialog = page.getByRole('dialog');
    const vht = dialog.getByRole('checkbox', { name: /^VHT/ });
    const wasChecked = await vht.isChecked();
    await vht.setChecked(!wasChecked);
    await dialog.getByRole('button', { name: 'Save roles' }).click();

    await expectToast(page, 'Roles updated');
    await expect(dialog).toBeHidden();
  });

  test('deactivates a user after confirming', async ({ page }) => {
    await open(page, '/moh/users', 'User management');
    await expect(page.getByRole('link', { name: /^Deactivated 1/ })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Ruth Akello' }).click();
    await page.getByRole('menuitem', { name: 'Deactivate user' }).click();

    const confirm = page.getByRole('alertdialog', { name: 'Deactivate Ruth Akello?' });
    await confirm.getByRole('button', { name: 'Deactivate user' }).click();

    await expectToast(page, 'User deactivated');
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('link', { name: /^Deactivated 2/ })).toBeVisible();
  });

  test('reactivates a deactivated user', async ({ page }) => {
    await open(page, '/moh/users', 'User management');
    await page.getByRole('link', { name: /^Deactivated 1/ }).click();
    const row = page.getByRole('row', { name: /Brian Mugisha/ });
    await expect(row).toContainText('Deactivated');

    await page.getByRole('button', { name: 'Actions for Brian Mugisha' }).click();
    await page.getByRole('menuitem', { name: 'Reactivate user' }).click();

    await expectToast(page, 'User reactivated');
    await expect(page.getByRole('link', { name: /^Deactivated 0/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: /^Active 13/ })).toBeVisible();
  });

  test('the add-user form has no serious accessibility violations with its errors showing', async ({
    page,
  }, testInfo) => {
    await open(page, '/moh/users', 'User management');
    await page.getByRole('button', { name: 'Add user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add user' });
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog.getByText('Enter a first name.')).toBeVisible();
    await expect(dialog.getByLabel('First name')).toHaveAttribute('aria-invalid', 'true');

    await expectNoSeriousA11yViolations(page, testInfo, 'add-user-dialog-errors');
  });
});

test('toggles a permission on a role', async ({ page }) => {
  await open(page, '/moh/users/roles', 'Roles & permissions');
  await page.getByRole('link', { name: /^District focal person/ }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'District focal person' }),
  ).toBeVisible();

  const permission = page.getByRole('switch', { name: /users:read/ });
  await expect(permission).toBeEnabled();
  const wasOn = (await permission.getAttribute('aria-checked')) === 'true';
  await permission.click();

  await expectToast(page, 'Permissions updated');
  await expect(permission).toHaveAttribute('aria-checked', String(!wasOn));
});

test.describe('catalogue', () => {
  test('adds a product', async ({ page }) => {
    await open(page, '/moh/catalogue', 'Product catalogue');
    await page.getByRole('button', { name: 'Add product' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a product' });

    await choose(page, 'Category', /^Male/);
    await dialog.getByLabel('Brand').fill('Lifeguard');
    await dialog.getByLabel('Type').fill('Ribbed');
    await page.getByRole('combobox', { name: 'Unit of measure' }).click();
    await page.getByRole('option').first().click();
    await dialog.getByLabel('Condoms per unit').fill('144');
    await dialog.getByLabel('Minimum stock (pieces)').fill('2000');
    await dialog.getByRole('button', { name: 'Add product' }).click();

    await expectToast(page, /Lifeguard.*added to the catalogue/);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: /Lifeguard/ }).first()).toBeVisible();
  });

  test('adds a unit of measure', async ({ page }) => {
    await open(page, '/moh/catalogue/units', 'Units of measure');
    await page.getByRole('button', { name: 'Add unit' }).click();
    await expect(page.getByRole('textbox', { name: 'Unit name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await page.getByRole('textbox', { name: 'Unit name' }).fill('Dispenser pack');
    await page.getByRole('textbox', { name: 'Note (optional)' }).fill('Refill for a dispenser');
    await page.getByRole('button', { name: 'Add unit' }).click();

    await expectToast(page, 'Dispenser pack added to units of measure');
    await expect(page.getByRole('cell', { name: /Dispenser pack/ }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Unit name' })).toHaveValue('');
  });

  test('activates and deactivates a product', async ({ page }) => {
    await open(page, '/moh/catalogue', 'Product catalogue');
    const inactive = page.getByRole('row', { name: /CND-006/ });
    const active = page.getByRole('row', { name: /CND-001/ });
    await expect(inactive).toContainText('Inactive');

    await page.getByRole('button', { name: 'Actions for CND-006' }).click();
    await page.getByRole('menuitem', { name: 'Activate' }).click();
    await expectToast(page, 'CND-006 activated');
    await expect(inactive).not.toContainText('Inactive');

    await page.getByRole('button', { name: 'Actions for CND-001' }).click();
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    await expectToast(page, 'CND-001 deactivated');
    await expect(active).toContainText('Inactive');

    await page.reload();
    await expect(inactive).not.toContainText('Inactive');
    await expect(active).toContainText('Inactive');
  });
});

test('syncs the geography with DHIS2', async ({ page }) => {
  // The mock last synced at 06:00 today; a sync records the time it ran and changes nothing.
  await open(page, '/moh/stores/geography', 'Geography');
  const lastSynced = page.getByText(/^Last synced /);
  const before = await lastSynced.textContent();
  await page.getByRole('button', { name: 'Sync now' }).click();

  await expectToast(page, 'DHIS2 sync finished. No new organisation units.');
  await expect(lastSynced).toHaveText(/^Last synced today, .* · runs nightly$/);
  await expect(lastSynced).not.toHaveText(before ?? '');
  await page.reload();
  await expect(lastSynced).not.toHaveText(before ?? '');
});
