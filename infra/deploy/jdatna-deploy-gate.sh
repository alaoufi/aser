#!/usr/bin/env bash
# بوابة حساب النشر المخصص (jdatna-deploy): الأمر الإجباري لمفتاح GitHub.
# تقبل فقط: deploy <sha40> | deploy-migrate <sha40> | rollback | status
# ثم تشغّل السكربت الحقيقي عبر sudo مقيد بهذا الملف وحده — لا shell ولا عضوية Docker.
set -euo pipefail
cmd=${SSH_ORIGINAL_COMMAND:-}
if [[ "$cmd" =~ ^(deploy|deploy-migrate)\ ([0-9a-f]{40})$ ]]; then
  exec sudo -n /usr/local/sbin/jdatna-deploy "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
elif [[ "$cmd" =~ ^(rollback|status)$ ]]; then
  exec sudo -n /usr/local/sbin/jdatna-deploy "${BASH_REMATCH[1]}"
fi
echo "rejected" >&2
exit 2
