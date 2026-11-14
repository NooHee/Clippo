// End-to-end smoke test of the real, built app:
//   copy -> live list update -> search -> click -> clipboard written -> popup hidden after the
//   renderer reset handshake -> next open is fresh -> Escape dismisses -> a newer GitHub release
//   shows the update banner, Download opens the right build, Skip hides it, and the in-place
//   install states (Update, progress, restarting, fallback) render.
//
// Run with `npm run test:e2e` (Linux CI: `xvfb-run -a npm run test:e2e`).
// Intended for Linux/CI. On macOS the paste step would also send a real Cmd+V to whatever app is
// frontmost, so prefer the manual checklist in docs/performance-and-auto-paste.md there.
const { app, clipboard, BrowserWindow, ipcMain, nativeImage, net, shell } = require('electron');
if (!app.dock) app.dock = { setIcon() {}, hide() {}, show() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
/** Polls until `probe` returns a truthy value (or the timeout), so slow CI machines do not flake. */
async function waitFor(probe, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value || Date.now() - start > timeoutMs) return value;
    await sleep(25);
  }
}
app.whenReady().then(async () => {
  const win = await waitFor(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')));
  const js = (code) => win.webContents.executeJavaScript(code);
  const previews = () => js(`[...document.querySelectorAll('.item-preview')].map(e => e.textContent)`);
  // Wait until the renderer has mounted and subscribed to live updates.
  await waitFor(() => !win.webContents.isLoading() && js(`!!document.querySelector('.empty-state, .clipboard-list')`).catch(() => false));
  check('only the popup window exists at startup (tooltip is lazy)', BrowserWindow.getAllWindows().length === 1);

  clipboard.writeText('first copied text');
  await waitFor(async () => (await previews()).includes('first copied text'));
  clipboard.writeText('second copied text');
  win.show(); win.focus();
  const items = await waitFor(async () => {
    const current = await previews();
    return current[0] === 'second copied text' ? current : null;
  }) ?? (await previews());
  check('new copies appear live in the list, newest first', items[0] === 'second copied text' && items[1] === 'first copied text', JSON.stringify(items));

  // Type a search query through React's input
  await js(`(() => { const i = document.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'first'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  const filtered = await js(`[...document.querySelectorAll('.item-preview')].map(e => e.textContent)`);
  check('search filters the list', filtered.length === 1 && filtered[0] === 'first copied text', JSON.stringify(filtered));

  let ackAt = null; ipcMain.once('popup-reset-done', () => { ackAt = Date.now(); });
  const clickedAt = Date.now();
  await js(`document.querySelector('.clipboard-item').click()`);
  const t0 = Date.now(); while (win.isVisible() && Date.now() - t0 < 2000) await sleep(2);
  const hiddenAt = Date.now();
  check('clicking an entry puts it on the clipboard', clipboard.readText() === 'first copied text', JSON.stringify(clipboard.readText()));
  check('clicking an entry hides the popup', !win.isVisible(), `(${hiddenAt - clickedAt} ms)`);
  check('hide waited for the renderer reset acknowledgement, not the timeout', ackAt !== null && ackAt - clickedAt < 150, `(ack after ${ackAt && ackAt - clickedAt} ms)`);
  check('opacity restored after hide', win.getOpacity() === 1);

  await sleep(300);
  clipboard.writeText('third copied text'); await sleep(700);
  win.show(); win.focus(); await sleep(50);
  const reopened = await js(`({ q: document.querySelector('input').value, items: [...document.querySelectorAll('.item-preview')].map(e => e.textContent) })`);
  check('next open shows a reset search and fresh order immediately', reopened.q === '' && reopened.items[0] === 'third copied text' && reopened.items[1] === 'first copied text', JSON.stringify(reopened));
  check('pasting from Clippo did not create a duplicate entry', reopened.items.filter((t) => t === 'first copied text').length === 1);

  // Images: a Retina-sized screenshot is recorded once and rendered from a small thumbnail.
  const pixels = Buffer.alloc(2880 * 1800 * 4, 120);
  clipboard.writeImage(nativeImage.createFromBitmap(pixels, { width: 2880, height: 1800 }));
  await sleep(1500);
  const thumb = await js(`new Promise((resolve) => { const f = () => { const img = document.querySelector('.item-image'); if (img && img.complete && img.naturalWidth) resolve({ w: img.naturalWidth, bytes: img.src.length }); else setTimeout(f, 20); }; f(); setTimeout(() => resolve(null), 3000); })`);
  check('copied image shows up with a downscaled thumbnail (<= 640 px wide)', thumb !== null && thumb.w <= 640, JSON.stringify(thumb));
  const imageRows = await js(`document.querySelectorAll('.item-image').length`);
  check('the unchanged image is recorded only once across poll ticks', imageRows === 1, `(${imageRows} rows)`);

  // Accessibility warning: off macOS the state is "unsupported", so no banner. Main pushes state
  // changes over IPC; simulate a revoked and then restored permission and check the banner follows.
  const bannerText = () => js(`document.querySelector('.accessibility-banner')?.textContent ?? null`);
  check('no Accessibility banner where auto-paste is unsupported', (await bannerText()) === null);
  win.webContents.send('accessibility-changed', 'missing');
  await sleep(150);
  const shown = await bannerText();
  check('Accessibility banner appears when the permission is lost', shown !== null && shown.includes('⌘V'), JSON.stringify(shown));
  if (process.env.CLIPPO_E2E_SCREENSHOT) {
    require('node:fs').writeFileSync(process.env.CLIPPO_E2E_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
  }
  win.webContents.send('accessibility-changed', 'granted');
  await sleep(150);
  check('Accessibility banner clears by itself once the permission is back', (await bannerText()) === null);

  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  const t1 = Date.now(); while (win.isVisible() && Date.now() - t1 < 2000) await sleep(2);
  check('Escape dismisses the popup', !win.isVisible());

  // Updates: GitHub answers with a newer release (stubbed, so the test is offline and stable).
  const requested = [];
  const opened = [];
  net.fetch = async (url, init) => {
    requested.push({ url, userAgent: new Headers(init.headers).get('user-agent') });
    const download = (name) => ({ name, browser_download_url: `https://github.com/NooHee/Clippo/releases/download/v9.9.9/${name}` });
    return new Response(JSON.stringify({
      tag_name: 'v9.9.9', html_url: 'https://github.com/NooHee/Clippo/releases/tag/v9.9.9', draft: false, prerelease: false,
      published_at: '2026-11-20T10:00:00Z', assets: [download('Clippo-9.9.9-arm64-mac.zip'), download('Clippo-9.9.9.dmg')],
    }), { status: 200, headers: { etag: '"e2e"' } });
  };
  shell.openExternal = async (url) => { opened.push(url); };
  await sleep(300);
  win.show(); win.focus(); await sleep(100);
  check('no update banner before any check', (await js(`document.querySelectorAll('.update-banner').length`)) === 0);
  check('no request to GitHub on its own in an unpackaged run', requested.length === 0);
  await js(`document.querySelector('.header-btn.icon-btn').click()`); await sleep(200);
  await js(`document.querySelector('.settings-update-btn').click()`); await sleep(400);
  const settingsLine = await js(`document.querySelector('.settings-update-status')?.textContent ?? ''`);
  check('"Check now" in Settings asks the GitHub releases API', requested.length === 1 && requested[0].url === 'https://api.github.com/repos/NooHee/Clippo/releases/latest' && requested[0].userAgent === `Clippo/${app.getVersion()}`, JSON.stringify(requested));
  check('Settings shows the new version', settingsLine.includes('9.9.9'), JSON.stringify(settingsLine));
  await js(`document.querySelector('.settings-cancel-btn').click()`); await sleep(200);
  const banner = await js(`document.querySelector('.update-banner')?.textContent ?? ''`);
  check('the history view shows the update banner', banner.includes('Clippo 9.9.9 is available'), JSON.stringify(banner));
  await js(`document.querySelector('.update-banner-btn').click()`); await sleep(100);
  const expectedBuild = process.arch === 'arm64' ? 'Clippo-9.9.9-arm64-mac.zip' : 'Clippo-9.9.9.dmg';
  check('Download opens the build for this Mac in the browser', opened.length === 1 && opened[0].endsWith(expectedBuild), JSON.stringify(opened));
  await js(`document.querySelector('.update-banner-dismiss').click()`); await sleep(200);
  check('Skip this version hides the banner', (await js(`document.querySelectorAll('.update-banner').length`)) === 0);
  const savedSettings = await js(`window.clipstack.getSettings()`);
  check('the skipped version is remembered in the settings', savedSettings.skippedUpdateVersion === '9.9.9', JSON.stringify(savedSettings.skippedUpdateVersion));
  check('an unpackaged run cannot install in place, so it offers the download', (await js(`window.clipstack.getUpdateStatus()`)).canInstall === false);

  // In-place install UI: a packaged Mac build pushes these statuses while it downloads and restarts.
  const offered = { version: '9.9.10', releaseUrl: 'https://github.com/NooHee/Clippo/releases/tag/v9.9.10', downloadUrl: 'https://github.com/NooHee/Clippo/releases/tag/v9.9.10', publishedAt: null, skipped: false };
  const base = { currentVersion: app.getVersion(), lastCheckedAt: Date.now(), canInstall: true };
  const push = async (status) => { win.webContents.send('update-status-changed', status); await sleep(150); };
  const updateBannerText = () => js(`document.querySelector('.update-banner')?.textContent ?? ''`);
  await push({ ...base, state: 'available', update: offered, installFailed: false });
  check('a Mac that can install shows an Update button', (await js(`document.querySelector('.update-banner-btn')?.textContent`)) === 'Update');
  await push({ ...base, state: 'downloading', update: offered, percent: 42 });
  const progressWidth = await js(`document.querySelector('.update-banner-progress-fill')?.style.width`);
  check('the banner shows the download progress', (await updateBannerText()).includes('42%') && progressWidth === '42%', JSON.stringify(await updateBannerText()));
  await push({ ...base, state: 'installing', update: offered });
  check('the banner says Clippo will restart', (await updateBannerText()).includes('will restart'), JSON.stringify(await updateBannerText()));
  await push({ ...base, state: 'available', update: offered, installFailed: true });
  check('a failed install falls back to the download button', (await js(`document.querySelector('.update-banner-btn')?.textContent`)) === 'Download', JSON.stringify(await updateBannerText()));

  // Run against a throwaway profile so the developer's real history is never touched.
  console.log(results.join('\n'));
  app.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
});
