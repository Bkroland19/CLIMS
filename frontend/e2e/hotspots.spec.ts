import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * The hotspot form on the DCFP hotspot list (the legacy `hotSpots` resource in the mock), which
 * seeds Lugogo, Gulu Main Market and Mbarara Taxi Park.
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('adds a hotspot', async ({ page }) => {
  await open(page, '/dcfp/hotspots', 'Hotspots');
  await page.getByRole('button', { name: 'Add hotspot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add hotspot' });

  await dialog.getByLabel('Hotspot name').fill('Kajjansi Weekly Market');
  await choose(page, 'Status', /^active$/i);
  await dialog.getByLabel('Contact person').fill('Nansubuga Aisha');
  await dialog.getByLabel('Contact phone').fill('0772 555 010');
  await dialog.getByLabel('Latitude').fill('0.2167');
  await dialog.getByLabel('Longitude').fill('32.5500');
  await page.getByRole('combobox', { name: 'Organisation unit' }).click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Add hotspot' }).click();

  await expectToast(page, 'Hotspot added');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: /Kajjansi Weekly Market/ }).first()).toBeVisible();
});

test('edits a hotspot’s contact person', async ({ page }) => {
  await open(page, '/dcfp/hotspots', 'Hotspots');
  await page.getByRole('button', { name: 'Actions for Lugogo' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: /^Edit Lugogo/ });
  await expect(dialog.getByLabel('Hotspot name')).toHaveValue('Lugogo');
  await dialog.getByLabel('Contact person').fill('Kato Musa');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expectToast(page, 'Hotspot updated');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Kato Musa' })).toBeVisible();
});

test('deletes a hotspot after confirming', async ({ page }) => {
  await open(page, '/dcfp/hotspots', 'Hotspots');
  await page.getByRole('button', { name: 'Actions for Lugogo' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  const confirm = page.getByRole('alertdialog', { name: 'Delete Lugogo?' });
  await confirm.getByRole('button', { name: 'Delete hotspot' }).click();

  await expectToast(page, 'Hotspot deleted');
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actions for Lugogo' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Hotspots' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for Gulu Main Market' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for Lugogo' })).toBeHidden();
});
