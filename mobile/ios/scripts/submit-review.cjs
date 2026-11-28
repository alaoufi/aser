// يرسل إصدار الآيفون للمراجعة في App Store Connect بعد رفعه، بلا تدخل يدوي
// (طلب المالك 2026-11-24: «انت تقوم بذلك من رفع وغيره»).
// ينتظر معالجة البناء، وينشئ الإصدار (أو يستعمل الموجود)، ويربط البناء، ويكتب «ما الجديد»، ثم يرسله للمراجعة.
// المفاتيح من أسرار GitHub ولا تُطبع: ASC_KEY_ID و ASC_ISSUER_ID و ASC_KEY_P8.
// Usage: VERSION=1.0.1 BUILD_NUMBER=42 node mobile/ios/scripts/submit-review.cjs
const crypto = require("crypto");

const API = "https://api.appstoreconnect.apple.com/v1";
const BUNDLE = "com.jdatna.app";
const WHATS_NEW = "دعوة صديق صارت أسهل: إذا فتح صديقك رابط دعوتك ثم حمّل التطبيق، يُحسب لك تلقائيًا. مع تحسينات عامة.";

const b64url = (v) => Buffer.from(v).toString("base64url");
function token() {
  const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: key } = process.env;
  if (!kid || !iss || !key) throw new Error("ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 missing");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" }),
  )}`;
  const sig = crypto.sign("sha256", Buffer.from(body), { key, dsaEncoding: "ieee-p1363" });
  return `${body}.${sig.toString("base64url")}`;
}

async function call(method, path, body) {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    method,
    headers: { authorization: `Bearer ${token()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = (data?.errors || []).map((e) => `${e.title}: ${e.detail}`).join(" | ");
    const err = new Error(`${method} ${path.split("?")[0]}: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const version = process.env.VERSION;
  const build = process.env.BUILD_NUMBER;
  if (!/^\d+\.\d+(\.\d+)?$/.test(version || "") || !/^\d+$/.test(build || ""))
    throw new Error("VERSION and BUILD_NUMBER are required");

  const app = (await call("GET", `/apps?filter[bundleId]=${BUNDLE}&limit=1`)).data[0];
  if (!app) throw new Error(`app ${BUNDLE} not found`);
  console.log(`App ${BUNDLE}`);

  // 1) انتظار معالجة البناء (عادة 10–30 دقيقة).
  let buildId = null;
  for (let i = 0; i < 60; i++) {
    const found = (
      await call(
        "GET",
        `/builds?filter[app]=${app.id}&filter[version]=${build}&filter[preReleaseVersion.version]=${version}&limit=1`,
      )
    ).data[0];
    const state = found?.attributes?.processingState;
    console.log(`build ${version} (${build}): ${state || "not visible yet"}`);
    if (state === "VALID") {
      buildId = found.id;
      break;
    }
    if (state === "FAILED" || state === "INVALID") throw new Error(`build processing ${state}`);
    await sleep(60_000);
  }
  if (!buildId) throw new Error("build was not processed within 60 minutes");

  // 2) الإصدار في المتجر: الموجود بالرقم نفسه، أو جديد.
  let ver = (
    await call(
      "GET",
      `/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${version}&limit=1`,
    )
  ).data[0];
  if (!ver)
    ver = (
      await call("POST", "/appStoreVersions", {
        data: {
          type: "appStoreVersions",
          attributes: { platform: "IOS", versionString: version },
          relationships: { app: { data: { type: "apps", id: app.id } } },
        },
      })
    ).data;
  console.log(`App Store version ${version}: ${ver.attributes.appStoreState}`);

  // 3) ربط البناء بالإصدار، و«ما الجديد» لكل لغة.
  await call("PATCH", `/appStoreVersions/${ver.id}/relationships/build`, {
    data: { type: "builds", id: buildId },
  });
  console.log("Build attached");
  const locs = (await call("GET", `/appStoreVersions/${ver.id}/appStoreVersionLocalizations`)).data;
  for (const loc of locs)
    await call("PATCH", `/appStoreVersionLocalizations/${loc.id}`, {
      data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: { whatsNew: WHATS_NEW } },
    });
  console.log(`What's new set for ${locs.map((l) => l.attributes.locale).join(", ")}`);

  // 4) الإرسال للمراجعة: طلب مراجعة مفتوح أو جديد، ثم الإصدار فيه، ثم الإرسال.
  const open = (
    await call(
      "GET",
      `/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=1`,
    )
  ).data[0];
  const submission =
    open ||
    (
      await call("POST", "/reviewSubmissions", {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: "IOS" },
          relationships: { app: { data: { type: "apps", id: app.id } } },
        },
      })
    ).data;
  try {
    await call("POST", "/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: ver.id } },
        },
      },
    });
  } catch (err) {
    // الإصدار مضاف للطلب من محاولة سابقة: يُكمل الإرسال.
    if (err.status !== 409) throw err;
    console.log("Version already in the review submission");
  }
  await call("PATCH", `/reviewSubmissions/${submission.id}`, {
    data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } },
  });
  console.log(`DONE: ${version} (${build}) was sent to App Review`);
})().catch((err) => {
  console.error(`NOT OK: ${err.message}`);
  process.exit(1);
});
