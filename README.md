# ClipStack

A minimal clipboard history manager for macOS — inspired by Ditto.

## Features

- Stores up to 500 clipboard entries (text)
- Persistent SQLite storage across restarts
- Real-time updates as you copy
- Search through history
- Pin important entries
- Auto-paste via AppleScript (`Cmd+Shift+V`)
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

**System Settings → Privacy & Security → Accessibility → add your terminal / ClipStack**

Without this, clipboard is still written — you just paste manually with `Cmd+V`.

## Shortcut

`Cmd+Shift+V` — toggle the ClipStack window from anywhere.

## Build (distributable .dmg)

```bash
npm run pack
```

Output goes to `release/`.

## Architecture

```
src/
  shared/types.ts          # IPC channel names + ClipboardEntry type
  main/
    index.ts               # Electron bootstrap, tray, global shortcut
    clipboard.ts           # Polls clipboard every 500ms
    db.ts                  # SQLite via better-sqlite3 (WAL mode)
    ipc.ts                 # IPC handlers, AppleScript paste trigger
    preload.ts             # contextBridge — safe renderer ↔ main bridge
  renderer/
    App.tsx                # Root component
    hooks/
      useClipboardHistory  # All state management, debounced search
    components/
      SearchBar.tsx
      ClipboardList.tsx
      ClipboardItem.tsx    # Hover actions: pin / delete
    styles.css             # Dark macOS aesthetic, backdrop blur
```

## License

This project is licensed under the **Creative Commons Attribution 4.0 (CC BY)** license.

You are free to use, modify, and distribute this project for any purpose (personal or commercial)
as long as you give credit to the original author **Noé Serwy**.

See [LICENSE](LICENSE) for details.
