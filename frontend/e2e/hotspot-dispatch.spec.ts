import { expect, test } from '@playwright/test';

import { aReport, FEMALE } from '../src/test/dcfpFixtures';
import { aProductSummary, aStoreSummary } from '../src/test/warehouseOrderFixtures';

// Browser-local API replies exercise the real shell without dispatching development stock.
test('selects a hotspot from stockouts, dispatches stock and displays the receipt queue', async ({
  page,
}) => {
  const storeId = 'store-kampala';
  const user = {
    id: 'district-user',
    username: 'district',
    firstname: 'District',
    lastname: 'Officer',
    roleNames: ['dfcp'],
    permissions: ['orders:read', 'orders:supply_hotspots', 'orders:replenish', 'inventory:read'],
    store_id: storeId,
  };
  let sent = false;
  let dispatches = 0;
  const report = aReport({ district_store_id: storeId });
  await page.addInitScript((user) => {
    localStorage.setItem('clims.session', JSON.stringify({ token: 'browser-test', user }));
  }, user);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path === '/catalogue/products') data = [FEMALE];
    if (path === '/orders/stockouts')
      data = [{ ...report, status: sent ? 'awaiting_acknowledgement' : 'awaiting_supply' }];
    if (path === `/orders/stockouts/${report.id}/deliveries`) {
      expect(route.request().postDataJSON()).toMatchObject({
        lines: [{ condom_id: FEMALE.id, unit_of_measure_id: 'u-box', quantity: 2 }],
      });
      dispatches += 1;
      sent = true;
      data = { ...report, status: 'awaiting_acknowledgement' };
    }
    if (path === `/orders/stockouts/${report.id}`)
      data = {
        ...report,
        status: sent ? 'awaiting_acknowledgement' : 'awaiting_supply',
        deliveries: sent
          ? [
              {
                id: 'd1',
                created_at: '2026-11-23T07:00:00Z',
                note: null,
                lines: [
                  {
                    id: 'l1',
                    product: 'Engabu Female Free',
                    category: 'female',
                    quantity: 2,
                    pieces: 200,
                    acknowledged_pieces: null,
                    acknowledged_at: null,
                  },
                ],
              },
            ]
          : [],
      };
    if (path === '/inventory/store-summary')
      data = aStoreSummary({
        store_id: storeId,
        store_type: 'district',
        products: [aProductSummary({ usable: sent ? 3 : 5 })],
      });
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/dcfp/stockouts');
  await expect(page.getByRole('link', { name: 'Dispatch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Kisenyi Landing' }).click();
  await page.getByRole('menuitem', { name: 'Dispatch to hotspot' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dispatch to hotspots' })).toBeVisible();
  await page.getByRole('button', { name: 'Dispatch to Kisenyi Landing' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: /Female/ }).fill('2');
  await dialog.getByRole('button', { name: 'Record dispatch' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('200 pieces sent')).toBeVisible();
  await expect(page.getByText('3 box', { exact: true })).toBeVisible();
  expect(dispatches).toBe(1);

  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily),
  ).toContain('IBM Plex Sans');
  expect(await page.evaluate(() => document.fonts.check('400 14px "IBM Plex Sans"'))).toBe(true);
  await page.screenshot({ path: 'test-results/hotspot-dispatch-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1, name: 'Dispatch to hotspots' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/hotspot-dispatch-mobile.png', fullPage: true });
});
