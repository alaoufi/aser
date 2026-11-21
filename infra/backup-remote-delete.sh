#!/usr/bin/env bash
# حذف نسخة احتياطية من التخزين الخارجي (Cloudflare R2، واجهة S3)، بطلب «حذف» من تقرير الإدارة.
# الاستخدام: backup-remote-delete.sh jdatna-….tar.gpg
# الخروج: 0 حُذفت (أو لم تكن موجودة)، 3 التخزين الخارجي غير مهيأ، غير ذلك فشل الحذف.
# الإعداد نفسه الذي يستعمله الرفع: /etc/jdatna/secrets/r2.env (مفتاح يسمح بالحذف من حاوية النسخ).
set -euo pipefail
umask 077
name=${1:?backup file name}
config=/etc/jdatna/secrets/r2.env
[[ -f "$config" ]] || exit 3
# shellcheck disable=SC1090
source "$config"
[[ -n "${R2_ENDPOINT:-}" && -n "${R2_BUCKET:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]] || exit 3
[[ "$R2_ENDPOINT" == https://* ]] || { echo "R2_ENDPOINT must be https" >&2; exit 2; }
[[ "$name" =~ ^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$ ]] || { echo "not a backup file: $name" >&2; exit 2; }
# المفتاح لا يظهر في قائمة العمليات: يُقرأ من ملف إعداد مؤقت لا من سطر الأمر.
auth=$(mktemp)
trap 'rm -f -- "$auth"' EXIT
printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" > "$auth"
# S3 يعيد 204 للحذف، ولو لم يكن الملف موجودًا.
curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 120 \
  --config "$auth" --aws-sigv4 "aws:amz:auto:s3" \
  -X DELETE "${R2_ENDPOINT%/}/$R2_BUCKET/$name" >/dev/null
