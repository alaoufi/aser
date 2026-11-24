// يولّد مشروع تطبيق أندرويد (Trusted Web Activity) من store/android/twa-manifest.json
// بمكتبة Google نفسها التي يستعملها PWABuilder وBubblewrap (@bubblewrap/core).
// يستعمله سير «بناء تطبيق أندرويد» (.github/workflows/android-build.yml).
// Usage: node store/android/generate.cjs <output-dir>
const fs = require("fs");
const path = require("path");
const { TwaGenerator, TwaManifest, ConsoleLog } = require("@bubblewrap/core");

const TARGET_SDK = 36;

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error("usage: generate.cjs <output-dir>");
  const json = JSON.parse(
    fs.readFileSync(path.join(__dirname, "twa-manifest.json"), "utf8"),
  );
  const manifest = new TwaManifest(json);
  const errors = manifest.validate();
  if (errors) throw new Error(`twa-manifest.json: ${errors}`);
  fs.mkdirSync(out, { recursive: true });
  await new TwaGenerator().createTwaProject(
    out,
    manifest,
    new ConsoleLog("generate"),
  );
  // Google Play تشترط استهداف أندرويد 16 (API 36)، وقالب Bubblewrap 1.24.1 يستهدف 35:
  // رفضت Play النسخة 1.0.2 بـ «Target SDK of artifact is too low» (2026-11-24).
  const gradle = path.join(out, "app", "build.gradle");
  const source = fs.readFileSync(gradle, "utf8");
  const patched = source.replace(
    /targetSdkVersion \d+/,
    `targetSdkVersion ${TARGET_SDK}`,
  );
  if (!/targetSdkVersion 36\b/.test(patched))
    throw new Error("could not set targetSdkVersion in app/build.gradle");
  fs.writeFileSync(gradle, patched);
  console.log(
    `generated ${manifest.packageId} ${manifest.appVersionName} (${manifest.appVersionCode}) for https://${manifest.host}`,
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
