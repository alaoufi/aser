// يولّد مشروع تطبيق أندرويد (Trusted Web Activity) من store/android/twa-manifest.json
// بمكتبة Google نفسها التي يستعملها PWABuilder وBubblewrap (@bubblewrap/core).
// يستعمله سير «بناء تطبيق أندرويد» (.github/workflows/android-build.yml).
// Usage: node store/android/generate.cjs <output-dir>
const fs = require("fs");
const path = require("path");
const { TwaGenerator, TwaManifest, ConsoleLog } = require("@bubblewrap/core");

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
  console.log(
    `generated ${manifest.packageId} ${manifest.appVersionName} (${manifest.appVersionCode}) for https://${manifest.host}`,
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
