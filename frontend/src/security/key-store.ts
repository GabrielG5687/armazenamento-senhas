const DB_NAME = 'SecureVault';const STORE_NAME = 'keystore';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const MEMORY_TTL_MS = 15 * 60 * 1000; // 15 min

let privateKeyInMemory: string | null = null;
let privateKeyExpiresAt: number = 0;

export interface KeyStoreEntry {
  id: string;
  privateKeyArmored: string;
  publicKeyArmored: string;
  fingerprint: string;
  createdAt: number;
}

export async function saveKey(entry: KeyStoreEntry): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getKey(fingerprint: string): Promise<KeyStoreEntry | null> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  // IndexedDB não tem índice por fingerprint aqui; usa getAll e filtra.
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const found = req.result.find((e: KeyStoreEntry) => e.fingerprint === fingerprint);
      resolve(found ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listKeys(): Promise<KeyStoreEntry[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeKey(fingerprint: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise<KeyStoreEntry[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const target = all.find((e) => e.fingerprint === fingerprint);
  if (target) {
    store.delete(target.id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export function setPrivateKeyInMemory(privateKeyArmored: string, ttlMs = MEMORY_TTL_MS) {
  privateKeyInMemory = privateKeyArmored;
  privateKeyExpiresAt = Date.now() + ttlMs;
}

export function getPrivateKeyInMemory(): string | null {
  if (!privateKeyInMemory || Date.now() > privateKeyExpiresAt) {
    privateKeyInMemory = null;
    return null;
  }
  return privateKeyInMemory;
}

export function clearPrivateKeyInMemory() {
  privateKeyInMemory = null;
  privateKeyExpiresAt = 0;
}

export function isPrivateKeyInMemory(): boolean {
  return getPrivateKeyInMemory() !== null;
}

export { MEMORY_TTL_MS };
