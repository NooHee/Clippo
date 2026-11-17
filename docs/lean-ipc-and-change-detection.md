# Lean IPC, thumbnails by URL, and change based clipboard detection

This is the second performance pass on Clippo, after
[Faster opening and reliable auto-paste](performance-and-auto-paste.md). The first pass removed
blocking work from the hot paths. This one removes work that grew with the size of what users
copy: a 2 MB log in history used to make every popup open, every search keystroke and every
clipboard poll pay for those 2 MB.

It is written to be read on its own, for example to prepare a technical interview.

---

## TL;DR

Measured on Linux under Xvfb with Electron 43, against the same build without these changes,
using a "heavy" history: 480 small entries, 15 copied source files (50 KB each) and 5 copied logs
(2 MB each). Medians of repeated runs.

| What the user waits for | Before | After | Change |
| --- | ---: | ---: | ---: |
| Popup open: `getHistory` IPC round trip | 10.6 to 11.7 ms | 0.7 to 0.9 ms | **about 13x faster** |
| One search keystroke: IPC round trip | 13.0 to 13.8 ms | 0.8 to 0.9 ms | **about 15x faster** |
| Data copied to the renderer per open | 4,294 KB | 52 KB | **-99%** |
| 50 screenshot rows: data sent over IPC | 9,767 KB (base64) | 0 KB | removed |
| 50 screenshot rows: main thread blocked | 9.9 to 16.8 ms | 2.2 to 2.4 ms | -80% |
| Idle clipboard check, macOS | read the whole clipboard twice a second | no read until macOS reports a copy | removed |

What an idle poll used to cost, because each tick read the full clipboard text
(`clipboard.readText()` on Electron 43):

| Text on the clipboard | Cost per tick | At the default 2 ticks per second |
| ---: | ---: | ---: |
| 100 characters | 0.08 ms | negligible |
| 1 million characters | 1.7 ms | 3.4 ms of main thread per second, plus 4 MB/s of garbage |
| 10 million characters | 14.5 ms | 29 ms of main thread per second, plus 40 MB/s of garbage |

(JavaScript strings are UTF-16, so 10 million characters are 20 MB per read.) On macOS the watcher
now does none of this while nothing changes.

---

## How it was measured

Two scripts, both committed, both runnable by anyone:

- `npm run bench:ipc` (`scripts/perf/ipc-bench.js`) starts the **real built app** with a throwaway
  profile that contains the heavy history, and times `window.clipstack.getHistory('')` and
  `searchHistory('const')` from the renderer, so it includes structured clone, the IPC hop and
  the main process work. Pass two app roots to compare two builds.
- `npm run bench:history` (`scripts/perf/history-bench.js`) runs the repositories without
  Electron and reports the IPC payload size (`v8.serialize` is the structured clone algorithm
  Electron uses for IPC), the search cost and the main thread time spent on thumbnails.

The readText table comes from a 10 line Electron script that writes text of each size to the
clipboard and times `clipboard.readText()`.

All numbers are from a Linux container. A Mac will be faster in absolute terms; the ratios are
what matters. The change counter helper (P3) only runs on macOS, so it is verified by unit tests
with a fake process and by the manual checklist below, not by a benchmark.

---

## The changes

The names P1 to P8 refer to the performance section of the project audit.

### P1. The popup receives previews, not entries

**Problem.** `getHistory` and `searchHistory` returned up to 200 full `ClipboardEntry` objects,
including `content`. Electron copies every IPC payload with structured clone, so the cost of
opening the popup was proportional to the total size of the 200 most recent copies, even though
the list only shows one line of each.

**Fix.** The renderer receives a `ClipboardEntrySummary`:

```ts
type ClipboardEntrySummary = Pick<ClipboardEntry, 'id' | 'type' | 'preview' | 'createdAt' | 'pinnedAt' | 'imageName'>;
```

The preview is at most 200 characters. Everything that needs the full text now sends an id and
lets the main process look the content up:

| Action | Before (renderer sends) | After (renderer sends) |
| --- | --- | --- |
| Paste a history entry | `id, content` | `id` |
| Paste an image | `imageName` | `id` (same channel as text) |
| Paste a group entry | `content` | `groupId, entryId` |
| Add to a group | `groupId, content, type, preview, imageName` | `groupId, historyEntryId` |
| Hover tooltip | `content` | `{ kind: 'history', id }` or `{ kind: 'group', groupId, entryId }` |

Groups follow the same rule (`ClipboardGroupSummary`). The `paste-image` and `get-image-path`
channels are gone.

