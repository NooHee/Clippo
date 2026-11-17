// Measures the main-process cost of the history hot paths on a realistic, "heavy" history:
// what one popup open sends over IPC, what one search keystroke costs, how long image rows
// block the main thread, and what one save serializes.
//
// It needs no Electron runtime: the repositories are plain TypeScript, and v8.serialize is the
// same structured clone algorithm Electron uses to copy IPC payloads between processes.
//
// Usage (after `npm run build`):
//   node scripts/perf/history-bench.js dist/main/main
// To compare with another version, build it in another checkout and pass its dist folder too:
//   node scripts/perf/history-bench.js /path/to/old/dist/main/main dist/main/main
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v8 = require('node:v8');
const { performance } = require('node:perf_hooks');

const SMALL_ENTRIES = 480; // typical copies: a URL, a sentence, a command
const CODE_ENTRIES = 15; // a copied source file, about 50 KB
const LOG_ENTRIES = 5; // a copied log or JSON dump, about 2 MB
const THUMBNAILS = 50; // screenshots in history
const THUMBNAIL_BYTES = 150_000; // a 640 px wide PNG thumbnail
const KEYSTROKES = ['c', 'co', 'con', 'cons', 'const'];

/** Deterministic pseudo random text so every run measures the same data. */
function text(length, seed) {
  const words = ['const', 'value', 'return', 'error', 'request', 'user', 'id', 'true', 'null', 'data', 'line'];
  let out = '';
  let state = seed;
  while (out.length < length) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out += words[state % words.length] + (state % 7 === 0 ? '\n' : ' ');
  }
  return out.slice(0, length);
}

function buildHistory(dist) {
  const { HistoryRepository, createEmptyHistory } = require(path.join(dist, 'storage/historyRepository.js'));
  let value = createEmptyHistory();
  const store = { get: () => value, set: (next) => { value = next; }, scheduleSave: () => undefined };
  const history = new HistoryRepository(store, { maxHistory: () => 500 });

  // Oldest first, so the large entries end up spread through the 200 most recent rows.
  const total = SMALL_ENTRIES + CODE_ENTRIES + LOG_ENTRIES;
  for (let i = 0; i < total; i++) {
    let content;
    if (i % 100 === 99) content = text(2_000_000, i);
    else if (i % 33 === 5) content = text(50_000, i);
    else content = `${i} ${text(200, i)}`;
    history.insert(content, 'text');
  }
  return { history, store };
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(fn, runs = 15) {
  fn(); // warm up the JIT
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

async function measureThumbnails(dist) {
  const { ImageStore } = require(path.join(dist, 'clipboard/imageStore.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clippo-bench-'));
  const store = new ImageStore(dir);
  fs.mkdirSync(path.join(dir, 'thumbnails'), { recursive: true });
  const names = [];
  for (let i = 0; i < THUMBNAILS; i++) {
    const name = `${1_700_000_000_000 + i}_abcdef012345.png`;
    names.push(name);
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(16));
    fs.writeFileSync(path.join(dir, 'thumbnails', `thumb_v2_${name}`), Buffer.alloc(THUMBNAIL_BYTES, i));
  }

  // Old API: one synchronous read + base64 encode per row, on the main thread.
  if (typeof store.thumbnailDataUrl === 'function') {
    const start = performance.now();
    let bytes = 0;
    for (const name of names) bytes += store.thumbnailDataUrl(name).length;
    return { blockingMs: performance.now() - start, ipcBytes: bytes };
  }

  // New API: the protocol handler only resolves a path asynchronously; Chromium reads the file.
  const start = performance.now();
  const pending = names.map((name) => store.thumbnailFile(name));
  const blockingMs = performance.now() - start;
  await Promise.all(pending);
  return { blockingMs, ipcBytes: 0 };
}

function payloadOf(entries) {
  return v8.serialize(entries);
}

async function bench(dist) {
  const { history, store } = buildHistory(dist);
  const rows = history.list('');
  const payload = payloadOf(rows);
  const cloneMs = measure(() => v8.deserialize(payloadOf(history.list(''))));
  const searchMs = KEYSTROKES.reduce((sum, query) => sum + measure(() => history.list(query)), 0) / KEYSTROKES.length;
  const saveMs = measure(() => JSON.stringify(store.get()), 5);
  const savedBytes = JSON.stringify(store.get()).length;
  const thumbs = await measureThumbnails(dist);
  return {
    'popup open: rows sent': rows.length,
    'popup open: IPC payload (KB)': Math.round(payload.length / 1024),
    'popup open: list + structured clone (ms)': cloneMs.toFixed(2),
    'search keystroke (ms, median)': searchMs.toFixed(2),
    [`${THUMBNAILS} image rows: main thread blocked (ms)`]: thumbs.blockingMs.toFixed(2),
    [`${THUMBNAILS} image rows: bytes over IPC (KB)`]: Math.round(thumbs.ipcBytes / 1024),
    'save: JSON.stringify of history (ms)': saveMs.toFixed(1),
    'save: serialized size (MB)': (savedBytes / 1_000_000).toFixed(1),
  };
}

(async () => {
  const dists = process.argv.slice(2).map((dir) => path.resolve(dir));
  if (dists.length === 0) {
    console.error('Usage: node scripts/perf/history-bench.js <dist/main/main> [<other dist/main/main>]');
    process.exit(1);
  }
  const results = [];
  for (const dist of dists) results.push(await bench(dist));
  const labels = Object.keys(results[0]);
  const width = Math.max(...labels.map((label) => label.length));
  const header = dists.length === 2 ? ['before', 'after'] : ['value'];
  console.log(`${''.padEnd(width)}  ${header.map((h) => h.padStart(10)).join('  ')}`);
  for (const label of labels) {
    console.log(`${label.padEnd(width)}  ${results.map((r) => String(r[label]).padStart(10)).join('  ')}`);
  }
})();
