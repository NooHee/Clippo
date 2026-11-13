// Compares the main-thread cost of the old and new clipboard / storage code paths in one Electron process.
//
// Usage (after `npm run build`, with the previous version built in another checkout):
//   OLD_DIST=/path/to/old/dist/main/main NEW_DIST=$PWD/dist/main/main \
//     npx electron --user-data-dir=$(mktemp -d) scripts/perf/main-thread-bench.js
// On Linux add --no-sandbox and run under `xvfb-run -a`.
const { app, clipboard, nativeImage } = require('electron');
const path = require('path');
const OLD = process.env.OLD_DIST, NEW = process.env.NEW_DIST;
const time = async (label, fn, n) => { await fn(); const s = process.hrtime.bigint(); for (let i = 0; i < n; i++) await fn(); console.log(label.padEnd(58), (Number(process.hrtime.bigint() - s) / n / 1e6).toFixed(2), 'ms'); };
app.whenReady().then(async () => {
  const W = 2880, H = 1800, buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < buf.length; i += 4) { buf[i] = (i * 7) & 255; buf[i + 1] = (i >> 8) & 255; buf[i + 2] = (i >> 13) & 255; buf[i + 3] = 255; }
  clipboard.writeImage(nativeImage.createFromBitmap(buf, { width: W, height: H }));
  console.log('encryption available:', require('electron').safeStorage.isEncryptionAvailable());

  // --- Poll tick with an unchanged Retina screenshot on the clipboard ---
  const { ClipboardService } = require(path.join(OLD, 'clipboard.js'));
  const oldSvc = new ClipboardService(() => {}, 500); oldSvc.start();
  await time('OLD poll tick, unchanged 2880x1800 image on clipboard', () => oldSvc.poll(), 10);
  const { ClipboardWatcher } = require(path.join(NEW, 'clipboard/clipboardWatcher.js'));
  const watcher = new ClipboardWatcher({ clipboard, history: { insert: () => ({}) }, saveImage: () => 'x.png', ignoredApps: () => [], frontmostAppName: async () => null, onNewEntry: () => {} });
  watcher.rememberCurrentContent();
  await time('NEW poll tick, unchanged 2880x1800 image on clipboard', () => watcher.checkNow(), 10);
  clipboard.writeText('plain text');
  await time('OLD poll tick, unchanged text on clipboard', () => oldSvc.poll(), 50);
  watcher.rememberCurrentContent();
  await time('NEW poll tick, unchanged text on clipboard', () => watcher.checkNow(), 50);

  // --- Recording one new text copy with 500 entries (~1 KB each) in history ---
  const db = require(path.join(OLD, 'db.js'));
  for (let i = 0; i < 500; i++) db.insertEntry(`entry ${i} `.padEnd(1000, 'x'), 'text');
  let k = 0;
  await time('OLD record a copy (500 entries): sync rewrite of the file', () => { db.insertEntry(`new copy ${k++}`, 'text'); }, 20);
  const { PersistentJsonStore } = require(path.join(NEW, 'storage/persistentJsonStore.js'));
  const { HistoryRepository, createEmptyHistory, parseHistoryData } = require(path.join(NEW, 'storage/historyRepository.js'));
  const { createStorageCodec } = require(path.join(NEW, 'encrypting.js'));
  const store = new PersistentJsonStore({ filePath: path.join(app.getPath('userData'), 'new-history.json'), createDefault: createEmptyHistory, parse: parseHistoryData, codec: createStorageCodec() });
  const repo = new HistoryRepository(store, { maxHistory: () => 500 });
  for (let i = 0; i < 500; i++) repo.insert(`entry ${i} `.padEnd(1000, 'x'), 'text');
  await time('NEW record a copy (500 entries): in-memory + debounced', () => { repo.insert(`new copy ${k++}`, 'text'); }, 20);
  await time('NEW deferred write, off the hot path (async, per burst)', () => store.flush(), 20);
  app.exit(0);
});
