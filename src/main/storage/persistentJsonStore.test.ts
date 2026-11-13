import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PersistentJsonStore, plainTextCodec, type StorageCodec } from './persistentJsonStore';

interface Doc {
  items: string[];
}

/** Reversible stand-in for Keychain encryption: prefixes the payload. */
const fakeEncryption: StorageCodec = {
  encode: (json) => `enc:${json}`,
  decode: (raw) => (raw.startsWith('enc:') ? raw.slice(4) : null),
};

function parseDoc(json: unknown): Doc {
  if (typeof json !== 'object' || json === null || !('items' in json) || !Array.isArray(json.items)) {
    throw new Error('invalid');
  }
  return { items: json.items.filter((item): item is string => typeof item === 'string') };
}

describe('PersistentJsonStore', () => {
  let dir: string;
  let filePath: string;
  const silentLogger = { warn: () => undefined, error: () => undefined };

  const createStore = (codec: StorageCodec = fakeEncryption) =>
    new PersistentJsonStore<Doc>({
      filePath,
      codec,
      parse: parseDoc,
      createDefault: () => ({ items: [] }),
      writeDebounceMs: 10_000, // Writes in these tests happen through explicit flushes.
      logger: silentLogger,
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clippo-store-'));
    filePath = path.join(dir, 'doc.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the default value when no file exists yet', () => {
    expect(createStore().get()).toEqual({ items: [] });
  });

  it('round-trips through the codec with an atomic write', async () => {
    const store = createStore();
    store.get().items.push('a');
    store.scheduleSave();
    await store.flush();

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('enc:{"items":["a"]}');
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(createStore().get()).toEqual({ items: ['a'] });
  });

  it('migrates a legacy plain JSON file to the codec format', async () => {
    fs.writeFileSync(filePath, '{"items":["legacy"]}');
    const store = createStore();

    expect(store.get()).toEqual({ items: ['legacy'] });
    await store.flush();
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('enc:{"items":["legacy"]}');
  });

  it('backs up an unreadable file instead of silently losing it', () => {
    fs.writeFileSync(filePath, 'not json at all');
    const store = createStore();

    expect(store.get()).toEqual({ items: [] });
    const backups = fs.readdirSync(dir).filter((name) => name.includes('.unreadable-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf-8')).toBe('not json at all');
  });

  it('flushSync writes pending changes synchronously (used on quit)', () => {
    const store = createStore(plainTextCodec);
    store.set({ items: ['quit'] });
    store.flushSync();

    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ items: ['quit'] });
  });

  it('coalesces several mutations into one write', async () => {
    const store = createStore(plainTextCodec);
    store.set({ items: ['1'] });
    store.set({ items: ['1', '2'] });
    store.set({ items: ['1', '2', '3'] });
    await store.flush();

    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({ items: ['1', '2', '3'] });
  });
});
