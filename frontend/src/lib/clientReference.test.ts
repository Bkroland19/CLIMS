import { afterEach, describe, expect, it } from 'vitest';

import { newClientReference } from './clientReference';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const randomUUID = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');

describe('newClientReference', () => {
  afterEach(() => {
    if (randomUUID) Object.defineProperty(crypto, 'randomUUID', randomUUID);
    else Reflect.deleteProperty(crypto, 'randomUUID');
  });

  it('makes a v4 UUID where the browser offers crypto.randomUUID', () => {
    expect(newClientReference()).toMatch(UUID_V4);
  });

  it('still makes a v4 UUID on a plain HTTP origin, where randomUUID is missing', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const first = newClientReference();
    expect(first).toMatch(UUID_V4);
    expect(newClientReference()).not.toBe(first);
  });
});
