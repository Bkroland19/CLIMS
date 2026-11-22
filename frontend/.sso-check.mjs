// Temporary: drives CLIMS portal sign-in in Chromium against the local Keycloak.
import { chromium } from '@playwright/test';
const origin = 'http://localhost:3014';
const shots = process.argv[2];
const browser = await chromium.launch();
for (const user of ['clims-sso-linked', 'clims-sso-unlinked', 'clims-sso-norole']) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${origin}/api/v1/auth/sso/start`);
  await page.fill('#username', user);
  await page.fill('#password', process.env.SSO_CHECK_PASSWORD);
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
