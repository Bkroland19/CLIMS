import { expect, test, type Page } from '@playwright/test';

import { resetMock } from './support/mock';
import { expectToast, open } from './support/ui';

/*
 * The district focal person's forms, against the mock's seeded Wakiso district:
 * the store holds 1,400 male and 60 female condoms; ORD-0141 (800 + 40) and ORD-0139 (500 + 0)
 * are queued; ORD-0140 (1,500 + 60) is held with no warehouse request; ORD-0142 is confirmed;
 * WR-2026-0032 (6,000 + 300 from NMS) is in transit.
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('confirms an order: approve less, check stock, pick batches, confirm', async ({ page }) => {
  await open(page, '/dcfp/orders/ORD-0141', 'Review order');

  await page.getByRole('textbox', { name: 'Approved quantity, male condoms' }).fill('600');
  await page.getByRole('button', { name: 'Check stock availability' }).click();
  await expect(page.getByText('All items are available in the district store')).toBeVisible();

  // The first-expiry-first-out picks are suggested; confirming reserves them.
  await expect(page.getByRole('heading', { name: 'Select batches' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm order and notify hotspot' }).click();

  await expectToast(page, 'ORD-0141 confirmed. The hotspot has been notified.');
  await expect(page.getByText(/^Confirmed /).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allocated batches' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prepare dispatch' })).toBeVisible();
});

test('rejects an approved quantity above what was requested', async ({ page }) => {
  await open(page, '/dcfp/orders/ORD-0141', 'Review order');
  const male = page.getByRole('textbox', { name: 'Approved quantity, male condoms' });
  await male.fill('900');

  await expect(page.getByText('No more than the 800 requested.')).toBeVisible();
  await expect(male).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Check stock availability' })).toBeDisabled();
});

test('holds an order; the store still covers it, so release is offered', async ({ page }) => {
  await open(page, '/dcfp/orders/ORD-0139', 'Review order');
  await page.getByRole('button', { name: 'Check stock availability' }).click();
  await page.getByRole('button', { name: 'Put on hold' }).click();

  await expectToast(page, 'ORD-0139 is on hold.');
  await expect(page.getByText(/^On hold: held by the district focal person/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release from hold and confirm' })).toBeVisible();
});

test('requests stock from a warehouse for a held order the store cannot cover', async ({
  page,
}) => {
  await open(page, '/dcfp/orders/ORD-0140', 'Review order');
  await expect(
    page.getByText('No warehouse request has been raised for this order yet.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Request stock from warehouse' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'New warehouse request' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^ORD-0140/ })).toBeChecked();
  await page.getByRole('radio', { name: /^JMS/ }).check();
  await page.getByRole('button', { name: 'Send request to JMS' }).click();

  await expectToast(page, /^WR-\d{4}-\d{4} sent to JMS\.$/);
  await expect(page).toHaveURL(/\/dcfp\/restock\/WR-\d{4}-\d{4}$/);
  await expect(page.getByRole('list', { name: 'Held orders linked' })).toContainText('ORD-0140');
});

test('sends a new warehouse request with a comment', async ({ page }) => {
  await open(page, '/dcfp/restock/new', 'New warehouse request');

  await page.getByRole('textbox', { name: 'Quantity to request, male condoms' }).fill('7200');
  await page
    .getByRole('textbox', { name: 'Comment for the warehouse (optional)' })
    .fill('Two hotspots in Katabi are out of stock');
  await expect(page.getByRole('definition').filter({ hasText: 'Male 7,200' })).toBeVisible();
  await page.getByRole('button', { name: 'Send request to NMS' }).click();

  await expectToast(page, /^WR-\d{4}-\d{4} sent to NMS\.$/);
  await expect(page).toHaveURL(/\/dcfp\/restock\/WR-\d{4}-\d{4}$/);

  // The district's page does not show the comment; the warehouse reads it on its side.
  const id = new URL(page.url()).pathname.split('/').pop() ?? '';
  await open(page, `/warehouse/requests/${id}?store=NMS`, 'District request');
  await expect(
    page.getByRole('definition').filter({ hasText: 'Two hotspots in Katabi are out of stock' }),
  ).toBeVisible();
});

/** Receives WR-2026-0032 with 100 male condoms short, and documents why. */
async function receiveWithShortfall(page: Page): Promise<void> {
  await open(page, '/dcfp/restock/WR-2026-0032', 'Warehouse request');
  await page.getByRole('textbox', { name: 'Counted, batch ENG-2409-117' }).fill('5900');
  await expect(page.getByRole('heading', { name: 'Document discrepancy' })).toBeVisible();

  // Nothing is sent until the discrepancy is explained and both checks are ticked.
  await page.getByRole('button', { name: 'Confirm receipt and issue GRN' }).click();
  await expect(page.getByText('Say what happened before confirming.')).toBeVisible();
  await expect(page.getByLabel('What happened')).toBeFocused();

  await page.getByLabel('What happened').fill('One carton missing from the consignment');
  await page.getByRole('checkbox', { name: /checked batch numbers and expiry dates/ }).check();
  await page.getByRole('checkbox', { name: /signed waybill WB-NMS-26-1187/ }).check();
  await page.getByRole('button', { name: 'Confirm receipt and issue GRN' }).click();

  await expectToast(page, 'WR-2026-0032 received. District stock updated.');
  await expect(page.getByText(/: district stock updated$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Goods received note / })).toBeVisible();
  await expect(page.getByText('One carton missing from the consignment')).toBeVisible();
}

