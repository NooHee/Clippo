# Warning when Accessibility access is missing

Clippo's headline feature, clicking an entry to paste it into the text field you were using,
depends on one macOS permission: **Accessibility**. Without it macOS silently drops the Cmd+V that
Clippo synthesizes. Before this change the only signal was a notification **after** a paste had
already failed. Now Clippo watches the permission continuously and tells the user, before they
rely on it, what is degraded and how to fix it. The warning disappears by itself once access works.

## TL;DR

| Where | When access is missing | When it is granted |
|---|---|---|
| Popup (history, groups and settings) | Banner: "Auto-paste is off", what it means, a button to the right settings pane, and the "remove and add again" steps | Nothing |
| Settings, Permissions section | "Off · Fix…" button | "Granted" |
| Menu bar | ⚠︎ next to the icon, a tooltip, and three menu lines explaining it with a shortcut to the settings pane | Plain icon and menu |
| Paste attempt | Entry copied, focus returned, one notification per session (from the earlier fix) | Pasted |

The state is detected **within about 2 seconds** of granting the permission and **within about
300 ms** of revoking it, with no restart.

## The problem

There are three ways to end up without working Accessibility access:

1. The user never granted it, or declined the system prompt.
2. The user turned Clippo off or removed it in System Settings.
3. **Stale grant.** The toggle is still on, but it belongs to a previous build. macOS identifies
   apps by their code signature (the "designated requirement"). An ad-hoc signed build gets a new
   identity on every release, so the old grant no longer matches. This is the confusing one: the
   settings say "on", yet nothing works. The fix is to remove Clippo with the minus button and add
   it again. See Part 3 of [performance-and-auto-paste.md](performance-and-auto-paste.md#part-3-auto-paste-still-failed-on-a-real-mac).

In all three cases `systemPreferences.isTrustedAccessibilityClient(false)` returns `false`, so one
check covers them. What was missing is **when** to check and **how** to show the result.

## Design

```
                       ┌────────────────────────────────────────┐
  app launch ─────────▶│                                        │──▶ tray: ⚠︎, tooltip, menu lines
  popup shown ────────▶│          AccessibilityMonitor          │
  paste attempt ──────▶│  state: granted | missing | unsupported│──▶ IPC 'accessibility-changed'
  com.apple.           │  notifies listeners only on a change   │        │
  accessibility.api ──▶│  (after a 300 ms settle delay)         │        ▼
  polling ────────────▶│  2 s while missing, 30 s while granted │    useAccessibilityState()
                       └────────────────────────────────────────┘        │
                                                                ┌─────────┴─────────┐
                                                        AccessibilityBanner   Settings row
```

### One source of truth: `AccessibilityMonitor`

`src/main/permissions/accessibilityMonitor.ts` owns the answer to "can Clippo paste right now?".
It is a plain class with injected collaborators:

- `isTrusted()` reads the permission (in production, `AccessibilityGuard.isTrusted()`).
- `isSupported` is false off macOS, where the state is `unsupported` and nothing is scheduled.
- `scheduler` wraps `setInterval` and `setTimeout`, so tests run timers by hand.
- `subscribeToSystemChanges` wraps `systemPreferences.subscribeNotification`.

Everything that needs the state (paste service, tray, renderer) reads it from the monitor, so the
banner, the tray and the paste logic can never disagree. `PasteService` now calls
`monitor.refresh()` instead of reading the permission directly, which also means a failed paste
updates the UI immediately.

### When to check

macOS has **no public API** that reports Accessibility changes. The monitor combines four signals,
from cheapest and most precise to the safety net:

1. **`com.apple.accessibility.api` distributed notification.** macOS posts it whenever an app is
   added, removed or toggled in the Accessibility list. It is undocumented but long-standing and
   used by well-known window managers. The notification arrives slightly before the new value is
   readable, so the monitor waits 300 ms, and a burst of notifications collapses into one check.
2. **Popup shown.** The moment the user is about to rely on the feature. The check runs after
   `show()` and `focus()`, so it never delays the first frame (the popup open time was the subject
   of the previous performance work).
3. **Paste attempt.** `PasteService` asks the monitor before sending Cmd+V.
4. **Polling.** Every 2 seconds while access is missing, so the banner clears quickly once the
   user fixes it in System Settings, and every 30 seconds while it is granted in case the
   notification is ever not delivered. `isTrustedAccessibilityClient(false)` is a cheap native call
   with no prompt and no child process, so this costs nothing measurable.

Listeners only fire when the state **changes**, so polling never causes a re-render or a tray
rebuild by itself.

### How to show it

- **Banner** (`src/renderer/components/AccessibilityBanner.tsx`). Placed under the title bar, so it
  is visible in history, groups and settings. It says what is degraded in user terms ("clicking an
  entry only copies it, press ⌘V yourself"), offers one primary action (open the exact settings
  pane), and hides the stale-grant steps behind "How to fix" to keep the popup compact. It has no
  close button on purpose: it represents a real state, and it removes itself when that state ends.
  It uses `role="alert"` so screen readers announce it.
- **Settings row** in a new Permissions section: a status at a glance, with a fix button.
- **Menu bar.** The tray icon is a template image, which macOS always draws in monochrome, so it
  cannot turn red. Instead a ⚠︎ title appears next to it, the tooltip explains it, and the context
  menu starts with disabled lines listing what is degraded plus an "Open Accessibility Settings…"
  item. `describeTray()` (`src/main/tray/trayMenu.ts`) is a pure function from
  `(state, language, actions)` to `{ tooltip, title, menu }`, so it is unit tested without Electron.
- **Localization.** Banner and settings strings are in the i18next locales (English and French).
  The tray lives in the main process, which does not load i18next, so its few strings are kept
  next to `describeTray()` and follow the same language setting.

### Renderer wiring

`useAccessibilityState()` subscribes to `accessibility-changed` **before** asking for the current
value with `get-accessibility-state`, so a change that happens between the two calls cannot be
lost. It starts at `null`, which renders nothing, so there is no flash of the banner on launch.
The new IPC channels go through the same sender check as every other handler in `ipc.ts`.

## Alternatives considered

| Option | Why not |
|---|---|
| Only notify when a paste fails (previous behaviour) | The user finds out after the fact, and the popup is already closed. |
| Poll every second, always | Works, but wastes wakeups on a laptop for a state that rarely changes. The notification plus adaptive polling gives the same responsiveness. |
| Check only on popup open | Misses the menu bar state and leaves the banner up until the next open after fixing it. |
| Call `isTrustedAccessibilityClient(true)` on launch | Shows a system dialog on every launch for users who chose not to grant it. The prompt stays tied to an actual paste attempt, once per session. |
| A dismissible banner | Users would dismiss it and then wonder why paste is broken. The warning should live exactly as long as the problem. |

## Testing

- `src/main/permissions/accessibilityMonitor.test.ts` (9 tests): unsupported platforms never
  schedule work, fast polling while missing and slow polling once granted, revocation detected
  from the system notification only after the settle delay, notification bursts coalesced,
  listeners called only on change, `stop()` cancels everything. A `ManualScheduler` records the
  scheduled tasks and the test fires them explicitly, so there are no real or fake timers.
- `src/main/tray/trayMenu.test.ts` (4 tests): plain menu when granted or unsupported, degraded
  lines and the settings action when missing, French strings.
- `scripts/e2e/smoke.js`: in the real built app, no banner on Linux (unsupported), banner appears
  when main pushes `missing`, and disappears when it pushes `granted`.

### Manual check on macOS

1. Install a build, grant Accessibility: no banner, plain tray icon.
2. Turn Clippo off in System Settings, Accessibility: within a second the tray shows ⚠︎; open the
   popup, the banner is there; Settings shows "Off · Fix…".
3. Click "Open Accessibility settings": the right pane opens. Turn Clippo back on: within about
   2 seconds the banner and the ⚠︎ disappear without reopening anything.
4. Stale grant: install a differently signed build with the toggle still on. The banner appears
   at launch even though the toggle shows on; removing and re-adding Clippo clears it.

## Interview angle

The interesting part is not the banner, it is the state management around a value that the OS
does not let you observe. I made one object the source of truth, fed it from every signal that
exists (an undocumented notification, user intent, and adaptive polling as a safety net), and
made it emit only on changes. The UI layers then become simple subscribers, and the timing logic
is tested deterministically by injecting the scheduler instead of mocking time.
