// Times what the popup actually waits for: a real `getHistory` / `searchHistory` IPC round trip
// in the built app, with a heavy history (480 small entries, 15 copied source files of 50 KB
// and 5 copied logs of 2 MB) loaded from a throwaway profile.
//
// Usage (after `npm run build`; on Linux run under `xvfb-run -a`):
//   node scripts/perf/ipc-bench.js .
// To compare two versions, pass the root of a second checkout (built) as well:
//   node scripts/perf/ipc-bench.js /path/to/old-checkout .
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.versions.electron) {
  runInsideApp();
} else {
  runAll(process.argv.slice(2));
}

/** Same deterministic data as history-bench.js. */
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

function writeHeavyHistory(profile) {
  const entries = [];
  for (let i = 0; i < 500; i++) {
    let content;
    if (i % 100 === 99) content = text(2_000_000, i);
    else if (i % 33 === 5) content = text(50_000, i);
    else content = `${i} ${text(200, i)}`;
    entries.unshift({ id: i + 1, content, type: 'text', preview: content.slice(0, 200).replace(/\s+/g, ' ').trim(), createdAt: 1_700_000_000_000 + i, pinnedAt: null, usageCount: 0 });
  }
  // Plain JSON: the store migrates it (and encryption is unavailable on Linux CI anyway).
  fs.writeFileSync(path.join(profile, 'clippo-history.json'), JSON.stringify({ entries, nextId: 501 }));
}

function runAll(roots) {
  if (roots.length === 0) {
    console.error('Usage: node scripts/perf/ipc-bench.js <app root> [<other app root>]');
    process.exit(1);
  }
  const electron = require('electron');
  const flags = process.platform === 'linux' ? ['--no-sandbox'] : [];
  for (const root of roots) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clippo-ipc-bench-'));
    writeHeavyHistory(profile);
    const result = spawnSync(electron, [...flags, `--user-data-dir=${profile}`, '-r', __filename, path.resolve(root)], {
      encoding: 'utf-8',
    });
    fs.rmSync(profile, { recursive: true, force: true });
    const lines = (result.stdout ?? '').split('\n').filter((line) => line.startsWith('[bench]'));
    console.log(`${path.resolve(root)}\n${lines.map((line) => `  ${line.slice(8)}`).join('\n')}`);
  }
}

function runInsideApp() {
  const { app, BrowserWindow } = require('electron');
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  app.whenReady().then(async () => {
    let win;
    while (!(win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')))) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    while (win.webContents.isLoading()) await new Promise((resolve) => setTimeout(resolve, 25));
    const time = (expression) =>
      win.webContents.executeJavaScript(`(async () => {
        const samples = [];
        for (let i = 0; i < 21; i++) {
          const start = performance.now();
          const rows = await ${expression};
          samples.push(performance.now() - start);
          if (!rows.length) throw new Error('empty result');
        }
        return samples;
      })()`);
    const open = await time(`window.clipstack.getHistory('')`);
    const search = await time(`window.clipstack.searchHistory('const')`);
    console.log(`[bench] popup open, getHistory round trip (median ms): ${median(open).toFixed(2)}`);
    console.log(`[bench] search keystroke round trip (median ms):      ${median(search).toFixed(2)}`);
    app.exit(0);
  });
}
