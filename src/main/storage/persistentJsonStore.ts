import fs from 'node:fs';
import path from 'node:path';

/**
 * Turns the serialized JSON into the bytes written on disk and back.
 * `decode` returns null when the payload is not in the codec's format
 * (for example a legacy plain-text file that predates encryption).
 */
export interface StorageCodec {
  encode(json: string): string;
  decode(raw: string): string | null;
}

export const plainTextCodec: StorageCodec = {
  encode: (json) => json,
  decode: (raw) => raw,
};

/** What repositories need from a store. Lets tests use an in-memory implementation. */
export interface DocumentStore<T> {
  get(): T;
  set(value: T): void;
  /** Call after mutating the object returned by `get()`. */
  scheduleSave(): void;
}

export interface PersistentJsonStoreOptions<T> {
  filePath: string;
  /** Builds the value used when the file is missing or unreadable. */
  createDefault: () => T;
  /** Validates untrusted JSON read from disk and turns it into a well-formed value. */
  parse: (json: unknown) => T;
  codec: StorageCodec;
  /** Bursts of mutations inside this window are coalesced into a single disk write. */
  writeDebounceMs?: number;
  logger?: Pick<Console, 'warn' | 'error'>;
}

const DEFAULT_WRITE_DEBOUNCE_MS = 250;

/**
 * A small JSON document store with:
 *  - lazy, one-time synchronous load (callers keep a simple synchronous API),
 *  - debounced, asynchronous, atomic writes (write to a temp file, then rename),
 *  - transparent migration of legacy plain-text files to the configured codec,
 *  - a backup of unreadable files instead of silently overwriting user data.
 *
 * Before this existed, every clipboard change re-serialized, re-encrypted and
 * synchronously rewrote the whole history on the Electron main thread, which is
 * the same thread that has to react to the global shortcut and show the popup.
 */
export class PersistentJsonStore<T> implements DocumentStore<T> {
  private value: T | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  private readonly writeDebounceMs: number;
  private readonly logger: Pick<Console, 'warn' | 'error'>;

  constructor(private readonly options: PersistentJsonStoreOptions<T>) {
    this.writeDebounceMs = options.writeDebounceMs ?? DEFAULT_WRITE_DEBOUNCE_MS;
    this.logger = options.logger ?? console;
  }

  /** Returns the in-memory value, loading it from disk on first access. */
  get(): T {
    if (this.value === null) {
      this.value = this.load();
    }
    return this.value;
  }

  /** Replaces the whole value and schedules a write. */
  set(value: T): void {
    this.value = value;
    this.scheduleSave();
  }

  /** Call after mutating the object returned by `get()`. */
  scheduleSave(): void {
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, this.writeDebounceMs);
  }

  /** Writes pending changes now. Writes are serialized so they never interleave. */
  flush(): Promise<void> {
    this.cancelTimer();
    if (this.value === null) return this.pendingWrite;
    const payload = this.serialize(this.value);
    this.pendingWrite = this.pendingWrite
      .then(() => this.writeAtomically(payload))
      .catch((error: unknown) => this.logger.error('[Clippo] Failed to persist', this.options.filePath, error));
    return this.pendingWrite;
  }

  /** Synchronous variant used while the app quits, when the event loop may not run again. */
  flushSync(): void {
    if (this.writeTimer === null || this.value === null) return;
    this.cancelTimer();
    const tmpPath = `${this.options.filePath}.tmp`;
    fs.writeFileSync(tmpPath, this.serialize(this.value), 'utf-8');
    fs.renameSync(tmpPath, this.options.filePath);
  }

  private cancelTimer(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
  }

  private serialize(value: T): string {
    return this.options.codec.encode(JSON.stringify(value));
  }

  private async writeAtomically(payload: string): Promise<void> {
    const tmpPath = `${this.options.filePath}.tmp`;
    await fs.promises.mkdir(path.dirname(this.options.filePath), { recursive: true });
    await fs.promises.writeFile(tmpPath, payload, 'utf-8');
    await fs.promises.rename(tmpPath, this.options.filePath);
  }

  private load(): T {
    const { filePath, codec, parse, createDefault } = this.options;
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return createDefault(); // First launch: nothing stored yet.
    }

    const decoded = codec.decode(raw);
    try {
      if (decoded !== null) return parse(JSON.parse(decoded));
    } catch {
      // Fall through: maybe a legacy plain-text file.
    }

    try {
      const migrated = parse(JSON.parse(raw));
      this.value = migrated;
      this.scheduleSave(); // Re-save with the current codec (for example encrypt it).
      return migrated;
    } catch {
      this.backUpUnreadableFile();
      return createDefault();
    }
  }

  private backUpUnreadableFile(): void {
    const backupPath = `${this.options.filePath}.unreadable-${Date.now()}`;
    try {
      fs.copyFileSync(this.options.filePath, backupPath);
      this.logger.warn(`[Clippo] Could not read ${this.options.filePath}, kept a backup at ${backupPath}`);
    } catch (error) {
      this.logger.error('[Clippo] Could not back up unreadable file', error);
    }
  }
}
