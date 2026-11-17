import { spawn } from 'node:child_process';

export interface ClipboardChangeListener {
  /** The system clipboard changed (or may have: a spurious call only costs one cheap check). */
  onChange(): void;
  /** The source stopped working on its own. The watcher falls back to reading the clipboard on a timer. */
  onUnavailable(reason: unknown): void;
}

/**
 * Tells the watcher when the clipboard changed, without reading what is on it.
 * Electron has no clipboard change event, so without a source the watcher has to read the
 * clipboard text on every tick to notice a change.
 */
export interface ClipboardChangeSource {
  start(intervalMs: number, listener: ClipboardChangeListener): void;
  stop(): void;
}

/** The part of a ChildProcess this module uses, so tests can provide a fake one. */
export interface ChangeHelperProcess {
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown; setEncoding(encoding: 'utf8'): unknown } | null;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  kill(): boolean;
}

export type SpawnHelper = (command: string, args: readonly string[]) => ChangeHelperProcess;

/**
 * Runs inside a single long lived `osascript` process. NSPasteboard.changeCount is an integer
 * that macOS increments on every copy; reading it never touches the clipboard content. The
 * script prints the counter whenever it changes, so Node does no work at all while idle.
 *
 * Writing to stdout after Clippo exits raises an exception, which ends the script, so the helper
 * cannot outlive the app by more than one clipboard change even if Clippo crashes.
 */
export const CHANGE_COUNT_SCRIPT = [
  'function run(argv) {',
  "  ObjC.import('AppKit');",
  '  const pasteboard = $.NSPasteboard.generalPasteboard;',
  '  const stdout = $.NSFileHandle.fileHandleWithStandardOutput;',
  '  const intervalSeconds = Math.max(Number(argv[0]) || 250, 50) / 1000;',
  '  let last = -1;',
  '  for (;;) {',
  '    const count = pasteboard.changeCount;',
  '    if (count !== last) {',
  '      last = count;',
  "      stdout.writeData($(String(count) + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));",
  '    }',
  '    delay(intervalSeconds);',
  '  }',
  '}',
].join('\n');

const defaultSpawn: SpawnHelper = (command, args) => spawn(command, [...args], { stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * macOS change source backed by the JXA helper above.
 *
 * Why a helper process and not a native addon: an addon must be compiled for each Electron ABI
 * and architecture, and signed with the app. `osascript` ships with macOS and is already signed,
 * and Clippo already uses it to send Cmd+V. The trade-off is one small extra process.
 */
export class MacPasteboardChangeSource implements ClipboardChangeSource {
  private process: ChangeHelperProcess | null = null;

  constructor(private readonly spawnHelper: SpawnHelper = defaultSpawn) {}

  start(intervalMs: number, listener: ClipboardChangeListener): void {
    this.stop();
    let helper: ChangeHelperProcess;
    try {
      helper = this.spawnHelper('osascript', ['-l', 'JavaScript', '-e', CHANGE_COUNT_SCRIPT, String(intervalMs)]);
    } catch (error) {
      listener.onUnavailable(error);
      return;
    }
    this.process = helper;

    // Only the process that is current may report: a stopped or replaced helper stays silent.
    const isCurrent = (): boolean => this.process === helper;
    const fail = (reason: unknown): void => {
      if (!isCurrent()) return;
      this.process = null;
      listener.onUnavailable(reason);
    };

    let buffered = '';
    helper.stdout?.setEncoding('utf8');
    helper.stdout?.on('data', (chunk) => {
      if (!isCurrent()) return;
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      // Several changes in one chunk need a single check: it reads whatever is on the clipboard now.
      if (lines.some((line) => line.trim() !== '')) listener.onChange();
    });
    helper.on('error', fail);
    helper.on('exit', (code, signal) => fail(new Error(`Clipboard change helper exited (code ${code}, signal ${signal})`)));
  }

  stop(): void {
    const helper = this.process;
    this.process = null;
    helper?.kill();
  }
}
