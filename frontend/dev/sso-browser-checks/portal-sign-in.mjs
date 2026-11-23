// Local development check: drives CLIMS portal sign-in in Chromium against a local Keycloak for a
// linked, an unlinked and a role-less test user, and prints where each ended up.
//
//   SSO_CHECK_PASSWORD=... node dev/sso-browser-checks/portal-sign-in.mjs <screenshot-dir>
import { chromium } from '@playwright/test';
import { required, screenshotDir } from './env.mjs';

const origin = process.env.SSO_CHECK_CLIMS_ORIGIN ?? 'http://localhost:3014';
const password = required('SSO_CHECK_PASSWORD');
const users = (
  process.env.SSO_CHECK_USERS ?? 'clims-sso-linked,clims-sso-unlinked,clims-sso-norole'
).split(',');
const shots = screenshotDir();

const browser = await chromium.launch();
for (const user of users) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${origin}/api/v1/auth/sso/start`);
  await page.fill('#username', user);
  await page.fill('#password', password);
  await page.click('#kc-login');
  await page.waitForURL((u) => u.pathname === '/moh' || u.pathname === '/sign-in', {
    timeout: 60000,
  });
  await page.waitForLoadState('networkidle');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('clims.session') ?? 'null'),
  );
  const alert = await page
    .locator('[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);
  console.log(
    JSON.stringify({ user, url: page.url(), sessionUser: stored?.user?.username ?? null, alert }),
  );
  await page.screenshot({ path: `${shots}/${user}.png` });
}
await browser.close();
