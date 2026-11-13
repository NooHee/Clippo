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

/**
 * Posts Cmd+V as a Quartz (CGEvent) keyboard event from a JavaScript for Automation script.
 *
 * Why not `tell application "System Events" to keystroke "v"`? That sends an Apple Event to
 * System Events, which needs a second permission (Automation) on top of Accessibility. macOS
 * only asks for it when the responsible app declares NSAppleEventsUsageDescription, and Electron's
 * Info.plist does not. Packaged Clippo was therefore denied silently (error -1743), while
 * `npm start` worked because Terminal was the responsible app. Posting a CGEvent needs only
 * Accessibility. Virtual key 9 is the physical V key (kVK_ANSI_V).
 */
// Numeric values instead of bridged constant names, so the script does not depend on BridgeSupport
// metadata: kCGEventSourceStateCombinedSessionState = 0, kCGEventFlagMaskCommand = 0x100000,
// kCGHIDEventTap = 0.
const CGEVENT_PASTE_SCRIPT = [
  "ObjC.import('CoreGraphics');",
  'const source = $.CGEventSourceCreate(0);',
  'for (const keyDown of [true, false]) {',
  '  const event = $.CGEventCreateKeyboardEvent(source, 9, keyDown);',
  '  $.CGEventSetFlags(event, 0x100000);',
  '  $.CGEventPost(0, event);',
  '}',
].join('\n');
/** Fallback, used only if the CGEvent script fails to run. Needs the Automation permission too. */
const APPLESCRIPT_PASTE_SCRIPT = 'tell application "System Events" to keystroke "v" using command down';

const FRONTMOST_APP_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true';
const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

/**
 * Sends Cmd+V to the frontmost application.
 * Resolves to false when no method could run. Callers must check the Accessibility permission
 * first: without it macOS drops synthesized events silently, so success here cannot prove it.
 */
export async function sendPasteKeystroke(run: CommandRunner = defaultRunner): Promise<boolean> {
  try {
    await run('osascript', ['-l', 'JavaScript', '-e', CGEVENT_PASTE_SCRIPT], { timeout: 2000 });
    return true;
  } catch (error) {
    console.warn('[Clippo] CGEvent paste failed, falling back to System Events.', error);
  }
  try {
    await run('osascript', ['-e', APPLESCRIPT_PASTE_SCRIPT], { timeout: 2000 });
    return true;
  } catch (error) {
    console.warn('[Clippo] Could not send Cmd+V.', error);
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