**Why it is also a security improvement.** Before, a compromised renderer could ask the main
process to put any text on the clipboard and press Cmd+V in the user's previous app. Now it can
only pick an entry that already exists in history. Smaller API surface, validated ids, and the
main process stays the single source of truth for content.

**Side fix.** History export used `list()`, which is capped at 200 rows, so exporting silently
dropped older entries. It now uses `all()`.

### P2. Thumbnails through a custom protocol

**Problem.** Each image row called `getImagePath` over IPC. The main process then did a
synchronous `readFileSync` plus base64 encoding (33 percent bigger than the file) on the same
thread that reacts to the global shortcut, and it repeated that every time a row remounted.

**Fix.** A privileged `clippo-image://` scheme (`src/main/clipboard/imageProtocol.ts`):

```ts
protocol.handle('clippo-image', async (request) => {
  const imageName = parseThumbnailUrl(request.url);
  const filePath = imageName ? await images.thumbnailFile(imageName) : null;
  if (!filePath) return new Response(null, { status: 404 });
  return net.fetch(pathToFileURL(filePath).toString());
});
```

The row is a plain `<img src="clippo-image://thumbnail/NAME" loading="lazy" decoding="async">`.
The main process only resolves a path asynchronously; Chromium's network stack streams the file,
the image decoder runs off the main process, Blink caches it, and `loading="lazy"` skips rows
that are not visible.

**Security details worth mentioning.**
- The scheme is registered with only `standard` and `secure`. No fetch API, CORS bypass or
  service worker privileges.
- `ImageStore.thumbnailFile` only accepts names matching `^[\w.-]+\.png$`, so an encoded
  `..%2F` decodes to a name with a slash and is refused (404). The end-to-end test checks this.
- The production CSP allows `img-src 'self' data: clippo-image:` and nothing else new.
- URL building and parsing live together in `src/shared/thumbnailUrl.ts`, shared by both
  processes, so they cannot drift apart.

### P3. Detect copies from the macOS change counter

**Problem.** Electron has no clipboard change event, so the watcher polled: every 500 ms it called
`clipboard.readText()`, which copies the whole clipboard string into JavaScript even when nothing
changed. See the readText table above for what that costs with large text.

**Fix.** macOS exposes `NSPasteboard.changeCount`, an integer that increments on every copy and
can be read without touching the content. A small JavaScript for Automation script, run once in a
long lived `osascript` process, watches it and prints a line only when it changes:

```js
function run(argv) {
  ObjC.import('AppKit');
  const pasteboard = $.NSPasteboard.generalPasteboard;
  const stdout = $.NSFileHandle.fileHandleWithStandardOutput;
  let last = -1;
  for (;;) {
    const count = pasteboard.changeCount;
    if (count !== last) { last = count; stdout.writeData($(String(count) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
    delay(intervalSeconds);
  }
}
```

`MacPasteboardChangeSource` (`src/main/clipboard/clipboardChangeSource.ts`) spawns it and turns
each batch of lines into one `onChange()`. The watcher then runs the exact same `checkNow()` as
before, so detection rules (images by fingerprint, concealed types, ignored apps, size limit) are
unchanged. While idle, Node does nothing at all.

**Design decisions.**
- **An interface, not a platform `if`.** `ClipboardWatcher` depends on an optional
  `ClipboardChangeSource`. With none (Linux, Windows) it polls as before. This is dependency
  inversion: the watcher does not know about `osascript`, and tests use a fake source.
- **Graceful degradation.** If the helper cannot start or exits, the source reports
  `onUnavailable` and the watcher switches to polling. Clippo keeps working; it is only less
  efficient.
- **No overlapping checks.** Changes arriving during a check set a flag, and one more check runs
  afterwards. A burst of 5 changes costs at most 2 checks (unit tested).
- **Stale processes cannot report.** Each callback checks that its process is still the current
  one, so a helper that was stopped or replaced (for example after changing the poll interval in
  Settings) stays silent.
- **No orphan process.** The app kills the helper on quit. If Clippo crashes, the helper's next
  write to the closed pipe throws and the script exits.

**Why `osascript` and not a native addon.** A native addon (Objective-C++ through N-API) would be
the leanest at runtime, but it has to be compiled per Electron ABI and per architecture, rebuilt
on every Electron upgrade, and signed with the app. `osascript` ships with macOS, is signed by
Apple, needs no build step, and Clippo already uses it to send Cmd+V. The cost is one extra small
process. If that ever matters, the interface makes swapping in an addon a local change.

**Bonus.** Reading the counter instead of the content also fits the direction of macOS privacy
rules around programmatic pasteboard reads: Clippo now reads the clipboard only right after the
user copied something.

### P4. Cached search text

