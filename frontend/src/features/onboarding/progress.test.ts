import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '@/lib/storage/jsonStorage';

import {
  clearProgress,
  onboardingHref,
  reachableStep,
  readProgress,
  secondsUntilResend,
  writeProgress,
  type OnboardingProgress,
} from './progress';

const sent: OnboardingProgress = {
  invite: 'demo-vht-2c7f9a41',
  phone: '+256776902331',
  code_sent_at: 1_000_000,
  resend_after_seconds: 45,
  activation_token: null,
  password_set: false,
};
const verified: OnboardingProgress = { ...sent, activation_token: 'act-1' };
const withPassword: OnboardingProgress = { ...verified, password_set: true };

describe('reachableStep', () => {
  it('opens only the phone step before a code is sent', () => {
    expect(reachableStep('details', null)).toBe('phone');
    expect(reachableStep('phone', null)).toBe('phone');
  });

  it('opens the step asked for once the steps before it are done', () => {
    expect(reachableStep('code', sent)).toBe('code');
    expect(reachableStep('password', sent)).toBe('code');
    expect(reachableStep('password', verified)).toBe('password');
    expect(reachableStep('details', verified)).toBe('password');
    expect(reachableStep('details', withPassword)).toBe('details');
  });

  it('lets the visitor go back to an earlier step', () => {
    expect(reachableStep('phone', withPassword)).toBe('phone');
  });
});

describe('stored progress', () => {
  it('reads back what was written, for the same invitation only', () => {
    const storage = createMemoryStorage();
    writeProgress(storage, verified);
    expect(readProgress(storage, sent.invite)).toEqual(verified);
    expect(readProgress(storage, 'another-invite')).toBeNull();
    clearProgress(storage);
    expect(readProgress(storage, sent.invite)).toBeNull();
  });

  it('ignores a stored value of the wrong shape', () => {
    const storage = createMemoryStorage({
      'clims.onboarding': JSON.stringify({ invite: sent.invite, phone: 7 }),
    });
    expect(readProgress(storage, sent.invite)).toBeNull();
  });
});

describe('secondsUntilResend', () => {
  it('counts down to zero and stays there', () => {
    expect(secondsUntilResend(sent, 1_000_000)).toBe(45);
    expect(secondsUntilResend(sent, 1_000_000 + 44_100)).toBe(1);
    expect(secondsUntilResend(sent, 1_000_000 + 45_000)).toBe(0);
    expect(secondsUntilResend(sent, 1_000_000 + 90_000)).toBe(0);
  });
});

it('builds the address of a step', () => {
  expect(onboardingHref('demo-vht-2c7f9a41', 'code')).toBe(
    '/onboarding?invite=demo-vht-2c7f9a41&step=code',
  );
});
