// Temporary: signs in to the local portal and inspects the home page tiles.
import { chromium } from '@playwright/test';
const shots = process.argv[2];
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://localhost:3000/');
await page.waitForSelector('#username', { timeout: 60000 });
await page.fill('#username', 'clims-sso-linked');
await page.fill('#password', process.env.SSO_CHECK_PASSWORD);
await page.click('#kc-login');
await page.waitForURL((u) => u.host === 'localhost:3000', { timeout: 60000 });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
console.log('portal url', page.url());
await page.screenshot({ path: `${shots}/portal-home.png`, fullPage: true });
const tiles = await page.locator('text=CLIMS').count();
console.log('CLIMS mentions', tiles);
await browser.close();
