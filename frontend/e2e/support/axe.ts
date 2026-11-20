import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

const BLOCKING = new Set(['serious', 'critical']);

/**
 * Runs axe (WCAG 2.2 A and AA rules) on the page as it is now. Serious and critical violations fail
 * the test; minor and moderate ones are attached to the report as `axe-<name>.json` and printed,
 * so they can be listed without blocking.
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Toasts come and go while axe runs; they are checked where a test waits for one.
    .exclude('[data-sonner-toaster]')
    .analyze();

  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
    html: violation.nodes.slice(0, 3).map((node) => node.html.slice(0, 200)),
    count: violation.nodes.length,
  }));
  await testInfo.attach(`axe-${name}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  for (const item of summary.filter((entry) => !BLOCKING.has(entry.impact))) {
    console.warn(`[axe ${name}] ${item.impact} ${item.id} (${item.count}): ${item.help}`);
  }

  const blocking = summary.filter((entry) => BLOCKING.has(entry.impact));
  expect(blocking, `Serious or critical accessibility violations on ${name}`).toEqual([]);
}
