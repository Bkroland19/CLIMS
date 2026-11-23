import { expect, test } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './support/axe';
import { resetMock } from './support/mock';
import { choose, open } from './support/ui';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('catalogue filters combine, sort and remain usable on a phone', async ({ page }, testInfo) => {
  await open(page, '/moh/catalogue', 'Product catalogue');
  const table = page.getByRole('table', { name: 'Products' });
  await expect(table.getByRole('row')).toHaveCount(9);
  await page.getByRole('button', { name: /^Filters.*for products$/ }).click();
  await choose(page, 'Column', 'Category');
  await page.getByRole('checkbox', { name: 'Female', exact: true }).check();
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await page.getByRole('button', { name: /^Filters.*for products$/ }).click();
  await choose(page, 'Column', 'Condoms per unit');
  await page.getByRole('textbox', { name: /Minimum/ }).fill('10');
  await page.getByRole('textbox', { name: /Minimum/ }).press('Enter');
  await expect(table.getByRole('row')).toHaveCount(2);
  await table.getByRole('button', { name: 'Condoms per unit', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Condoms per unit' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await page.getByRole('button', { name: 'View options for products' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Category' }).click();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader', { name: 'Category' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Category: .*Remove filter$/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search products', exact: true }).fill('FC2');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expectNoSeriousA11yViolations(page, testInfo, 'filtered-catalogue');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('catalogue-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Filters.*for products$/ }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter products' });
  await expect(filterDialog).toBeVisible();
  await choose(page, 'Column', 'Condoms per unit');
  await page.getByRole('textbox', { name: /Maximum/ }).fill('5');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(filterDialog.getByRole('alert')).toHaveText(
    'The maximum must be at least the minimum.',
  );
  await expectNoSeriousA11yViolations(page, testInfo, 'mobile-filter-validation');
  await page.screenshot({
    path: testInfo.outputPath('catalogue-mobile-filter.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear all filters' }).click();
  await expect(table.getByRole('row')).toHaveCount(9);
  await page.getByRole('combobox', { name: 'Rows per page' }).click();
  await page.getByRole('option', { name: '25', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Rows per page' })).toContainText('25');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('catalogue-mobile.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(table.getByRole('button', { name: 'Brand', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Filters.*for products$/ })).toBeHidden();
});
