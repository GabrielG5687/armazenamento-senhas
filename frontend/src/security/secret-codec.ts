import { encryptFor, decryptWith, FORMAT_VERSION, fingerprintOf } from './openpgp';
import { getPrivateKeyInMemory } from './key-store';

export interface SecretPayload {
  username?: string;
  password?: string;
  uri?: string;
  notes?: string;
  [key: string]: unknown;
}

export function serializeSecret(secret: SecretPayload): string {
  const ordered: Record<string, unknown> = {};
  Object.keys(secret)
    .sort()
    .forEach((k) => {
      ordered[k] = secret[k];
    });
  return JSON.stringify(ordered, null, 2);
}

export function deserializeSecret(serialized: string): SecretPayload {
  return JSON.parse(serialized) as SecretPayload;
}

export async function encryptSecretForRecipients(
  secret: SecretPayload,
  recipientPublicKeysArmored: string[],
  signerPrivateKeyArmored?: string,
  signerPassphrase?: string,
) {
  const serialized = serializeSecret(secret);
  const result = await encryptFor(serialized, recipientPublicKeysArmored, signerPrivateKeyArmored, signerPassphrase);
  return {
    ...result,
    formatVersion: FORMAT_VERSION,
  };
}

export async function decryptSecret(
  armoredMessage: string,
  passphrase: string,
  privateKeyArmored?: string | null,
) {
  const privateKey = privateKeyArmored || getPrivateKeyInMemory();
  if (!privateKey) {
    throw new Error('Chave privada não está desbloqueada na memória');
  }

  const result = await decryptWith(armoredMessage, privateKey, passphrase);
  return {
    ...result,
    secret: deserializeSecret(result.decrypted),
  };
}

export { FORMAT_VERSION };
