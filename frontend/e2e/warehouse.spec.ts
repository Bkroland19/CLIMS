import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * The warehouse deciding on and dispatching district orders, on the Go API's shapes. The mock
 * (dev/mock/dcfp.mts, dev/mock/inventory.mts) seeds, at NMS: Wakiso's new order for 500 boxes of
 * female condoms, Kampala's for 800 boxes of male condoms, and Mukono's for 400 FC2 boxes,
 * already reserved. NMS holds 820 FC2 boxes: 40 expired, 60 with under a month left, 120 with
 * two months, 600 with twenty; with Mukono's 400 reserved, 380 can still be reserved.
 */

const order = (n: number) => `00000000-0000-4000-8301-${String(n).padStart(12, '0')}`;
const WAKISO = order(1);
const KAMPALA = order(6);
const MUKONO = order(8);
const FC2_BOXES = 'FC2 · Female · Free, Box of 100';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('approves part of an order, dispatches it first expiry first out, and the district counts it in', async ({
  page,
}) => {
  await open(page, `/warehouse/requests/${WAKISO}?store=NMS`, 'District request');
  await expect(page.getByText('Waiting for your decision')).toBeVisible();
  await expect(page.getByRole('radio', { name: FC2_BOXES })).toBeChecked();
  await expect(page.getByText('380 Box can be reserved')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Quantity to approve' })).toHaveValue('380');
  await page.getByRole('button', { name: 'Approve 380 Box' }).click();

  await expectToast(page, 'Approved and reserved. Wakiso has been told what is coming.');
  await expect(page.getByText('380 Box reserved for Wakiso')).toBeVisible();

  // The expired batch stays behind; the one with under a month left goes first, with a reason.
  const plan = page.getByRole('table', { name: 'Batches this dispatch takes' });
  await expect(plan.getByRole('row')).toHaveCount(4);
  await expect(plan.getByRole('row').nth(1)).toContainText('FC2-2405-002');
  await expect(plan.getByRole('row').nth(1)).toContainText('60 Box');
  await expect(plan).not.toContainText('FC2-2311-090');
  await page.getByRole('button', { name: 'Dispatch to Wakiso' }).click();
  await expect(
    page.getByText('Say why stock with under a month left is dispatched.'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Why dispatch stock with under a month left?' })
    .fill('Wakiso is out of stock and will use it within the week');
  await expect(page.getByRole('textbox', { name: /Waybill number/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: /Vehicle registration/ }).fill('UBF 112C');
  await page.getByRole('button', { name: 'Dispatch to Wakiso' }).click();

  await expectToast(page, 'Dispatched to Wakiso.');
  await expect(page.getByRole('heading', { name: 'Dispatch' })).toBeVisible();
  await expect(page.getByText('380 Box on the way to Wakiso')).toBeVisible();

  // District: the DCFP counts it in.
  await open(page, `/dcfp/restock/${WAKISO}`, 'Warehouse order');
  await expect(page.getByText('UBF 112C')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Quantity counted' })).toHaveValue('380');
  await page.getByRole('button', { name: 'Record receipt' }).click();
  await expectToast(page, 'Receipt recorded; the district store is updated');

  // Warehouse: the order shows what the district counted.
  await open(page, `/warehouse/requests/${WAKISO}?store=NMS`, 'District request');
  await expect(page.getByText('Received in full at Wakiso')).toBeVisible();
});

test('holds an order it cannot cover, until it is approved again for less', async ({ page }) => {
  await open(page, `/warehouse/requests/${WAKISO}?store=NMS`, 'District request');
  const quantity = page.getByRole('textbox', { name: 'Quantity to approve' });
  await expect(quantity).toHaveValue('380');
  await quantity.fill('500');
  await expect(page.getByText(/so the order will wait for stock/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve 500 Box' }).click();

  await expectToast(page, /not enough stock to reserve yet/);
  await expect(page.getByRole('heading', { name: 'Check the stock again' })).toBeVisible();
  await page.getByRole('button', { name: 'Check stock and reserve' }).click();
  await expectToast(page, 'Still not enough stock to reserve. The order keeps waiting.');

  await page.getByRole('button', { name: 'Change product or quantity' }).click();
  await quantity.fill('300');
  await page.getByRole('button', { name: 'Approve 300 Box' }).click();
  await expectToast(page, 'Approved and reserved. Wakiso has been told what is coming.');
  await expect(page.getByText('300 Box reserved for Wakiso')).toBeVisible();
});

test('rejects an order with the reason the district reads', async ({ page }) => {
  await open(page, `/warehouse/requests/${KAMPALA}?store=NMS`, 'District request');
  await page.getByRole('button', { name: 'Reject order…' }).click();
  const reason = page.getByRole('textbox', { name: 'Why are you rejecting it?' });
  await expect(reason).toBeFocused();
  await page.getByRole('button', { name: 'Reject and tell Kampala' }).click();
  await expect(page.getByText('Say why the order is rejected.')).toBeVisible();

  await reason.fill('Engabu boxes are held for the national campaign until March');
  await page.getByRole('button', { name: 'Reject and tell Kampala' }).click();

  await expectToast(page, 'Order rejected. Kampala has been told why.');
  await expect(page.getByText('This order was rejected')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'held for the national campaign' }),
  ).toBeVisible();
});

test('lists what waits on the warehouse, and opens an order to dispatch', async ({ page }) => {
  await open(page, '/warehouse/requests?store=NMS&status=confirmed', 'District requests');
  const row = page.getByRole('row').filter({ hasText: 'Mukono' });
  await expect(row).toContainText('To dispatch');
  await page.getByRole('button', { name: 'Actions for the order from Mukono' }).click();
  await page.getByRole('menuitem', { name: 'Dispatch order' }).click();

  await expect(page).toHaveURL(new RegExp(`/warehouse/requests/${MUKONO}`));
  await expect(page.getByRole('heading', { name: 'Dispatch to Mukono' })).toBeVisible();
});

test('registers two batches of stock in one save, and the figures follow', async ({ page }) => {
  await open(page, '/warehouse/stock?store=NMS', 'Warehouse stock');
  // NMS holds 820 FC2 boxes and 2,300 Engabu boxes.
  const onHand = page.getByRole('link').filter({ hasText: /^On hand/ });
  await expect(onHand).toContainText('3,120 Box');

  await page.getByRole('button', { name: 'Register stock' }).click();
  const sheet = page.getByRole('dialog', { name: 'Register stock at NMS' });
  await choose(page, 'Product', FC2_BOXES);
  await expect(sheet.getByRole('combobox', { name: 'Unit' })).toContainText('Box');
  await sheet.getByRole('textbox', { name: 'Batch number' }).fill('FC2-2611-301');
  await sheet.getByLabel('Expiry date').fill('2029-06-30');
  await sheet.getByRole('textbox', { name: 'Quantity received' }).fill('250');
  await sheet.getByRole('textbox', { name: /Source/ }).fill('UNFPA, DN-301');

  await sheet.getByRole('button', { name: 'Add another batch' }).click();
  const second = sheet
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Batch 2' }) });
  await expect(second.getByRole('textbox', { name: 'Batch number' })).toBeFocused();
  await expect(second.getByRole('combobox', { name: 'Product' })).toContainText('FC2');
  await second.getByRole('textbox', { name: 'Batch number' }).fill('FC2-2611-302');
  await second.getByLabel('Expiry date').fill('2029-09-30');
  await second.getByRole('textbox', { name: 'Quantity received' }).fill('150');
  await expect(sheet).toContainText('2 batches · 400 Box');
  await sheet.getByRole('button', { name: 'Register stock' }).click();

  await expectToast(page, 'Stock registered at NMS: 2 batches, 400 Box.');
  await expect(sheet).toBeHidden();
  await expect(onHand).toContainText('3,520 Box');

  await page.getByRole('link', { name: /^Batches/ }).click();
  const batches = page.getByRole('table', { name: 'Batches at NMS' });
  await expect(batches.getByRole('row').filter({ hasText: 'FC2-2611-301' })).toContainText('250');
  await expect(batches.getByRole('row').filter({ hasText: 'FC2-2611-302' })).toContainText('150');
  await page.getByRole('link', { name: 'Movements' }).click();
  await expect(
    page.getByRole('table', { name: 'Stock movements at NMS' }).getByRole('row').nth(1),
  ).toContainText('UNFPA, DN-301');
});

test('opens the register-stock panel from the old receive address', async ({ page }) => {
  await page.goto('/warehouse/stock/receive?store=NMS');
  await expect(page.getByRole('dialog', { name: 'Register stock at NMS' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/warehouse\/stock\?store=NMS$/);
});

test('writes off an expired batch', async ({ page }) => {
  await open(page, '/warehouse/stock?store=NMS&band=expired', 'Warehouse stock');
  await page.getByRole('button', { name: 'Actions for batch FC2-2311-090' }).click();
  await page.getByRole('menuitem', { name: 'Write off…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Write off batch FC2-2311-090' });
  await expect(dialog.getByRole('textbox', { name: 'How many' })).toHaveValue('40');
  await dialog.getByRole('textbox', { name: 'Why' }).fill('Incinerated under supervision');
  await dialog.getByRole('button', { name: 'Write off' }).click();

  await expectToast(page, 'Batch FC2-2311-090 adjusted.');
  await expect(page.getByText('No batches in this view')).toBeVisible();
});
