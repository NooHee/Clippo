// Startup probe, preloaded with `electron -r scripts/perf/startup-probe.js .` (see bench-startup.sh).
// Records, relative to process start: app ready, page load, time until the history UI is in the
// DOM, time until web fonts are ready, plus the process count and memory a few seconds in.
const { app } = require('electron');
const t0 = Date.now() - process.uptime() * 1000; // process start (wall clock)
const ms = () => Math.round(Date.now() - t0);
if (!app.dock) app.dock = { setIcon() {}, hide() {}, show() {} }; // Linux shim for macOS-only API
const out = { readyMs: null, windows: 0 };
app.on('ready', () => { out.readyMs = ms(); });
app.on('browser-window-created', (_e, win) => {
  out.windows++;
  const idx = out.windows; // win1 is the popup; the old code also created a tooltip window at startup
  win.webContents.once('did-finish-load', async () => {
    out[`win${idx}_didFinishLoadMs`] = ms();
    try {
      const r = await win.webContents.executeJavaScript(`new Promise(res => {
        const start = performance.timeOrigin;
        const waitUi = () => new Promise(r => { const f = () => document.querySelector('.empty-state, .clipboard-list') ? r(performance.now()) : setTimeout(f, 5); f(); });
        Promise.all([waitUi(), document.fonts.ready.then(() => performance.now())]).then(([ui, fonts]) => res({ origin: start, ui, fonts }));
        setTimeout(() => res(null), 15000);
      })`);
      if (r) { out[`win${idx}_uiMs`] = Math.round(r.origin + r.ui - t0); out[`win${idx}_fontsReadyMs`] = Math.round(r.origin + r.fonts - t0); }
    } catch (e) { out[`win${idx}_err`] = String(e); }
  });
});
setTimeout(() => {
  const metrics = app.getAppMetrics();
  out.processes = metrics.length;
  out.totalWorkingSetMB = Math.round(metrics.reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024);
  console.log('PROBE ' + JSON.stringify(out));
  app.exit(0);
}, Number(process.env.PROBE_WAIT_MS || 6000));
