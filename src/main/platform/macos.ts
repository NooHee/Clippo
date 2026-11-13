import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Thin wrappers around macOS command line tools.
 *
 * All of them use `execFile` (no shell, arguments passed as an array) and are asynchronous.
 * The previous code used `execSync` with string interpolation, which blocked the Electron main
 * thread for the whole lifetime of the `osascript` process (typically 100 to 300 ms, up to the
 * 1 s timeout) and allowed shell injection through an application name.
 */
const execFileAsync = promisify(execFile);

export type CommandRunner = (file: string, args: readonly string[], options: { timeout: number }) => Promise<unknown>;

const defaultRunner: CommandRunner = (file, args, options) => execFileAsync(file, [...args], options);

const PASTE_SCRIPT = 'tell application "System Events" to keystroke "v" using command down';
const FRONTMOST_APP_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true';
const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

/**
 * Sends Cmd+V to the frontmost application.
 * Resolves to false when the keystroke could not be sent, typically because Clippo has not been
 * granted Accessibility permission. The entry is still on the clipboard in that case.
 */
export async function sendPasteKeystroke(run: CommandRunner = defaultRunner): Promise<boolean> {
  try {
    await run('osascript', ['-e', PASTE_SCRIPT], { timeout: 2000 });
    return true;
  } catch (error) {
    console.warn('[Clippo] Could not send Cmd+V. Grant Accessibility permission to paste automatically.', error);
    return false;
  }
}

export async function frontmostAppName(run: CommandRunner = execFileStdout): Promise<string | null> {
  try {
    const stdout = await run('osascript', ['-e', FRONTMOST_APP_SCRIPT], { timeout: 1000 });
    return typeof stdout === 'string' ? stdout.trim() || null : null;
  } catch {
    return null; // No permission or timeout: treat the source app as unknown.
  }
}

export async function openAccessibilitySettings(run: CommandRunner = defaultRunner): Promise<void> {
  try {
    await run('open', [ACCESSIBILITY_SETTINGS_URL], { timeout: 2000 });
  } catch (error) {
    console.error('[Clippo] Failed to open Accessibility settings', error);
  }
}

async function execFileStdout(file: string, args: readonly string[], options: { timeout: number }): Promise<string> {
  const { stdout } = await execFileAsync(file, [...args], { ...options, encoding: 'utf-8' });
  return stdout;
}
