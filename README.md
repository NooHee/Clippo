# Clippo

A minimal clipboard history manager for macOS — inspired by Ditto.

## Features

- Stores up to 500 clipboard entries (text)
- Encrypted persistent storage across restarts (macOS Keychain)
- Real-time updates as you copy
- Search through history
- Pin important entries
- Click an entry to paste it straight into the text field you were typing in
- Lives in the menu bar, out of your way

## Setup

```bash
npm install
npm start
```

This compiles the main process TypeScript and launches Electron.

For active development with the renderer hot-reloading:

```bash
# Terminal 1 — Vite renderer dev server
npm run dev:renderer

# Terminal 2 — compile & launch Electron
NODE_ENV=development npm run dev:main
```

## Permissions

Auto-paste (Clippo sends `Cmd+V` after you pick an entry) needs Accessibility access:

**System Settings > Privacy & Security > Accessibility > enable Clippo**

Without it the entry is still copied; paste manually with `Cmd+V`. Clippo watches the permission
and, while it is missing, shows a banner in the popup, a status in Settings and a ⚠︎ in the menu
bar, all of which clear by themselves once access is granted
([details](docs/accessibility-permission-safeguard.md)).
If Clippo is already enabled but paste stopped working after an update, remove it with the minus
button and add it again. Release builds are signed with a stable certificate so this should only be
needed once; see [docs/performance-and-auto-paste.md](docs/performance-and-auto-paste.md#part-3-auto-paste-still-failed-on-a-real-mac).

## Shortcut

`Cmd+Shift+V` — toggle the Clippo window from anywhere.

## Build (distributable .dmg)

```bash
npm run dist
```

Output goes to `release/`.

## Versioning and releases

Versions are bumped automatically. Pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/) (`feat: ...`, `fix: ...`, `feat!: ...`),
and [release-please](https://github.com/googleapis/release-please) turns the commits on `main` into a
release PR that bumps `package.json`, updates [CHANGELOG.md](CHANGELOG.md) and, once merged, tags the
release and attaches the macOS builds. Never edit the version by hand. Details and trade-offs:
[docs/release-process.md](docs/release-process.md).

## Testing

```bash
npm run typecheck          # main, renderer and tests
npm test                   # unit tests (Vitest)
npm run test:e2e           # end-to-end smoke test of the built app (Linux: xvfb-run -a npm run test:e2e)
npm run bench:startup      # cold-start benchmark, prints medians
```

Set `CLIPPO_PERF=1` to log hot-path timings (startup, hotkey to visible popup, paste).

## Architecture

How opening was made faster and how auto-paste works (root causes, design decisions, measurements,
trade-offs) is documented in [docs/performance-and-auto-paste.md](docs/performance-and-auto-paste.md).

```
src/
  shared/types.ts            # IPC channel names, entry and settings types
  main/
    index.ts                 # Composition root: wires everything, app lifecycle, tray, hotkey
    ipc.ts                   # IPC handlers (validated input, popup-only sender)
    preload.ts               # Sandboxed contextBridge API
    storage/                 # Debounced, atomic, Keychain-encrypted JSON stores + repositories
    clipboard/               # Clipboard watcher, cheap image fingerprint, image + thumbnail store
    paste/                   # Focus handback to the previous app and the paste sequence
    windows/                 # Long-lived popup window, lazy tooltip window
    platform/                # macOS command wrappers (execFile), perf logging
  renderer/
    App.tsx                  # Root component, popup reset handshake
    hooks/
      useClipboardHistory    # History state, debounced search
    components/              # SearchBar, ClipboardList, ClipboardItem, GroupsView, SettingsPanel...
    styles.css
```

## License

This project is licensed under the **Creative Commons Attribution 4.0 (CC BY)** license.

You are free to use, modify, and distribute this project for any purpose (personal or commercial)
as long as you give credit to the original author **Noé Serwy**.

See [LICENSE](LICENSE) for details.
