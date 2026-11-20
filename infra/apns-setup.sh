#!/usr/bin/env bash
# إشعارات تطبيق الآيفون (APNs) لأكلات جدتنا: يحفظ مفتاح Apple في /etc/jdatna/runtime.env بعد التحقق منه.
# يشغّله المالك على الخادم بعد نسخ ملف المفتاح بـ scp (Issue server-edge#27):
#   bash apns-setup.sh /root/jdatna-apns.p8 6WWKPH6Q4U
# الخطوات:
#   1. يتأكد أن الملف مفتاح P-256 وأن رقم المفتاح 10 أحرف.
#   2. يسأل Apple فعلًا من حاوية التطبيق (المفتاح يمر عبر stdin، لا يُطبع ولا يظهر في الأوامر):
#      رد 400 BadDeviceToken لجهاز وهمي يعني أن Apple قبلت المفتاح.
#   3. يحفظ APNS_KEY_ID وAPNS_TEAM_ID وAPNS_KEY_P8_BASE64 في runtime.env (تُستبدل أسطر APNS_ القديمة فقط).
#   4. يحذف نسخة الملف من الخادم.
# لا يطبع المفتاح أبدًا. لا يلمس موارد أي موقع آخر. بعده: نشر (أو إعادة إنشاء الحاوية) ليقرأه التطبيق.
set -euo pipefail
KEY_FILE=${1:?usage: apns-setup.sh <AuthKey.p8> <KEY_ID>}
KEY_ID=${2:?usage: apns-setup.sh <AuthKey.p8> <KEY_ID>}
TEAM_ID=${3:-F6RN596WCX}
ENV_FILE=/etc/jdatna/runtime.env

[[ "$KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "NOT OK: KEY_ID must be 10 letters/digits"; exit 2; }
[[ "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "NOT OK: TEAM_ID must be 10 letters/digits"; exit 2; }
[[ -f "$KEY_FILE" ]] || { echo "NOT OK: $KEY_FILE not found (copy it with scp first)"; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo "NOT OK: $ENV_FILE not found"; exit 2; }
openssl pkey -in "$KEY_FILE" -noout -text 2>/dev/null | grep -q -E "prime256v1|P-256" \
  || { echo "NOT OK: the file is not an Apple .p8 key (EC P-256)"; exit 2; }
echo "Key file: EC P-256 ok"

# فحص Apple يعمل بـ node من صورة تطبيق جدتنا نفسها: الحاوية العاملة إن وُجدت، وإلا حاوية مؤقتة
# من آخر صورة jdatna-application (تُحذف بعد الفحص). لا يُلمس أي موقع آخر.
APP=$(docker ps --format '{{.Names}} {{.Image}}' \
  | awk '$2 ~ /^jdatna-application(:|$)/ && $2 !~ /migrat/ {print $1; exit}')
if [[ -n "$APP" ]]; then
  RUN=(docker exec -i -e K="$KEY_ID" -e T="$TEAM_ID" "$APP" node)
else
  IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^jdatna-application:' | grep -v migrat | head -1)
  [[ -n "$IMAGE" ]] || { echo "NOT OK: no jdatna-application image on this server"; docker ps --format '{{.Names}} {{.Image}}' | grep -i jdatna; exit 3; }
  RUN=(docker run --rm -i --read-only --cap-drop ALL --security-opt no-new-privileges:true \
    --memory 128m --pids-limit 32 -e K="$KEY_ID" -e T="$TEAM_ID" --entrypoint node "$IMAGE")
fi

CHECK=$(cat <<'JS'
const crypto = require("crypto"), http2 = require("http2");
let pem = "";
process.stdin.on("data", (d) => (pem += d)).on("end", () => {
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1") { console.log("NOT OK: not a P-256 key"); process.exit(2); }
  const b = (v) => Buffer.from(v).toString("base64url");
  const head = b(JSON.stringify({ alg: "ES256", kid: process.env.K })) + "." +
    b(JSON.stringify({ iss: process.env.T, iat: Math.floor(Date.now() / 1000) }));
  const jwt = head + "." + b(crypto.sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }));
  const s = http2.connect("https://api.push.apple.com");
  s.on("error", (e) => { console.log("NOT OK: cannot reach Apple (" + e.code + ")"); process.exit(3); });
  const r = s.request({ ":method": "POST", ":path": "/3/device/" + "0".repeat(64),
    authorization: "bearer " + jwt, "apns-topic": "com.jdatna.app", "apns-push-type": "alert" });
  let status = 0, body = "";
  r.on("response", (h) => (status = h[":status"]));
  r.setEncoding("utf8");
  r.on("data", (c) => (body += c));
  r.on("end", () => {
    s.close();
    let reason = body;
    try { reason = JSON.parse(body).reason; } catch {}
    console.log("Apple answered: " + status + " " + reason);
    process.exit(status === 400 && reason === "BadDeviceToken" ? 0 : 4);
  });
  r.end(JSON.stringify({ aps: { alert: "check" } }));
});
JS
)
if ! "${RUN[@]}" -e "$CHECK" < "$KEY_FILE"; then
  echo "NOT OK: Apple did not accept this key for com.jdatna.app. Nothing was saved."
  exit 4
fi
echo "Apple accepted the key for com.jdatna.app"

tmp=$(mktemp /etc/jdatna/.runtime.env.XXXXXX)
grep -v '^APNS_' "$ENV_FILE" > "$tmp" || true
{
  echo "APNS_KEY_ID=$KEY_ID"
  echo "APNS_TEAM_ID=$TEAM_ID"
  printf 'APNS_KEY_P8_BASE64=%s\n' "$(base64 -w0 "$KEY_FILE")"
} >> "$tmp"
# الكتابة فوق الملف نفسه تُبقي صاحبه وصلاحياته كما هي.
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
shred -u "$KEY_FILE" 2>/dev/null || rm -f "$KEY_FILE"
echo "Saved: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8_BASE64 in $ENV_FILE ($(grep -c '^APNS_' "$ENV_FILE") lines). Key copy removed."
echo "DONE. Next: deploy (or recreate the app container) so the app reads the key."
