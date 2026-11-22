import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';
import { expectToast, open } from './support/ui';

/*
 * The district focal person's two flows, against the mock's Wakiso district (dev/mock/dcfp.mts):
 * hotspots report stockouts, which reach the DCFP as notifications, and the DCFP orders stock
 * from NMS or JMS. Seeded: three stockout reports, the newest from Kisenyi Landing Site
 * (FC2 Free Female, "Dispenser empty since Monday"); an order NMS has dispatched (480 boxes)
 * waiting to be received.
 */

const DISPATCHED = '/dcfp/restock/00000000-0000-4000-8301-000000000003';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('shows a stockout with the hotspot’s details and message, and orders stock for it', async ({
  page,
}) => {
  await open(page, '/dcfp/stockouts', 'Stockout notifications');
  const row = page.getByRole('row').filter({ hasText: 'Kisenyi Landing Site' });
  await expect(row).toContainText('Kisenyi, Katabi Town Council, Wakiso');
  await expect(row).toContainText('Dispenser empty since Monday');
  await expect(row).toContainText('Peter Okello · 0772 123456');

  await row.getByRole('button', { name: 'Actions for Kisenyi Landing Site' }).click();
  await page.getByRole('menuitem', { name: 'Order stock from a warehouse' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'New warehouse order' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Product' })).toContainText('FC2');
  await page.getByRole('radio', { name: /^JMS/ }).check();
  await page.getByRole('textbox', { name: 'Quantity' }).fill('500');
  await page.getByRole('button', { name: 'Send order to JMS' }).click();

  await expectToast(page, 'Order sent to the warehouse');
  await expect(page).toHaveURL(/\/dcfp\/restock\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
});

test('refuses an order without a quantity', async ({ page }) => {
  await open(page, '/dcfp/restock/new', 'New warehouse order');
  await page.getByRole('button', { name: 'Send order to JMS' }).click();

  await expect(page.getByText('Choose the product to order.')).toBeVisible();
  await expect(page.getByText('Enter how many to order, as a whole number.')).toBeVisible();
  await expect(page).toHaveURL(/\/dcfp\/restock\/new$/);
});

test('receives a consignment that came in short, with the reason', async ({ page }) => {
  await open(page, DISPATCHED, 'Warehouse order');
  const counted = page.getByRole('textbox', { name: 'Quantity counted' });
  await expect(counted).toHaveValue('480');
  await counted.fill('470');
  await page.getByRole('button', { name: 'Record receipt' }).click();
  await expect(page.getByText('Say why the count differs from what was dispatched.')).toBeVisible();

  await page.getByLabel('Why the count differs').fill('One box damaged in transit');
  await page.getByRole('button', { name: 'Record receipt' }).click();

  await expectToast(page, 'Receipt recorded; the district store is updated');
  await expect(page.getByText('One box damaged in transit')).toBeVisible();
  await expect(counted).toBeHidden();
});

test('lists stockout notifications in the bell and opens them', async ({ page }) => {
  await open(page, '/dcfp', 'District dashboard');
  await page.getByRole('button', { name: /^Notifications, \d+ new$/ }).click();
  await page
    .getByRole('link', { name: /Kisenyi Landing Site.*Dispenser empty since Monday/ })
    .click();

  await expect(page).toHaveURL(/\/dcfp\/stockouts$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Stockout notifications' }),
  ).toBeVisible();
});
