import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { Reader, type CountryResponse } from "mmdb-lib";

/**
 * دولة عنوان IP محليًا من قاعدة DB-IP المجانية (IP to Country Lite، ترخيص CC BY 4.0):
 * تُنزَّل مرة في الشهر إلى الذاكرة (نحو 8.5 ميجابايت)، ولا يُرسل أي عنوان لأي جهة.
 * إن تعذّر التنزيل تبقى الدولة فارغة ولا يتأثر التقرير.
 */
type CountryRecord = CountryResponse;
let reader: Reader<CountryRecord> | null = null;
let loadedAt = 0;
let failedAt = 0;
let loading: Promise<void> | null = null;
const MONTH = 30 * 24 * 3600 * 1000;

async function download(): Promise<Buffer> {
  if (process.env.GEOIP_MMDB_GZ)
    return gunzipSync(await readFile(process.env.GEOIP_MMDB_GZ));
  const now = new Date();
  // أول الشهر قد لا يكون ملف الشهر الجديد منشورًا بعد: يُجرَّب الشهر السابق.
  for (const back of [0, 1]) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
    );
    const month = d.toISOString().slice(0, 7);
    const r = await fetch(
      `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`,
      { signal: AbortSignal.timeout(30_000) },
    ).catch(() => null);
    if (r?.ok) return gunzipSync(Buffer.from(await r.arrayBuffer()));
  }
  throw new Error("geo database unavailable");
}

async function ensure() {
  const fresh = reader && Date.now() - loadedAt < MONTH;
  const cooling = !reader && Date.now() - failedAt < 3600_000;
  // التنزيل في الإنتاج فقط (أو من ملف محلي GEOIP_MMDB_GZ)؛ الاختبارات والتطوير بلا شبكة خارجية.
  const allowed =
    process.env.GEOIP_MMDB_GZ ||
    (process.env.NODE_ENV === "production" &&
      process.env.GEOIP_DISABLED !== "true");
  if (fresh || cooling || !allowed) return;
  loading ??= download()
    .then((buf) => {
      reader = new Reader<CountryRecord>(buf);
      loadedAt = Date.now();
    })
    .catch(() => {
      failedAt = Date.now();
    })
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** رمز الدولة (ISO مثل NL) لكل عنوان، أو null إن لم يُعرف. */
export async function countriesOf(ips: string[]) {
  await ensure();
  const out = new Map<string, string | null>();
  for (const ip of ips) {
    let code: string | null = null;
    try {
      code = reader?.get(ip)?.country?.iso_code ?? null;
    } catch {
      code = null;
    }
    out.set(ip, code);
  }
  return out;
}
