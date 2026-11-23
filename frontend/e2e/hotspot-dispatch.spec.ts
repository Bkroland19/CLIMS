import { expect, test } from '@playwright/test';

import { aReport, FEMALE } from '../src/test/dcfpFixtures';
import { aProductSummary, aStoreSummary } from '../src/test/warehouseOrderFixtures';

// Browser-local API replies exercise the real shell without dispatching development stock.
test('opens a stockout request, sends stock from it and shows it on its way', async ({ page }) => {
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
        // Far from expiry, so no short-expiry reason is asked for.
        products: [aProductSummary({ usable: sent ? 3 : 5, next_expiry: '2028-06-30' })],
      });
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/dcfp/stockouts');
  await page.getByRole('link', { name: 'Manage Kisenyi Landing' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stockout request' })).toBeVisible();
  await expect(page.getByText('Kisenyi Landing is out of female condoms')).toBeVisible();
  await page.getByRole('textbox', { name: 'Engabu · Female · Free' }).fill('2');
  await page.getByRole('button', { name: 'Send 200 pieces' }).click();
  await expect(page.getByText('Stock is on its way')).toBeVisible();
  await expect(page.getByText(/Sent 200 pieces/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send more stock' })).toBeVisible();
  expect(dispatches).toBe(1);

  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily),
  ).toContain('IBM Plex Sans');
  expect(await page.evaluate(() => document.fonts.check('400 14px "IBM Plex Sans"'))).toBe(true);
  await page.screenshot({ path: 'test-results/hotspot-dispatch-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1, name: 'Stockout request' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/hotspot-dispatch-mobile.png', fullPage: true });
});
