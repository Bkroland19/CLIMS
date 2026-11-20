import { expect, type APIRequestContext } from '@playwright/test';

import { MOCK_URL } from './env';

/**
 * Puts the mock API back to its seeded data (`POST /__reset`, in `dev/mock-api.mts`).
 * Call it before every test that changes data, so tests never depend on each other's order.
 */
export async function resetMock(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK_URL}/__reset`);
  expect(response.ok(), `The mock on ${MOCK_URL} did not reset; is it an old build?`).toBe(true);
}
