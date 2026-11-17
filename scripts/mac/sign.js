// electron-builder `afterPack` hook: flips the Electron fuses, then code-signs the macOS app with a
// stable identity.
//
// Fuses are on/off switches compiled into the Electron binary. Some default to "on" for
// developer convenience, for example ELECTRON_RUN_AS_NODE, which turns the app binary into a
// plain Node.js interpreter. macOS attributes code run that way to Clippo, so it would inherit
// Clippo's Accessibility permission and its Keychain access (the key that decrypts the history).
// Turning those fuses off removes that path. Fuses must be flipped before signing, because
// changing the binary invalidates its signature. electron-builder's own `electronFuses` option
// runs after this hook, which is why the fuses are flipped here instead.
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

/** See https://www.electronjs.org/docs/latest/tutorial/fuses for what each fuse does. */
async function flipSecurityFuses(electronBinaryPath) {
  // @electron/fuses is an ES module; this hook is CommonJS, so it is loaded with import().
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // Off: these let another program run its own code as Clippo.
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // On: only load the app from app.asar, and check app.asar against the hash electron-builder
    // stores in Info.plist, so the JavaScript cannot be swapped after the app is signed.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
}

exports.flipSecurityFuses = flipSecurityFuses;

exports.default = async function signMacApp(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await flipSecurityFuses(appPath);
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
