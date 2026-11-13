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

For auto-paste to work (simulating `Cmd+V` after selecting an item), grant Accessibility access:

**System Settings → Privacy & Security → Accessibility → add your terminal / Clippo**

Without this, clipboard is still written — you just paste manually with `Cmd+V`.

## Shortcut

`Cmd+Shift+V` — toggle the Clippo window from anywhere.

## Build (distributable .dmg)

```bash
npm run pack
```

Output goes to `release/`.

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
