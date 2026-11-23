// Local development check: signs in to the local MoH portal and inspects the home page tiles.
//
//   SSO_CHECK_PASSWORD=... node dev/sso-browser-checks/portal-home.mjs <screenshot-dir>
import { chromium } from '@playwright/test';
import { required, screenshotDir } from './env.mjs';

const portal = process.env.SSO_CHECK_PORTAL_ORIGIN ?? 'http://localhost:3000';
const user = process.env.SSO_CHECK_PORTAL_USER ?? 'clims-sso-linked';
const password = required('SSO_CHECK_PASSWORD');
const shots = screenshotDir();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${portal}/`);
await page.waitForSelector('#username', { timeout: 60000 });
await page.fill('#username', user);
await page.fill('#password', password);
await page.click('#kc-login');
await page.waitForURL((u) => u.origin === new URL(portal).origin, { timeout: 60000 });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
console.log('portal url', page.url());
await page.screenshot({ path: `${shots}/portal-home.png`, fullPage: true });
const tiles = await page.locator('text=CLIMS').count();
console.log('CLIMS mentions', tiles);
await browser.close();
