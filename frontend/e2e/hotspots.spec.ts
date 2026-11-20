import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * Hotspot activation (`dev/mock/hotspots.mts`): a VHT submits a hotspot, the DCFP verifies then
 * activates it, or rejects it with a reason. The mock seeds Kajjansi Weekly Market (submitted),
 * Bwebajja Nite Spot (verified), Kasenyi Landing Site (active) and Nansana Taxi Park (rejected).
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('a VHT submits a hotspot for district verification', async ({ page }) => {
  await open(page, '/vht', 'My hotspots');
  await page.getByRole('button', { name: 'Submit hotspot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit a hotspot' });

  await dialog.getByLabel('Hotspot name').fill('Kitoro Guest House');
  await choose(page, 'District', 'Wakiso');
  await dialog.getByLabel('Contact person').fill('Nalubega Ruth');
  await dialog.getByLabel('Contact phone').fill('0772 555 011');
  await dialog.getByRole('button', { name: 'Submit hotspot' }).click();

  await expectToast(page, 'Hotspot submitted for district verification');
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row', { name: /Kitoro Guest House/ });
  await expect(row).toContainText('+256772555011');
  await expect(row).toContainText('submitted');
});

test('the DCFP verifies a submitted hotspot, then activates it', async ({ page }) => {
  await open(page, '/dcfp/hotspots', 'Hotspots');
  const row = page.getByRole('row', { name: /Kajjansi Weekly Market/ });

  await page.getByRole('button', { name: 'Actions for Kajjansi Weekly Market' }).click();
  await page.getByRole('menuitem', { name: 'Verify' }).click();
  await expectToast(page, 'Hotspot verified');
  await expect(row).toContainText('verified');

  await page.getByRole('button', { name: 'Actions for Kajjansi Weekly Market' }).click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();
  await expectToast(page, 'Hotspot activated');
  await expect(row).toContainText('active');
  // Nothing is left to do with an active hotspot.
  await expect(
    page.getByRole('button', { name: 'Actions for Kajjansi Weekly Market' }),
  ).toBeHidden();
});

test('the DCFP rejects a hotspot only with a reason', async ({ page }) => {
  await open(page, '/dcfp/hotspots', 'Hotspots');
  await page.getByRole('button', { name: 'Actions for Bwebajja Nite Spot' }).click();
  await page.getByRole('menuitem', { name: 'Reject' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reject Bwebajja Nite Spot?' });
  await dialog.getByRole('button', { name: 'Reject hotspot' }).click();
  await expect(dialog.getByText('Say why the hotspot is rejected.')).toBeVisible();

  await dialog.getByLabel('Reason').fill('No condoms are handed out here.');
  await dialog.getByRole('button', { name: 'Reject hotspot' }).click();

  await expectToast(page, 'Hotspot rejected');
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row', { name: /Bwebajja Nite Spot/ });
  await expect(row).toContainText('rejected');
  await expect(row).toContainText('No condoms are handed out here.');
});
