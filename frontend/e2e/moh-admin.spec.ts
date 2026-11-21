import { expect, test } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './support/axe';
import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * MOH administration against the mock: users, roles and permissions, the product catalogue and
 * the geography. The mock seeds 13 users, one of them (Brian Mugisha) deactivated, and eight
 * products: Protector Plus is inactive, and two Trust products came from the legacy system
 * without a unit or pack size (one active, one deactivated). The Lifeguard brand is unused.
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

    // A district focal person works in one district, so the form asks which.
    const where = dialog.getByRole('group', { name: 'Where they work' });
    await expect(where.getByRole('combobox', { name: /^District/ })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(where.getByText('Choose a region.')).toBeVisible();
    await choose(page, 'Region', 'South Central');
    await choose(page, 'District', 'Wakiso');

    const created = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/users'),
    );
    await dialog.getByRole('button', { name: 'Create user' }).click();
    // The place was checked but not sent: the API does not store it yet.
    expect((await created).postDataJSON()).not.toHaveProperty('district_id');

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

  test('signs a user out everywhere after confirming', async ({ page }) => {
    await open(page, '/moh/users', 'User management');
    await page.getByRole('button', { name: 'Actions for Harriet Achieng' }).click();
    await page.getByRole('menuitem', { name: 'Signed-in devices' }).click();

    const dialog = page.getByRole('dialog', { name: 'Signed-in devices' });
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Sign out everywhere' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Sign Harriet Achieng out everywhere?' });
    await confirm.getByRole('button', { name: 'Sign out everywhere' }).click();

    await expectToast(page, 'Signed Harriet Achieng out of 2 devices');
    await expect(confirm).toBeHidden();
    await expect(dialog.getByText('Not signed in anywhere')).toBeVisible();
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

    // Nothing is sent until every field is filled in.
    await dialog.getByRole('button', { name: 'Add product' }).click();
    await expect(dialog.getByText('Choose a brand.')).toBeVisible();

    await choose(page, 'Brand', 'Protector Plus');
    await choose(page, 'Category', /^Male/);
    await choose(page, 'Type', 'Socially marketed');
    await choose(page, 'Unit of measure', 'Box');
    await dialog.getByLabel('Condoms per unit').fill('144');
    await dialog.getByRole('button', { name: 'Add product' }).click();

    await expectToast(page, 'Protector Plus · Male · Socially marketed added to the catalogue');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', {
        name: 'Actions for Protector Plus · Male · Socially marketed (Box of 144)',
      }),
    ).toBeVisible();
  });

  test('completes a legacy product, then activates and deactivates products', async ({ page }) => {
    await open(page, '/moh/catalogue', 'Product catalogue');
    await expect(page.getByText('2 products are missing details')).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Trust · Male · Commercial' }).click();
    await page.getByRole('menuitem', { name: 'Complete details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Trust · Male · Commercial' });
    await choose(page, 'Unit of measure', 'Box');
    await dialog.getByLabel('Condoms per unit').fill('12');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expectToast(page, 'Trust · Male · Commercial saved');
    await expect(page.getByText('1 product is missing details')).toBeVisible();

    const inactive = page.getByRole('row', { name: /Protector Plus/ });
    await expect(inactive).toContainText('Inactive');
    await page.getByRole('button', { name: /^Actions for Protector Plus/ }).click();
    await page.getByRole('menuitem', { name: 'Activate' }).click();
    await expectToast(page, 'Protector Plus · Male · Socially marketed activated');
    await expect(inactive).not.toContainText('Inactive');

    const fc2Box = 'Actions for FC2 · Female · Free (public sector) (Box of 100)';
    await page.getByRole('button', { name: fc2Box }).click();
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    await expectToast(page, 'FC2 · Female · Free (public sector) deactivated');

    await page.reload();
    await expect(inactive).not.toContainText('Inactive');
    await page.getByRole('link', { name: /^Inactive/ }).click();
    await expect(page.getByRole('button', { name: fc2Box })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actions for Protector Plus/ })).toBeHidden();
  });

  test('deletes an unused brand after confirming', async ({ page }) => {
    await open(page, '/moh/catalogue/brands', 'Brands');
    await page.getByRole('button', { name: 'Actions for Engabu' }).click();
    // Products use Engabu, so it can only be deactivated.
    await expect(page.getByRole('menuitem', { name: 'Deactivate' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeHidden();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Actions for Lifeguard' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete Lifeguard?' });
    await confirm.getByRole('button', { name: 'Delete brand' }).click();

    await expectToast(page, 'Lifeguard deleted');
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('button', { name: 'Actions for Lifeguard' })).toBeHidden();
  });

  test('adds a unit of measure', async ({ page }) => {
    await open(page, '/moh/catalogue/units', 'Units of measure');
    await page.getByRole('button', { name: 'Add unit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a unit' });
    await dialog.getByRole('button', { name: 'Add unit' }).click();
    await expect(dialog.getByRole('textbox', { name: 'Unit name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await dialog.getByRole('textbox', { name: 'Unit name' }).fill('BOX');
    await dialog.getByRole('button', { name: 'Add unit' }).click();
    await expect(
      dialog.getByText('A unit of measure with this name already exists.'),
    ).toBeVisible();

    await dialog.getByRole('textbox', { name: 'Unit name' }).fill('Dispenser pack');
    await dialog.getByRole('textbox', { name: 'Note (optional)' }).fill('Refill for a dispenser');
    await dialog.getByRole('button', { name: 'Add unit' }).click();

    await expectToast(page, 'Dispenser pack added to units of measure');
    await expect(page.getByRole('cell', { name: /Dispenser pack/ }).first()).toBeVisible();
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
