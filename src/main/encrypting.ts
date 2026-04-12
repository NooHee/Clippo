import { safeStorage } from 'electron';

/**
 * Encrypts a string using Electron's safeStorage (macOS Keychain-backed).
 * Returns a base64-encoded ciphertext string suitable for writing to disk.
 */
export function encrypt(plaintext: string): string {
  return safeStorage.encryptString(plaintext).toString('base64');
}

/**
 * Decrypts a base64-encoded ciphertext produced by `encrypt`.
 * Returns null if decryption fails (corrupted data or wrong key).
 */
export function decrypt(ciphertext: string): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
  } catch {
    return null;
  }
}

export function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
