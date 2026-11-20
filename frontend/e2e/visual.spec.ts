import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { resetMock } from './support/mock';
import { routesToVisit } from './support/routes';

/*
 * Every route at phone, tablet and desktop width, in light and dark: no horizontal page scroll,
 * and a full-page screenshot of each for a person to look at.
 *
 *   E2E_SCREENS_DIR=<folder> npm run test:e2e -- --project=visual
 *
 * Screenshots are named `<route>-<width>-<theme>.png` (default folder `test-results/screens`).
 * Dark mode is the app's own stored choice (`clims.theme`), since it never follows the OS.
 */

const SCREENS_DIR = process.env.E2E_SCREENS_DIR ?? join('test-results', 'screens');
const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;
const THEMES = ['light', 'dark'] as const;

async function settle(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function checkAndCapture(
  page: Page,
  path: string,
  heading: string,
  slug: string,
): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((value) => {
      window.localStorage.setItem('clims.theme', JSON.stringify(value));
    }, theme);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await settle(page, heading);
      await expect(page.locator('html')).toHaveClass(
        theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
      );

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect
        .soft(
          overflow.scrollWidth,
          `${path} scrolls sideways at ${viewport.width}px (${theme}): page is ${overflow.scrollWidth}px wide`,
        )
        .toBeLessThanOrEqual(overflow.innerWidth);

      await page.screenshot({
        path: join(SCREENS_DIR, `${slug}-${viewport.width}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
}

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

for (const route of routesToVisit()) {
  test(`${route.path} fits every width in light and dark`, async ({ page }) => {
    // The first visit sets the origin, so the theme can be stored before the real visits.
    await page.goto('/sign-in');
    await checkAndCapture(page, route.path, route.heading, route.slug);
  });
}

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/sign-in fits every width in light and dark', async ({ page }) => {
    await page.goto('/sign-in');
    await checkAndCapture(page, '/sign-in', 'Sign in', 'sign-in');
  });

  test('/onboarding fits every width in light and dark', async ({ page }) => {
    await page.goto('/sign-in');
    await checkAndCapture(
      page,
      '/onboarding?invite=demo-vht-2c7f9a41',
      'Activate your account',
      'onboarding',
    );
  });
});
