import * as openpgp from 'openpgp';

export interface OpenPGPKeyPair {
  privateKeyArmored: string;
  publicKeyArmored: string;
  fingerprint: string;
}

export interface EncryptResult {
  encrypted: string;
  fingerprint: string;
  formatVersion: string;
}

export interface DecryptResult {
  decrypted: string;
  fingerprint: string;
}

const FORMAT_VERSION = 'sv1';
export const LOCAL_KEY_PASSPHRASE = 'securevault-local';

export async function generateKeyPair(passphrase: string, userId: string): Promise<OpenPGPKeyPair> {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId)
    ? userId
    : 'user@securevault.local';
  const name = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9._-]/g, '') || 'user';
  const result: any = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name, email }],
    passphrase: passphrase || LOCAL_KEY_PASSPHRASE,
    format: 'armored',
  });

  const publicKeyArmored = String(result.publicKey);
  const fingerprint =
    String(result.fingerprint ?? '') || (await fingerprintOf(publicKeyArmored));

  return {
    privateKeyArmored: String(result.privateKey),
    publicKeyArmored,
    fingerprint,
  };
}

export async function encryptFor(
  plaintext: string,
  publicKeysArmored: string[],
  signerPrivateKeyArmored?: string,
  signerPassphrase?: string,
): Promise<EncryptResult> {
  const publicKeys = await Promise.all(
    publicKeysArmored.map((k) => openpgp.readKey({ armoredKey: k })),
  );

  const encryptOptions: any = {
    message: await openpgp.createMessage({ text: plaintext }),
    encryptionKeys: publicKeys,
    format: 'armored',
  };

  if (signerPrivateKeyArmored && signerPassphrase) {
    const signerKey = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: signerPrivateKeyArmored }),
      passphrase: signerPassphrase,
    });
    encryptOptions.signingKeys = signerKey;
  }

  const encrypted = await openpgp.encrypt(encryptOptions);

  let fingerprint = '';
  try {
    const key = await openpgp.readKey({ armoredKey: publicKeysArmored[0] });
    fingerprint = (key as any).getFingerprint ? (key as any).getFingerprint() : '';
  } catch {
    fingerprint = '';
  }

  return {
    encrypted: String(encrypted),
    fingerprint,
    formatVersion: FORMAT_VERSION,
  };
}

export async function decryptWith(
  armoredMessage: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<DecryptResult> {
  let privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const needsUnlock =
    typeof privateKey.isDecrypted !== 'function' || !privateKey.isDecrypted();
  if (needsUnlock) {
    try {
      privateKey = await openpgp.decryptKey({
        privateKey,
        passphrase: passphrase || LOCAL_KEY_PASSPHRASE,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Algumas chaves locais já vêm sem proteção de passphrase.
      if (!/already decrypted/i.test(message)) {
        throw err;
      }
    }
  }

  const message = await openpgp.readMessage({ armoredMessage });
  const result: any = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
  });

  let decrypted = '';
  if (typeof result.data === 'string') {
    decrypted = result.data;
  } else if (typeof result.decrypted === 'string') {
    decrypted = result.decrypted;
  } else if (result.data?.text) {
    decrypted = await result.data.text();
  }

  const fingerprint = privateKey.getFingerprint?.() ?? '';

  return {
    decrypted: String(decrypted),
    fingerprint: String(fingerprint),
  };
}

export async function fingerprintOf(armoredKey: string): Promise<string> {
  const key = await openpgp.readKey({ armoredKey });
  return (key as any).getFingerprint ? (key as any).getFingerprint() : '';
}

export { FORMAT_VERSION };
