// Launches the built app with the smoke test preloaded and a throwaway profile.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron'); // Resolves to the Electron binary path in Node.
const root = path.resolve(__dirname, '../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clippo-e2e-'));
const flags = process.platform === 'linux' ? ['--no-sandbox'] : [];

const result = spawnSync(
  electron,
  [...flags, `--user-data-dir=${profile}`, '-r', path.join(__dirname, 'smoke.js'), root],
  { stdio: 'inherit' },
);
fs.rmSync(profile, { recursive: true, force: true });
process.exit(result.status ?? 1);
