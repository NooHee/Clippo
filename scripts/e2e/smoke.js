// End-to-end smoke test of the real, built app:
//   copy -> live list update -> search -> click -> clipboard written -> popup hidden after the
//   renderer reset handshake -> next open is fresh -> Escape dismisses.
//
// Run with `npm run test:e2e` (Linux CI: `xvfb-run -a npm run test:e2e`).
// Intended for Linux/CI. On macOS the paste step would also send a real Cmd+V to whatever app is
// frontmost, so prefer the manual checklist in docs/performance-and-auto-paste.md there.
const { app, clipboard, BrowserWindow, ipcMain, nativeImage } = require('electron');
if (!app.dock) app.dock = { setIcon() {}, hide() {}, show() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
app.whenReady().then(async () => {
  await sleep(2500);
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html'));
  const js = (code) => win.webContents.executeJavaScript(code);
  check('only the popup window exists at startup (tooltip is lazy)', BrowserWindow.getAllWindows().length === 1);

  clipboard.writeText('first copied text');
  await sleep(700);
  clipboard.writeText('second copied text');
  await sleep(700);
  win.show(); win.focus();
  await sleep(300);
  const items = await js(`[...document.querySelectorAll('.item-preview')].map(e => e.textContent)`);
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

  // Run against a throwaway profile so the developer's real history is never touched.
  console.log(results.join('\n'));
  app.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
});
