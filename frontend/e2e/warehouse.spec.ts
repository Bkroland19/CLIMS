import { expect, test } from '@playwright/test';

import { resetMock } from './support/mock';
import { expectToast, open } from './support/ui';

/*
 * The warehouse forms, on the prototype contract (`dev/mock/fulfilment.mts`); the district
 * side has moved to the live orders API, so the two no longer share requests. The mock seeds WR-2026-0031
 * (new, at JMS), WR-2026-0030 (queued at NMS, for Mukono) and WR-2026-0027 (on hold at JMS,
 * for Lira, awaiting a supplier delivery).
 */

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('accepts a new district request', async ({ page }) => {
  await open(page, '/warehouse/requests/WR-2026-0031?store=JMS', 'District request');
  await page.getByRole('button', { name: 'Accept and queue request' }).click();

  await expectToast(page, 'WR-2026-0031 accepted and queued.');
  await expect(page.getByRole('region', { name: 'WR-2026-0031' })).toContainText('Queued');
  await expect(page.getByRole('button', { name: 'Check stock' })).toBeVisible();
});

test('puts a queued request on hold, with a reason', async ({ page }) => {
  await open(page, '/warehouse/requests/WR-2026-0030?store=NMS', 'District request');
  await page.getByRole('button', { name: 'Check stock' }).click();
  await page.getByRole('button', { name: 'Put on hold instead' }).click();

  const hold = page.getByRole('button', { name: 'Put on hold and notify district' });
  await hold.click();
  await expect(page.getByText('Choose a reason for the hold.')).toBeVisible();

  await page.getByRole('radio', { name: 'Batch on quality hold' }).check();
  await hold.click();

  await expectToast(page, 'WR-2026-0030 is on hold. Mukono DCFP has been notified.');
  await expect(page.getByRole('button', { name: 'Return to queue and re-check' })).toBeVisible();
});

test('accepts a new district request from the list', async ({ page }) => {
  await open(page, '/warehouse/requests?store=JMS', 'District requests');
  const row = page.getByRole('row', { name: /WR-2026-0031/ });
  await expect(row).not.toContainText('Queued');
  await page.getByRole('button', { name: 'Actions for WR-2026-0031' }).click();
  await page.getByRole('menuitem', { name: 'Accept and queue' }).click();

  await expectToast(page, 'WR-2026-0031 accepted and queued.');
  await expect(row).toContainText('Queued');
  await page.reload();
  await expect(row).toContainText('Queued');
});

test('returns a held request to the queue', async ({ page }) => {
  await open(page, '/warehouse/requests/WR-2026-0027?store=JMS', 'District request');
  const summary = page.getByRole('region', { name: 'WR-2026-0027' });
  await expect(summary).toContainText('On hold');
  await page.getByRole('button', { name: 'Return to queue and re-check' }).click();

  await expectToast(page, 'WR-2026-0027 is back in the queue. Check stock again.');
  await expect(summary).toContainText('Queued');
  await expect(page.getByRole('button', { name: 'Check stock' })).toBeVisible();
  await page.reload();
  await expect(summary).toContainText('Queued');
});

test('dispatches a queued request; transport details come first', async ({ page }) => {
  await open(page, '/warehouse/requests/WR-2026-0030?store=NMS', 'District request');
  await page.getByRole('button', { name: 'Check stock' }).click();
  const send = page.getByRole('button', { name: 'Dispatch to Mukono district store' });
  await send.click();
  // Transport details are required before anything is sent.
  await expect(page.getByLabel('Waybill number')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Waybill number').fill('WB-NMS-26-1300');
  await page.getByLabel('Vehicle').fill('UBF 112C');
  await page.getByLabel('Driver').fill('Robert Ssali');
  await send.click();
  await expectToast(page, 'WR-2026-0030 dispatched to Mukono district store.');
  await expect(page.getByText('WB-NMS-26-1300').first()).toBeVisible();
});
