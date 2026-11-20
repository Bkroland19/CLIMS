import { expect, type Page } from '@playwright/test';

/** Waits for a success toast with exactly this text. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toaster]').getByText(text)).toBeVisible();
}

/** Opens a Radix select by its label and chooses an option by its visible name. */
export async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Opens a page and waits for its heading, so the route has compiled and its data has loaded. */
export async function open(page: Page, path: string, heading: string | RegExp): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}
