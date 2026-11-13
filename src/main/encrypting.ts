import { safeStorage } from 'electron';
import { plainTextCodec, type StorageCodec } from './storage/persistentJsonStore';

/**
 * Storage codec backed by Electron's safeStorage (macOS Keychain).
 * Files are written as base64 ciphertext; `decode` returns null for anything
 * that is not valid ciphertext so the store can migrate legacy plain files.
 *
 * Must be called after `app` is ready, because safeStorage needs the Keychain.
 */
export function createStorageCodec(): StorageCodec {
  if (!safeStorage.isEncryptionAvailable()) return plainTextCodec;
  return {
    encode: (json) => safeStorage.encryptString(json).toString('base64'),
    decode: (raw) => {
      try {
        return safeStorage.decryptString(Buffer.from(raw, 'base64'));
      } catch {
        return null;
      }
    },
  };
}
