import { expect, test, type Page } from '@playwright/test';

import { resetMock } from './support/mock';
import { choose, expectToast, open } from './support/ui';

/*
 * The district focal person's stockout alerts and district store, against the mock's seeded
 * Wakiso (`dev/mock/orders.mts`, on the Go API's paths and rules). The store holds Engabu boxes
 * but no FC2 pieces. Queued: Kitende Trading Centre (Engabu), Namasuba Lodge (FC2) and Katabi
 * Fish Market (Engabu). On hold: Kasenyi Landing Site (FC2), waiting on a JMS shipment of 450
 * pieces that is on its way, and Namasuba Lodge (Engabu), for an NMS request that is short.
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

/** Opens a queued alert from the alert list. */
async function openQueued(page: Page, hotspot: string) {
  await open(page, '/dcfp/orders', 'Orders');
  await page.getByRole('link', { name: hotspot }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stockout alert' })).toBeVisible();
}

/** Sends `quantity` from the district store with `rider`, on an alert's page. */
async function send(page: Page, quantity: string, rider: string) {
  const form = page.getByRole('form', { name: 'Send from the district store' });
  await form.getByRole('textbox', { name: 'Quantity' }).fill(quantity);
  await choose(page, 'Rider', new RegExp(`^${rider}`));
  await form.getByRole('button', { name: 'Send stock' }).click();
  await expectToast(page, 'Stock sent. The rider can now deliver it.');
  await expect(page.getByRole('heading', { name: 'Outcome' })).toBeVisible();
  await expect(page.getByText(new RegExp(`^${rider}`))).toBeVisible();
}

test('sends stock for an alert from the district store with a rider', async ({ page }) => {
  await openQueued(page, 'Kitende Trading Centre');

  // The store has Engabu boxes, so sending is the choice already made.
  await expect(page.getByRole('radio', { name: /Send from the district store/ })).toBeChecked();
  await send(page, '3', 'Peter Okello');

  await open(page, '/dcfp/dispatch', 'Deliveries');
  await expect(page.getByRole('row', { name: /Kitende Trading Centre/ })).toBeVisible();
});

test('asks a warehouse for stock the store does not have; the alert waits on hold', async ({
  page,
}) => {
  await openQueued(page, 'Namasuba Lodge');

  // No FC2 pieces in the store: sending is closed, asking the warehouse is the choice.
  await expect(page.getByRole('radio', { name: /Send from the district store/ })).toBeDisabled();
  const form = page.getByRole('form', { name: 'Ask the warehouse' });
  await choose(page, 'Warehouse', 'Joint Medical Store');
  await choose(page, 'Unit', 'Piece');
  await form.getByRole('textbox', { name: 'Quantity' }).fill('300');
  await form.getByRole('button', { name: 'Ask the warehouse' }).click();

  await expectToast(
    page,
    'Request sent to the warehouse. The alert waits on hold until the stock arrives.',
  );
  await expect(page.getByRole('link', { name: 'Open the request' })).toBeVisible();

  await open(page, '/dcfp/orders/held', 'Orders');
  const row = page.getByRole('row', { name: /Namasuba Lodge/ }).filter({ hasText: 'FC2' });
  await expect(row).toContainText('Joint Medical Store');
});

test('receives a shipment that came short, then sends the held alert', async ({ page }) => {
  await open(page, '/dcfp/orders/held', 'Orders');
  const held = page.getByRole('row', { name: /Kasenyi Landing Site/ });
  await held.getByRole('link', { name: 'Joint Medical Store' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Warehouse request' })).toBeVisible();

  const receive = page.getByRole('form', { name: 'Receive the shipment' });
  const count = receive.getByRole('textbox', { name: 'Quantity received' });
  await expect(count).toHaveValue('450');
  await count.fill('440');
  await receive.getByRole('button', { name: 'Receive shipment' }).click();
  await expect(
    receive.getByText('450 were sent. Say what happened to the difference.'),
  ).toBeVisible();

  await receive
    .getByRole('textbox', { name: 'What happened to the difference' })
    .fill('Ten pieces were damp when the carton was opened.');
  await receive.getByRole('button', { name: 'Receive shipment' }).click();
  await expectToast(page, 'Shipment received. District stock updated.');

  // The pieces are in the store now, so the alert that waited for them can be sent.
  await open(page, '/dcfp/orders/held', 'Orders');
  await page.getByRole('link', { name: 'Kasenyi Landing Site' }).click();
  await expect(page.getByRole('radio', { name: /Send from the district store/ })).toBeChecked();
  await send(page, '200', 'Musa Kato');
});

test('records an adjustment after a count, which needs a reason', async ({ page }) => {
  await open(page, '/dcfp/restock/store', 'Restock');
  await page.getByRole('button', { name: 'Record stock' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record stock' });

  await dialog.getByRole('radio', { name: /Adjustment/ }).check();
  await choose(page, 'Product', /FC2/);
  await choose(page, 'Unit', 'Piece');
  await dialog.getByRole('textbox', { name: 'Change' }).fill('5');
  await dialog.getByRole('button', { name: 'Record stock' }).click();
  await expect(
    dialog.getByText('Say why the stock changed, for example what the count found.'),
  ).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Note' }).fill('The count found five more pieces.');
  await dialog.getByRole('button', { name: 'Record stock' }).click();

  await expectToast(page, 'Stock recorded.');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: /The count found five more pieces/ })).toBeVisible();
});
