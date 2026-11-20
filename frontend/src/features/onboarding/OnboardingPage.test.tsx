import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { usePathname } from 'next/navigation';

import OnboardingRoute from '@/app/onboarding/page';
import SignInRoute from '@/app/sign-in/page';
import { SIGN_IN_PATH } from '@/navigation/paths';
import type { FakeReply, RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';

const TOKEN = 'demo-vht-2c7f9a41';
const BASE = `/auth/invitations/${TOKEN}`;

const invitation = {
  status: 'pending',
  firstname: 'Joseph',
  lastname: 'Ssemwogerere',
  email: null,
  roles: ['VHT', 'Hotspot manager'],
  area: 'Katabi TC & Kajjansi TC · Wakiso',
  hotspots: ['Kasenyi Landing Site', 'Bwebajja Nite Spot'],
  invited_by: 'Sarah Namubiru (Wakiso DCFP)',
  requires_number_plate: false,
  expires_at: '2026-12-31T21:00:00Z',
};

interface Answer {
  status: number;
  body: unknown;
}

const ok = (data: unknown): Answer => ({
  status: 200,
  body: { success: true, message: 'ok', data },
});
const invalid = (error: Record<string, string[]>): Answer => ({
  status: 422,
  body: { success: false, message: 'validation failed', error },
});
const codeSent = (resendAfter = 45) =>
  ok({ resend_after_seconds: resendAfter, expires_in_seconds: 600 });

type Handlers = Partial<Record<string, (request: RecordedRequest) => Answer>>;

/** Answers the invitation lookup with `lookup`, and each POST by its last path segment. */
function api(handlers: Handlers = {}, lookup: Answer = ok(invitation)): FakeReply {
  return (request) => {
    if (request.method === 'GET' && request.url === BASE) return lookup;
    const action = request.url.slice(BASE.length + 1);
    const handler = handlers[action];
    if (request.method === 'POST' && request.url.startsWith(`${BASE}/`) && handler) {
      return handler(request);
    }
    return { status: 404, body: { success: false, message: 'Not found' } };
  };
}

const posts = (requests: RecordedRequest[]) =>
  requests
    .filter((request) => request.method === 'POST')
    .map(({ url, body, authorization }) => ({ url, body, authorization }));

/*
 * The two public pages, routed by the test router's address. Narrower than
 * `AppUnderTest`: onboarding never enters the signed-in app, so these tests
 * do not load (or depend on) every page in it.
 */
function PublicPages() {
  return usePathname() === SIGN_IN_PATH ? <SignInRoute /> : <OnboardingRoute />;
}

function renderOnboarding(route: string, reply: FakeReply, signedIn = false) {
  return renderApp(<PublicPages />, { route, replies: [reply], signedIn });
}

describe('onboarding', () => {
  it('activates an invitation step by step and lands on sign-in', async () => {
    const user = userEvent.setup();
    const { requests } = renderOnboarding(
      `/onboarding?invite=${TOKEN}`,
      api({
        code: () => codeSent(),
        verify: () => ok({ activation_token: 'act-1' }),
        password: () => ok(null),
        activate: () => ok({ email: 'joseph@example.org' }),
      }),
    );

    // Step 1: phone, typed the local way.
    expect(
      await screen.findByRole('heading', { name: 'Activate your account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sarah Namubiru \(Wakiso DCFP\) added you to CLIMS/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The invitations and SMS codes on this page are illustrative/),
    ).toBeInTheDocument();
    expect(testRouter.location).toBe(`/onboarding?invite=${TOKEN}&step=phone`);
    await user.type(screen.getByLabelText('Phone number'), '0776 902331');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));

    // Step 2: the SMS code.
    const codeHeading = await screen.findByRole('heading', { name: 'Enter the code we sent' });
    expect(codeHeading).toHaveFocus();
    expect(screen.getByText('A 6-digit code went by SMS to +256 776 902 331.')).toBeInTheDocument();
    expect(testRouter.location).toBe(`/onboarding?invite=${TOKEN}&step=code`);
    expect(screen.getByText(/You can ask for a new code in 0:4\d/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('6-digit code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    // Step 3: the password, with its rules checked as it is typed.
    expect(await screen.findByRole('heading', { name: 'Create a password' })).toHaveFocus();
    const rules = screen.getByRole('list', { name: 'Password rules' });
    expect(within(rules).getByText('At least 8 characters')).toHaveTextContent('Not yet:');
    await user.type(screen.getByLabelText('Password'), 'mango2026');
    expect(within(rules).getByText('At least 8 characters')).toHaveTextContent('Done:');
    expect(within(rules).getByText('Includes a number')).toHaveTextContent('Done:');
    expect(within(rules).getByText('Both passwords match')).toHaveTextContent('Not yet:');
    await user.type(screen.getByLabelText('Confirm password'), 'mango2026');
    expect(within(rules).getByText('Both passwords match')).toHaveTextContent('Done:');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4: details, prefilled from the invitation.
    expect(await screen.findByRole('heading', { name: 'Check your details' })).toHaveFocus();
    expect(screen.getByLabelText('First name')).toHaveValue('Joseph');
    expect(screen.getByLabelText('Last name')).toHaveValue('Ssemwogerere');
    expect(screen.getByText('VHT, Hotspot manager')).toBeInTheDocument();
    expect(screen.getByText('Kasenyi Landing Site, Bwebajja Nite Spot')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motorbike number plate')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Tick the box to agree before you continue.')).toBeInTheDocument();
    expect(posts(requests)).toHaveLength(3);

    await user.type(screen.getByLabelText('Email'), 'joseph@example.org');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the CLIMS terms of use/ }));
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    // Finished: sign in with the real login, which says the account is ready.
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Your account is active')).toBeInTheDocument();
    expect(testRouter.location).toBe('/sign-in?activated=1');

    expect(posts(requests)).toEqual([
      { url: `${BASE}/code`, body: { phone: '+256776902331' }, authorization: null },
      {
        url: `${BASE}/verify`,
        body: { phone: '+256776902331', code: '123456' },
        authorization: null,
      },
      {
        url: `${BASE}/password`,
        body: { activation_token: 'act-1', password: 'mango2026' },
        authorization: null,
      },
      {
        url: `${BASE}/activate`,
        body: {
          activation_token: 'act-1',
          firstname: 'Joseph',
          lastname: 'Ssemwogerere',
          email: 'joseph@example.org',
          number_plate: null,
          accepted_terms: true,
        },
        authorization: null,
      },
    ]);
  });

  it('shows wrong numbers and wrong or expired codes beside the field, keeping what was typed', async () => {
    const user = userEvent.setup();
    let phoneAttempts = 0;
    let codeAttempts = 0;
    const { requests } = renderOnboarding(
      `/onboarding?invite=${TOKEN}`,
      api({
        code: () => {
          phoneAttempts += 1;
          return phoneAttempts === 1
            ? invalid({ phone: ['This is not the number the invitation was sent to.'] })
            : codeSent(0);
        },
        verify: () => {
          codeAttempts += 1;
          return codeAttempts === 1
            ? invalid({ code: ["That code doesn't match. Check the SMS and try again."] })
            : invalid({ code: ['That code has expired. Ask for a new one.'] });
        },
      }),
    );

    await screen.findByRole('heading', { name: 'Activate your account' });
    const phone = screen.getByLabelText('Phone number');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByText('Enter your phone number.')).toBeInTheDocument();
    await user.type(phone, '0412 123456');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(
      await screen.findByText('Enter a Ugandan mobile number, e.g. +256 772 123 456.'),
    ).toBeInTheDocument();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);

    await user.clear(phone);
    await user.type(phone, '+256 772 000 111');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    // Announced: the field's error is an alert.
    expect(
      await screen.findByText('This is not the number the invitation was sent to.'),
    ).toHaveAttribute('role', 'alert');
    expect(phone).toHaveValue('+256 772 000 111');
    expect(phone).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    await screen.findByRole('heading', { name: 'Enter the code we sent' });

    const code = screen.getByLabelText('6-digit code');
    await user.type(code, '111111');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(
      await screen.findByText("That code doesn't match. Check the SMS and try again."),
    ).toHaveAttribute('role', 'alert');
    expect(code).toHaveValue('111111');
    expect(code).toHaveAccessibleDescription(/That code doesn't match/);

    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(
      await screen.findByText('That code has expired. Ask for a new one.'),
    ).toBeInTheDocument();

    // The resend wait is over (the server said 0 seconds), so a new code can be asked for.
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('We sent a new code to +256 772 000 111.')).toBeInTheDocument();
    expect(screen.queryByText('That code has expired. Ask for a new one.')).not.toBeInTheDocument();
    expect(posts(requests).map((request) => request.url)).toEqual([
      `${BASE}/code`,
      `${BASE}/code`,
      `${BASE}/verify`,
      `${BASE}/verify`,
      `${BASE}/code`,
    ]);
  });

  it('asks a rider for their number plate', async () => {
    const user = userEvent.setup();
    const { requests } = renderOnboarding(
      `/onboarding?invite=${TOKEN}`,
      api(
        {
          code: () => codeSent(),
          verify: () => ok({ activation_token: 'act-9' }),
          password: () => ok(null),
          activate: () => invalid({ email: ['That email is already used by another account.'] }),
        },
        ok({
          ...invitation,
          roles: ['Delivery agent'],
          hotspots: [],
          email: 'musa@example.org',
          requires_number_plate: true,
        }),
      ),
    );

    await screen.findByRole('heading', { name: 'Activate your account' });
    await user.type(screen.getByLabelText('Phone number'), '701334920');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await user.type(await screen.findByLabelText('Password'), 'mango2026');
    await user.type(screen.getByLabelText('Confirm password'), 'mango2026');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByRole('heading', { name: 'Check your details' });
    expect(screen.getByLabelText('Email')).toHaveValue('musa@example.org');
    expect(screen.queryByText('Hotspots you cover')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Motorbike number plate'), 'ufb 412k');
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    // The server's field error is shown beside the email, and the form keeps its input.
    expect(
      await screen.findByText('That email is already used by another account.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Motorbike number plate')).toHaveValue('ufb 412k');
    expect(testRouter.pathname).toBe('/onboarding');
    expect(posts(requests).at(-1)?.body).toMatchObject({ number_plate: 'UFB 412K' });
  });

  it('starts at the first unfinished step when a link names a later one', async () => {
    renderOnboarding(`/onboarding?invite=${TOKEN}&step=details`, api());
    expect(
      await screen.findByRole('heading', { name: 'Activate your account' }),
    ).toBeInTheDocument();
    expect(testRouter.location).toBe(`/onboarding?invite=${TOKEN}&step=phone`);
  });

  it('opens for a visitor who is already signed in', async () => {
    renderOnboarding(`/onboarding?invite=${TOKEN}`, api(), true);
    expect(
      await screen.findByRole('heading', { name: 'Activate your account' }),
    ).toBeInTheDocument();
  });
});

