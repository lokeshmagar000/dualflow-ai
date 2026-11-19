/**
 * Runs after the app is packed, before the .dmg is made.
 * Macs with Apple chips (M1, M2, ...) refuse apps with no signature at all
 * ("the app is damaged"). We add a free "ad-hoc" signature ("-") so it opens
 * after the one-time "Open anyway" step. A paid Apple Developer account
 * ($99/year) would remove that step; not needed for now.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  console.log(`Ad-hoc signed ${app}`);
};
