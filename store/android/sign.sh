#!/usr/bin/env bash
# يوقّع ملف .aab بمفتاح الرفع، ثم يتأكد أن بصمة المفتاح إحدى بصمتي التطبيق المعروفتين
# (مفتاح Google Play أو مفتاح الرفع في src/server/settings.ts). مفتاح غير صحيح = فشل البناء،
# لأن Google Play سترفض الملف، ولأن الموقع لن يثق بالتطبيق فيظهر شريط العنوان.
# Usage: KEYSTORE=... KEYSTORE_PASSWORD=... KEY_PASSWORD=... sign.sh <aab> <alias>
set -euo pipefail
aab="$1"
alias="$2"
: "${KEYSTORE:?}" "${KEYSTORE_PASSWORD:?}" "${KEY_PASSWORD:?}"
known="44:E3:68:B2:E0:67:D3:ED:83:C3:A6:71:32:2F:08:84:15:A8:3D:03:D3:3A:6A:EA:F3:83:B7:CC:95:69:BA:3C
6B:DB:F8:75:9A:D3:D2:6C:7C:37:70:C5:97:D0:AA:F0:D6:C6:68:8C:C5:9F:F3:C0:41:B9:B7:08:5A:49:B7:20"
print=$(keytool -list -v -keystore "$KEYSTORE" -storepass:env KEYSTORE_PASSWORD -alias "$alias" 2>/dev/null |
  grep -m1 'SHA256:' | sed 's/.*SHA256: *//' | tr -d '[:space:]')
if [ -z "$print" ]; then
  echo "تعذّرت قراءة المفتاح: تأكد من الملف وكلمة مروره والاسم المستعار $alias" >&2
  exit 1
fi
echo "بصمة المفتاح: $print"
if ! grep -qx "$print" <<<"$known"; then
  echo "هذا ليس مفتاح رفع أكلات جدتنا. استعمل android.keystore الذي رُفعت به النسخة الأولى." >&2
  exit 1
fi
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KEYSTORE" \
  -storepass:env KEYSTORE_PASSWORD -keypass:env KEY_PASSWORD "$aab" "$alias" >/dev/null
jarsigner -verify "$aab" | grep -q "jar verified" || {
  echo "فشل التحقق من التوقيع" >&2
  exit 1
}
echo "تم التوقيع والتحقق"
