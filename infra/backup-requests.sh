#!/usr/bin/env bash
# ينفّذ طلب «خذ نسخة الآن» من الإدارة: يأخذ طلبًا واحدًا معلّقًا (إن وُجد) وينفّذه ويكتب نتيجته.
# تشغّله خدمة jdatna-backup-requests كل دقيقة. التطبيق يكتب الطلب فقط ولا يملك صلاحية النسخ.
set -uo pipefail
umask 077
sql() { docker exec -i jdatna-db psql -X -At -q -v ON_ERROR_STOP=1 -U jdatna_admin -d jdatna; }
# طلب علق «قيد التنفيذ» أكثر من ساعة (انقطاع أثناءه) يُعلَّم فاشلًا ليُفتح الباب لطلب جديد.
echo "UPDATE jdatna.backup_requests SET status='failed',finished_at=now(),error='انقطع التنفيذ' WHERE status='running' AND started_at < now() - interval '1 hour';" | sql >/dev/null 2>&1 || exit 0
claim=$(echo "UPDATE jdatna.backup_requests SET status='running',started_at=now() WHERE id=(SELECT id FROM jdatna.backup_requests WHERE status='pending' ORDER BY requested_at LIMIT 1) RETURNING id||' '||kind;" | sql 2>/dev/null) || exit 0
[[ -n "$claim" ]] || exit 0
id=${claim%% *}
kind=${claim##* }
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || exit 0
log=$(mktemp)
trap 'rm -f -- "$log"' EXIT
case "$kind" in
  full) systemctl start jdatna-backup.service > "$log" 2>&1; status=$?
        file=$(ls -1t /var/backups/jdatna/jdatna-[0-9]*.tar.gpg 2>/dev/null | head -1 | xargs -r basename) ;;
  media|codedb) bash /opt/jdatna/infra/backup-manual.sh "$kind" > "$log" 2>&1; status=$?
        file=$(tail -1 "$log") ;;
  *) status=2; file= ;;
esac
if [[ $status -eq 0 && "$file" =~ ^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$ ]]; then
  echo "UPDATE jdatna.backup_requests SET status='done',finished_at=now(),file='$file' WHERE id='$id';" | sql >/dev/null
else
  # سبب الفشل بلا علامات تنصيص، وبحد 300 حرف.
  reason=$(tail -3 "$log" | tr -d "'\\\\" | tr '\n' ' ' | cut -c1-300)
  echo "UPDATE jdatna.backup_requests SET status='failed',finished_at=now(),error='${reason:-فشل النسخ}' WHERE id='$id';" | sql >/dev/null
fi
