// electron-builder `afterPack` hook: code-signs the macOS app with a stable identity.
//
// Why: macOS ties privacy permissions (Accessibility, used by auto-paste) to the app's
// "designated requirement". An ad-hoc signature's requirement is the hash of the binary itself,
// so every new build looks like a different app: the Accessibility toggle stays ON in System
// Settings, but macOS no longer honours it and auto-paste silently stops working.
// Signing every build with the same certificate makes the requirement
// `identifier "com.clippo.app" and certificate leaf = H"<cert hash>"`, which does not change
// between builds, so the permission survives updates.
//
// The certificate is a free self-signed one (created once with openssl, kept out of the repo), imported into
// the CI keychain from repository secrets. When it is missing (local builds, forks) the app is
// ad-hoc signed as before, which Apple Silicon requires to launch at all.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function signMacApp(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const identity = process.env.CLIPPO_SIGN_IDENTITY;
  const bundleId = context.packager.appInfo.id;

  if (!identity) {
    console.warn('  • CLIPPO_SIGN_IDENTITY not set: ad-hoc signing. Accessibility must be re-granted after each update.');
  }

  const codesign = (...args) => execFileSync('codesign', args, { stdio: 'inherit' });
  codesign('--force', '--deep', '--sign', identity || '-', '--identifier', bundleId, appPath);
  codesign('--verify', '--deep', '--strict', '--verbose=2', appPath);
  // Print the designated requirement in the build log so it can be compared across releases.
  codesign('--display', '--requirements', '-', appPath);
};
