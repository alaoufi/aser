#!/usr/bin/env bash
# رفع نسخة احتياطية مشفّرة إلى التخزين الخارجي (Cloudflare R2، واجهة S3).
# الاستخدام: backup-upload.sh /path/to/jdatna-….tar.gpg
# الخروج: 0 رُفعت، 3 التخزين الخارجي غير مهيأ، غير ذلك فشل الرفع.
# الإعداد في /etc/jdatna/secrets/r2.env (root، 600، لا يُحفظ في Git):
#   R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
#   R2_BUCKET=jdatna-backups
#   R2_ACCESS_KEY_ID=…
#   R2_SECRET_ACCESS_KEY=…
set -euo pipefail
umask 077
file=${1:?backup file}
config=/etc/jdatna/secrets/r2.env
[[ -f "$config" ]] || exit 3
# shellcheck disable=SC1090
source "$config"
[[ -n "${R2_ENDPOINT:-}" && -n "${R2_BUCKET:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]] || exit 3
[[ "$R2_ENDPOINT" == https://* ]] || { echo "R2_ENDPOINT must be https" >&2; exit 2; }
name=$(basename "$file")
[[ "$name" =~ ^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$ ]] || { echo "not a backup file: $name" >&2; exit 2; }
# المفتاح لا يظهر في قائمة العمليات: يُقرأ من ملف إعداد مؤقت لا من سطر الأمر.
auth=$(mktemp)
trap 'rm -f -- "$auth"' EXIT
printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" > "$auth"
curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 3600 \
  --config "$auth" --aws-sigv4 "aws:amz:auto:s3" \
  --upload-file "$file" "${R2_ENDPOINT%/}/$R2_BUCKET/$name" >/dev/null
