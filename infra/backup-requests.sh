#!/usr/bin/env bash
# ينفّذ طلب «خذ نسخة الآن» أو «حذف» من الإدارة: يأخذ طلبًا واحدًا معلّقًا (إن وُجد) وينفّذه ويكتب نتيجته.
# تشغّله خدمة jdatna-backup-requests كل دقيقة. التطبيق يكتب الطلب فقط ولا يملك صلاحية النسخ.
set -uo pipefail
umask 077
sql() { docker exec -i jdatna-db psql -X -At -q -v ON_ERROR_STOP=1 -U jdatna_admin -d jdatna; }
# طلب علق «قيد التنفيذ» أكثر من ساعة (انقطاع أثناءه) يُعلَّم فاشلًا ليُفتح الباب لطلب جديد.
echo "UPDATE jdatna.backup_requests SET status='failed',finished_at=now(),error='انقطع التنفيذ' WHERE status='running' AND started_at < now() - interval '1 hour';" | sql >/dev/null 2>&1 || exit 0
claim=$(echo "UPDATE jdatna.backup_requests SET status='running',started_at=now() WHERE id=(SELECT id FROM jdatna.backup_requests WHERE status='pending' ORDER BY requested_at LIMIT 1) RETURNING id||' '||kind||' '||coalesce(target,'-');" | sql 2>/dev/null) || exit 0
[[ -n "$claim" ]] || exit 0
read -r id kind target <<<"$claim"
[[ "$id" =~ ^[0-9a-f-]{36}$ ]] || exit 0
NAME='^jdatna-((media|codedb)-)?[0-9]{8}T[0-9]{6}Z\.tar\.gpg$'

# «حذف»: من الخادم ثم من التخزين الخارجي (R2). لا تُحذف أحدث نسخة كاملة أو يومية على الخادم أبدًا.
if [[ "$kind" == delete ]]; then
  fail() { echo "UPDATE jdatna.backup_requests SET status='failed',finished_at=now(),error='$1' WHERE id='$id';" | sql >/dev/null; exit 0; }
  [[ "$target" =~ $NAME ]] || fail "اسم النسخة غير صالح"
  if [[ "$target" =~ ^jdatna-(media|codedb)- ]]; then dir=/var/backups/jdatna/manual; else dir=/var/backups/jdatna; fi
  newest=$(ls -1t /var/backups/jdatna/jdatna-[0-9]*.tar.gpg 2>/dev/null | head -1 | xargs -r basename)
  [[ "$target" != "$newest" ]] || fail "أحدث نسخة كاملة على الخادم لا تُحذف"
  exec 9>/run/lock/jdatna-backup.lock
  flock -w 600 9 || fail "نسخة أخرى قيد التنفيذ، أعد المحاولة"
  rm -f -- "$dir/$target" "$dir/$target.sha256" "$dir/$target.daily" "$dir/$target.safety"
  remote_ok=true
  bash /opt/jdatna/infra/backup-remote-delete.sh "$target" >/dev/null 2>&1; rc=$?
  # 3 = التخزين الخارجي غير مهيأ، فلا نسخة هناك أصلًا.
  [[ $rc -eq 0 || $rc -eq 3 ]] || remote_ok=false
  if $remote_ok; then
    echo "DELETE FROM jdatna.backup_runs WHERE file='$target'; UPDATE jdatna.backup_requests SET status='done',finished_at=now(),file='$target' WHERE id='$id';" | sql >/dev/null
  else
    echo "UPDATE jdatna.backup_runs SET on_server=false WHERE file='$target'; UPDATE jdatna.backup_requests SET status='failed',finished_at=now(),error='حُذفت من الخادم، وتعذّر حذفها من التخزين الخارجي (R2). أعد المحاولة' WHERE id='$id';" | sql >/dev/null
  fi
  exit 0
fi
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
