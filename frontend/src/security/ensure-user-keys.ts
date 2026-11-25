import { http } from '@/services/http';
import { generateKeyPair, fingerprintOf } from './openpgp';
import { listKeys, saveKey, type KeyStoreEntry } from './key-store';

export interface UserCryptoKeys {
  userId: string;
  fingerprint: string;
  publicKeyArmored: string;
  privateKeyArmored: string | null;
}

interface RemoteKey {
  userId: string;
  fingerprint: string;
  armoredPublicKey: string;
}

async function fetchRemoteKeys(userId: string): Promise<RemoteKey[]> {
  const res = await http.get<RemoteKey[]>('/users/keys', {
    params: { ids: userId },
  });
  return res.data;
}

export async function ensureUserKeys(
  userId: string,
  email?: string | null,
): Promise<UserCryptoKeys> {
  const remoteKeys = await fetchRemoteKeys(userId);
  const localKeys = await listKeys();

  if (remoteKeys.length > 0) {
    const remote = remoteKeys[0];
    const local = localKeys.find((k) => k.fingerprint === remote.fingerprint) ?? null;
    return {
      userId,
      fingerprint: remote.fingerprint,
      publicKeyArmored: remote.armoredPublicKey,
      privateKeyArmored: local?.privateKeyArmored ?? null,
    };
  }

  const existingLocal = localKeys[0];
  if (existingLocal) {
    await http.post(`/users/${userId}/keys`, {
      armoredPublicKey: existingLocal.publicKeyArmored,
    });
    return {
      userId,
      fingerprint: existingLocal.fingerprint,
      publicKeyArmored: existingLocal.publicKeyArmored,
      privateKeyArmored: existingLocal.privateKeyArmored,
    };
  }

  const userIdForKey = email?.includes('@') ? email : `${userId}@securevault.local`;
  const pair = await generateKeyPair('', userIdForKey);
  const fingerprint = pair.fingerprint || (await fingerprintOf(pair.publicKeyArmored));
  const entry: KeyStoreEntry = {
    id: crypto.randomUUID(),
    privateKeyArmored: pair.privateKeyArmored,
    publicKeyArmored: pair.publicKeyArmored,
    fingerprint,
    createdAt: Date.now(),
  };
  await saveKey(entry);
  await http.post(`/users/${userId}/keys`, {
    armoredPublicKey: pair.publicKeyArmored,
  });

  return {
    userId,
    fingerprint,
    publicKeyArmored: pair.publicKeyArmored,
    privateKeyArmored: pair.privateKeyArmored,
  };
}