test('receives a consignment with a discrepancy', async ({ page }) => {
  await receiveWithShortfall(page);
});

test('releases a held order once received stock covers it', async ({ page }) => {
  await receiveWithShortfall(page);

  await open(page, '/dcfp/orders/ORD-0140', 'Review order');
  await expect(
    page.getByText('The district store now has enough stock. Release the order to confirm it.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Release from hold and confirm' }).click();

  await expectToast(page, 'ORD-0140 released and confirmed.');
  await expect(page.getByRole('link', { name: 'Prepare dispatch' })).toBeVisible();
});

test('hands a confirmed order over to a rider', async ({ page }) => {
  await open(page, '/dcfp/dispatch/ORD-0142', 'Dispatch order');

  await expect(page.getByRole('radio', { name: 'Musa Kato' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Peter Okello' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hand over to Musa' }).click();

  await expectToast(page, 'ORD-0142 handed over to the rider.');
  await expect(page).toHaveURL(/\/dcfp\/dispatch$/);
});

test('releases a held order from the held-orders list', async ({ page }) => {
  // Hold ORD-0139 (500 male), which the store's 1,400 covers; ORD-0140 (1,500) stays short.
  await open(page, '/dcfp/orders/ORD-0139', 'Review order');
  await page.getByRole('button', { name: 'Check stock availability' }).click();
  await page.getByRole('button', { name: 'Put on hold' }).click();
  await expectToast(page, 'ORD-0139 is on hold.');

  await open(page, '/dcfp/orders/held', 'Orders');
  const held = page.getByRole('list', { name: 'Orders on hold' });
  const covered = held.getByRole('listitem').filter({ hasText: 'ORD-0139' });
  const short = held.getByRole('listitem').filter({ hasText: 'ORD-0140' });
  await expect(covered).toContainText('Can be fulfilled');
  await expect(short).toContainText('Still short');
  await expect(short.getByRole('button', { name: 'Not enough stock' })).toBeDisabled();
  await covered.getByRole('button', { name: 'Release and confirm' }).click();

  await expectToast(page, 'ORD-0139 released and confirmed.');
  await expect(covered).toBeHidden();
  await page.reload();
  await expect(short).toBeVisible();
  await expect(covered).toBeHidden();
});

test('an order confirmed after someone else put it on hold shows why and keeps the entry', async ({
  page,
  context,
}) => {
  await open(page, '/dcfp/orders/ORD-0141', 'Review order');
  const male = page.getByRole('textbox', { name: 'Approved quantity, male condoms' });
  await male.fill('600');
  await page.getByRole('button', { name: 'Check stock availability' }).click();
  await expect(page.getByText('All items are available in the district store')).toBeVisible();

  // Meanwhile, in another tab, the same order is put on hold.
  const other = await context.newPage();
  await open(other, '/dcfp/orders/ORD-0141', 'Review order');
  await other.getByRole('button', { name: 'Check stock availability' }).click();
  await other.getByRole('button', { name: 'Put on hold' }).click();
  await expectToast(other, 'ORD-0141 is on hold.');
  await other.close();

  // The server refuses the stale confirmation (409); the page says so and keeps the figures.
  await page.getByRole('button', { name: 'Confirm order and notify hotspot' }).click();
  await expect(page.getByText('That did not go through')).toBeVisible();
  await expect(page.getByText('ORD-0141 is no longer waiting for review.')).toBeVisible();
  await expect(male).toHaveValue('600');
});
