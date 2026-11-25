// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { deserializeSecret, serializeSecret } from './secret-codec';

describe('secret payload serialization', () => {
  it('serializes fields in a stable order', () => {
    expect(serializeSecret({ username: 'alice', password: 'secret' })).toBe(
      '{\n  "password": "secret",\n  "username": "alice"\n}',
    );
  });

  it('round-trips the secret payload', () => {
    const secret = {
      username: 'alice',
      password: 'secret',
      uri: 'https://example.test',
      notes: 'work',
    };

    expect(deserializeSecret(serializeSecret(secret))).toEqual(secret);
  });
});
