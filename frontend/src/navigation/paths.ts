export const SIGN_IN_PATH = '/sign-in';

/** Account activation from an invitation link: `/onboarding?invite=<token>&step=<step>`. */
export const ONBOARDING_PATH = '/onboarding';

/** Where the API sends the browser after portal sign-in, to claim the session it started. */
export const SSO_COMPLETE_PATH = '/sso/complete';

/** Set on the sign-in address when portal sign-in fails, with the reason. */
export const SSO_ERROR_PARAM = 'sso_error';

/**
 * Pages outside the signed-in `(app)` group. They have no entry in the
 * navigation table, because they have no place in the sidebar.
 */
export const PUBLIC_PATHS: readonly string[] = [SIGN_IN_PATH, ONBOARDING_PATH, SSO_COMPLETE_PATH];

/** Set on the sign-in address after an invitation is activated, to say so there. */
export const ACTIVATED_PARAM = 'activated';

/** Where a signed-in user lands when they have no specific destination. */
export const HOME_PATH = '/moh';
