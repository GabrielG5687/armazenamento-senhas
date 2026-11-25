import {
  checksumOf,
  isArmoredMessage,
  validateEnvelopeShape,
} from '../../src/shared/crypto/envelope';

const ARMOR = `-----BEGIN PGP MESSAGE-----

hQEMA0000000000000000000000000000000000000000
=abcd
-----END PGP MESSAGE-----`;

describe('envelope validation', () => {
  it('accepts a well-formed envelope with a matching checksum', () => {
    const result = validateEnvelopeShape(
      {
        armoredMessage: ARMOR,
        checksum: checksumOf(ARMOR),
        keyFingerprint: 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234',
      },
      { maxBytes: 4096, expectedFingerprint: 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234' },
    );
    expect(result).toEqual({ ok: true });
  });

  it('rejects an invalid armor block', () => {
    expect(isArmoredMessage('not a pgp message')).toBe(false);
    const result = validateEnvelopeShape(
      {
        armoredMessage: 'plain text',
        checksum: checksumOf('plain text'),
        keyFingerprint: 'ABCD1234ABCD1234',
      },
      { maxBytes: 4096 },
    );
    expect(result).toEqual({ ok: false, reason: 'INVALID_ARMOR' });
  });

  it('rejects a checksum mismatch and fingerprint mismatch', () => {
    const checksumMismatch = validateEnvelopeShape(
      {
        armoredMessage: ARMOR,
        checksum: 'sha256:deadbeef',
        keyFingerprint: 'ABCD1234ABCD1234',
      },
      { maxBytes: 4096 },
    );
    expect(checksumMismatch).toEqual({ ok: false, reason: 'CHECKSUM_MISMATCH' });

    const fingerprintMismatch = validateEnvelopeShape(
      {
        armoredMessage: ARMOR,
        checksum: checksumOf(ARMOR),
        keyFingerprint: 'ABCD1234ABCD1234',
      },
      { maxBytes: 4096, expectedFingerprint: 'FFFFFFFF' },
    );
    expect(fingerprintMismatch).toEqual({ ok: false, reason: 'FINGERPRINT_MISMATCH' });
  });

  it('rejects envelopes above the configured size', () => {
    const result = validateEnvelopeShape(
      {
        armoredMessage: ARMOR,
        checksum: checksumOf(ARMOR),
        keyFingerprint: 'ABCD1234ABCD1234',
      },
      { maxBytes: 10 },
    );
    expect(result).toEqual({ ok: false, reason: 'ENVELOPE_TOO_LARGE' });
  });
});