describe('onboarding with an invitation that cannot be used', () => {
  it.each([['/onboarding'], ['/onboarding?invite=not%20a%20token'], ['/onboarding?invite=abc']])(
    'explains that the link at %s is not complete, without asking the server',
    async (route) => {
      const { requests } = renderOnboarding(route, api());
      expect(
        await screen.findByRole('heading', { name: 'This invitation link is not complete' }),
      ).toBeInTheDocument();
      expect(requests).toHaveLength(0);
    },
  );

  it('says when the invitation does not exist', async () => {
    renderOnboarding(
      `/onboarding?invite=${TOKEN}`,
      api({}, { status: 404, body: { success: false, message: 'invitation not found' } }),
    );
    expect(
      await screen.findByRole('heading', { name: "We can't find this invitation" }),
    ).toBeInTheDocument();
  });

  it('says when the invitation has expired, and who can send a new one', async () => {
    renderOnboarding(
      `/onboarding?invite=${TOKEN}`,
      api({}, ok({ ...invitation, status: 'expired' })),
    );
    expect(
      await screen.findByRole('heading', { name: 'This invitation has expired' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ask Sarah Namubiru \(Wakiso DCFP\) to send you a new one/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
  });

  it('sends a used invitation to sign-in', async () => {
    const user = userEvent.setup();
    renderOnboarding(`/onboarding?invite=${TOKEN}`, api({}, ok({ ...invitation, status: 'used' })));
    expect(
      await screen.findByRole('heading', { name: 'This invitation has already been used' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