**Problem.** Every keystroke lowercased the full content of every entry on the main thread (about
10 MB of string work per keystroke with the heavy history).

**Fix.** `HistoryRepository` keeps a lowercased copy of the preview plus the first 20,000
characters of each entry, computed on first use, in a `WeakMap<ClipboardEntry, string>`. Keying
by the entry object means replacing or removing an entry drops its cache line automatically, and
nothing extra is written to disk. Search cost now depends on the number of entries, not on how
big they are.

**Trade-off.** Text after the first 20,000 characters of an entry is not searchable. That is
deliberate: nobody finds a log line by typing into a clipboard manager, and it keeps the cost
predictable.

### P5. Bounded save cost

The size limit itself (text above 1 million characters is not recorded) landed with the security
hardening work, which this branch is based on. This branch adds a `CLIPPO_PERF=1` timing around
serialization and encryption (`store.serialize <file>`), so the cost of each save is visible.

### P6. Truncated tooltip

The tooltip used to receive the entire entry and render it into a 420 by 460 window. The main
process now sends at most 8,000 characters (`truncateForTooltip`), which is more than the window
can show.

### P8. Pinning updates the row locally

Pinning used to reload and re-render the whole list. `togglePin` now returns the updated row and
the renderer moves it with a pure function (`applyPinChange` in
`src/renderer/hooks/historyOrder.ts`) that follows the same order as the main process: pinned
rows first, most recently pinned on top, then unpinned rows by recency.

### Not in this change

P7, the Electron upgrade, is part of the security hardening branch (Electron 43). All numbers in
this document were measured on Electron 43 on both sides.

---

## Verification

- **Unit tests** (`npm test`): previews only in `list()`, search cache stays correct after
  re-copy, pin and delete, the 20,000 character search window, export beyond 200 rows, group
  summaries, tooltip target validation and truncation, thumbnail URL parsing (including
  traversal attempts), pin ordering, and the change source and watcher with a fake `osascript`
  process (chunked output, exit, error, restart, stop, burst coalescing, fallback to polling).
- **End-to-end test** (`xvfb-run -a npm run test:e2e`) on the real app: rows carry no `content`,
  thumbnails load from `clippo-image://`, the protocol returns 200 for a thumbnail and 404 for a
  traversal attempt, pinning puts the row first.

### Manual check on macOS (what CI cannot do)

1. `CLIPPO_PERF=1 npm start`.
2. In Activity Monitor, search for `osascript`: there is exactly one, and it stays near 0 percent
   CPU.
3. Copy text in another app: it appears in Clippo right away (within the poll interval).
4. Copy a 1Password password: nothing is recorded (concealed type).
5. Kill the `osascript` process in Activity Monitor: the log shows "falling back to polling", and
   copies are still recorded.
6. Quit Clippo: the `osascript` process disappears.
7. Copy a big screenshot and scroll the list: thumbnails load without the popup stuttering.

---

## Trade-offs and limitations

- One extra `osascript` process on macOS while Clippo runs.
- The helper still wakes up at the poll interval to read one integer; macOS has no public
  notification for pasteboard changes. That read is orders of magnitude cheaper than reading the
  content, and it happens in another process.
- The first search after launch builds the cache for every entry; later keystrokes reuse it.
- After unpinning, the row is placed by `createdAt`. The main process orders unpinned rows by last
  use, so the position can differ slightly until the next open, which reloads the list.

## Future work

- Store history in SQLite (`better-sqlite3`, with SQLCipher for encryption): incremental writes
  instead of rewriting the whole file, and indexed full text search (FTS5).
- Virtualize the list if the visible row limit ever goes above 200.
- Replace the `osascript` helper with a native addon if the extra process ever matters.

---

## Interview talking points

- **Measure first, with a reproducible benchmark.** Two committed scripts compare two builds on
  the same data. The headline numbers (13x faster open, 99 percent less data over IPC) come from
  the real app, not from a micro benchmark alone.
- **Know what IPC costs in Electron.** Every payload is structured cloned between processes.
  Send what the view needs (previews and ids) and keep the source of truth in one process.
- **Use the platform.** Thumbnails became URLs, so Chromium does the reading, decoding, caching and
  lazy loading it is optimized for, instead of hand rolled base64 over IPC.
- **Prefer events to polling, and degrade gracefully.** The watcher reacts to the change counter,
  and falls back to polling when that is not available. The mode is behind an interface, which
  is also what made it testable without a Mac.
- **Performance and security often line up.** Paste by id shrinks payloads and also removes the
  ability of a compromised renderer to choose what gets pasted.
- **Deliberate trade-offs.** A searchable window of 20,000 characters, an extra helper process
  instead of a native addon. Each one is written down with its reason.
