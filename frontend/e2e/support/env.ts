/** Where the end-to-end servers listen. Not 3000 or 8787, which local development usually holds. */
export const APP_PORT = 3100;
export const MOCK_PORT = 8797;

// `localhost`, not 127.0.0.1: `next dev` serves its dev resources only to its own host name.
export const APP_URL = `http://localhost:${APP_PORT}`;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

/** The signed-in browser state the setup project saves and the other projects start from. */
export const AUTH_FILE = 'e2e/.auth/admin.json';

/** The mock accepts any email with any password except "wrong". */
export const ADMIN = { email: 'sarah.nakato@example.org', password: 'correct horse battery' };
