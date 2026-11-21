#!/usr/bin/env bash
# نسخة احتياطية كاملة مشفّرة لأكلات جدتنا (قاعدة البيانات، الإعدادات، الصور والمستندات).
#   backup.sh daily   النسخة اليومية (05:00 بتوقيت الرياض، jdatna-backup.timer): يُحفظ آخر 10 منها.
#   backup.sh         «خذ نسخة الآن» (jdatna-backup.service): يُحفظ آخر 5 منها.
#   نسخة الأمان قبل النشر (طلب المالك 2026-11-22: النسخ نسخة يومية واحدة فقط): يطلبها النشر بوضع العلامة
#   /run/jdatna-backup-safety قبل تشغيل الخدمة. مؤقتة ومخفية: لا تُرفع ولا تظهر في التقرير، وتحمل علامة
#   ‎.safety، ويحذفها النشر بعد نجاحه (ويُبقيها عند الفشل للاستعادة منها).
set -euo pipefail
umask 077
mode=${1:-deploy}
[[ "$mode" == daily || "$mode" == deploy ]] || { echo "usage: backup.sh [daily]"; exit 2; }
safety=0
if [[ "$mode" == deploy && -f /run/jdatna-backup-safety ]]; then safety=1; rm -f /run/jdatna-backup-safety; fi
exec 9>/run/lock/jdatna-backup.lock
if [[ "$mode" == daily ]]; then
  # اليومية لا تُتخطى إن صادفت نسخة نشر جارية: تنتظرها حتى ساعة.
  flock -w 3600 9 || { echo "Daily backup skipped: another backup held the lock for an hour"; exit 1; }
else
  flock -n 9 || exit 0
fi
mountpoint -q /srv/jdatna/data
mountpoint -q /var/backups/jdatna
export GNUPGHOME=/etc/jdatna/gnupg
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d /srv/jdatna/data/backup-stage.XXXXXX)
partial=/var/backups/jdatna/jdatna-$stamp.tar.gpg.partial
storage_paused=0
cleanup() { if [[ "$storage_paused" == 1 ]]; then docker unpause jdatna-storage >/dev/null; fi; rm -rf -- "$stage"; rm -f -- "$partial"; }
trap cleanup EXIT
# Bound backup disk usage while always keeping at least the newest complete copy.
python3 /opt/jdatna/infra/rotate-backups.py
if [[ -d /srv/jdatna/data/object-storage ]] && [[ "$(docker inspect -f '{{.State.Running}}' jdatna-storage 2>/dev/null || true)" == true ]]; then
  [[ "$(docker inspect -f '{{.State.Paused}}' jdatna-storage)" == false ]]
  docker pause jdatna-storage >/dev/null
  storage_paused=1
fi
docker exec jdatna-db pg_dump -U jdatna_admin -d jdatna -Fc > "$stage/database.dump"
docker exec -i jdatna-db pg_restore --list < "$stage/database.dump" >/dev/null
# Globals contain role password hashes; include only inside the encrypted archive.
docker exec jdatna-db pg_dumpall -U jdatna_admin --globals-only > "$stage/roles.sql"
cp /opt/jdatna/infra/compose.yaml "$stage/compose.yaml"
files=(database.dump roles.sql compose.yaml)
if [[ -d /srv/jdatna/data/site ]]; then
  cp -a /srv/jdatna/data/site "$stage/site"
  files+=(site)
fi
mkdir -m 700 "$stage/config"
for file in /etc/jdatna/runtime.env; do
  [[ ! -f "$file" ]] || cp "$file" "$stage/config/"
done
[[ ! -d /etc/jdatna/storage ]] || cp -a /etc/jdatna/storage "$stage/config/storage"
files+=(config)
if [[ -d /srv/jdatna/data/object-storage ]]; then
  # Frozen object storage plus a subsequent DB snapshot preserves referenced media.
  tar -C "$stage" -cf - "${files[@]}" -C /srv/jdatna/data uploads object-storage \
    | gpg --batch --yes --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
        --symmetric --cipher-algo AES256 --compress-algo none --output "$partial"
else
tar -C "$stage" -cf - "${files[@]}" -C /srv/jdatna/data uploads \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
      --symmetric --cipher-algo AES256 --compress-algo none --output "$partial"
fi
if [[ "$storage_paused" == 1 ]]; then docker unpause jdatna-storage >/dev/null; storage_paused=0; fi
gpg --batch --quiet --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
  --decrypt "$partial" | tar -tf - >/dev/null
final=${partial%.partial}
mv -- "$partial" "$final"
sha256sum "$final" > "$final.sha256"
# علامة النسخة اليومية: التدوير يحفظ آخر 10 يومية مستقلة عن نسخ النشر.
[[ "$mode" != daily ]] || : > "$final.daily"
# نسخة الأمان قبل النشر: مؤقتة، لا تُرفع ولا تُسجَّل في التقرير.
if [[ "$safety" == 1 ]]; then
  : > "$final.safety"
  python3 /opt/jdatna/infra/rotate-backups.py
  echo "Backup verified: $final (temporary pre-deploy copy)"
  exit 0
fi
# أحجام مكوّنات النسخة لتقرير الإدارة: البيانات (القاعدة والإعدادات) والميديا (الصور والمستندات).
database_bytes=$(du -sb "$stage" | cut -f1)
media_bytes=0
for media in /srv/jdatna/data/uploads /srv/jdatna/data/object-storage; do
  [[ ! -d "$media" ]] || media_bytes=$((media_bytes + $(du -sb "$media" | cut -f1)))
done
python3 /opt/jdatna/infra/rotate-backups.py
# رفع النسخة إلى التخزين الخارجي (R2) إن هُيّئ؛ تعذّر الرفع لا يُفشل النسخة.
remote=false
if bash /opt/jdatna/infra/backup-upload.sh "$final"; then remote=true; else echo "Backup not uploaded to remote storage"; fi
# سجل النسخ في القاعدة (الإدارة ← التقارير ← النسخ الاحتياطية): يضاف الجديد، وما حذفه التدوير يُعلَّم
# «ليس على الخادم» (يبقى إن كان مرفوعًا). فشل التسجيل لا يُفشل النسخة (الجدول قد لا يوجد قبل أول نشر يحمله).
{
  printf "INSERT INTO jdatna.backup_runs(file,kind,size_bytes,database_bytes,media_bytes,sha256,remote) VALUES('%s','%s',%s,%s,%s,'%s',%s) ON CONFLICT(file) DO NOTHING;\n" \
    "$(basename "$final")" "$([[ "$mode" == daily ]] && echo daily || echo full)" "$(stat -c %s "$final")" "$database_bytes" "$media_bytes" "$(cut -d' ' -f1 "$final.sha256")" "$remote"
  kept=$(find /var/backups/jdatna -maxdepth 1 -name 'jdatna-*.tar.gpg' -printf "'%f'," | sed 's/,$//')
  printf "UPDATE jdatna.backup_runs SET on_server=false WHERE kind IN ('full','daily') AND file NOT IN (%s);\n" "${kept:-''}"
  printf "DELETE FROM jdatna.backup_runs WHERE NOT on_server AND NOT remote;\n"
} | docker exec -i jdatna-db psql -X -q -v ON_ERROR_STOP=1 -U jdatna_admin -d jdatna >/dev/null 2>&1 \
  || echo "Backup log not recorded (backup itself is fine)"
echo "Backup verified: $final"
