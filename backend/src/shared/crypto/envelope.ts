import { createHash } from 'node:crypto';

export const PGP_MESSAGE_BEGIN = '-----BEGIN PGP MESSAGE-----';
export const PGP_MESSAGE_END = '-----END PGP MESSAGE-----';
export const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';

export interface EnvelopeLike {
  armoredMessage: string;
  checksum: string;
  keyFingerprint: string;
}

export interface EnvelopeValidationOptions {
  maxBytes: number;
  expectedFingerprint?: string;
}

export type EnvelopeValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checksumOf(armoredMessage: string): string {
  return `sha256:${createHash('sha256').update(armoredMessage, 'utf8').digest('hex')}`;
}

export function isArmoredMessage(armoredMessage: unknown): armoredMessage is string {
  if (typeof armoredMessage !== 'string') {
    return false;
  }
  const trimmed = armoredMessage.trim();
  return (
    trimmed.startsWith(PGP_MESSAGE_BEGIN) &&
    trimmed.endsWith(PGP_MESSAGE_END) &&
    !trimmed.includes(PGP_PRIVATE_KEY_BEGIN)
  );
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function validateEnvelopeShape(
  envelope: EnvelopeLike,
  options: EnvelopeValidationOptions,
): EnvelopeValidationResult {
  if (!isArmoredMessage(envelope.armoredMessage)) {
    return { ok: false, reason: 'INVALID_ARMOR' };
  }
  if (byteLength(envelope.armoredMessage) > options.maxBytes) {
    return { ok: false, reason: 'ENVELOPE_TOO_LARGE' };
  }
  if (!envelope.keyFingerprint || envelope.keyFingerprint.trim().length < 8) {
    return { ok: false, reason: 'INVALID_FINGERPRINT' };
  }
  if (options.expectedFingerprint && envelope.keyFingerprint !== options.expectedFingerprint) {
    return { ok: false, reason: 'FINGERPRINT_MISMATCH' };
  }
  if (envelope.checksum !== checksumOf(envelope.armoredMessage)) {
    return { ok: false, reason: 'CHECKSUM_MISMATCH' };
  }
  return { ok: true };
}