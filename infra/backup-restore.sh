#!/usr/bin/env bash
# استعادة نسخة احتياطية كاملة لأكلات جدتنا (قرار المالك 2026-11-21: أمر جاهز، ونسخة قبل الاستعادة).
# الاستخدام (على الخادم، root):  bash /opt/jdatna/infra/backup-restore.sh jdatna-20261121T020000Z.tar.gpg
# الأمر الجاهز لكل نسخة في: الإدارة ← التقارير ← النسخ الاحتياطية.
#
# ما يفعله بالترتيب، ويتوقف عند أول خطأ دون أي تغيير:
#   1. يتحقق من اسم الملف وسلامته (sha256) ويعرض تاريخه بتوقيت الرياض.
#   2. يطلب كتابة «استعادة» للتأكيد.
#   3. يأخذ نسخة كاملة من الوضع الحالي أولًا (للتراجع) ويتأكد من وجودها.
#   4. يفك النسخة المختارة في مجلد مؤقت داخل /srv/jdatna/data ويتحقق من ملف قاعدة البيانات.
#   5. يستعيد قاعدة البيانات في معاملة واحدة (--single-transaction): أي خطأ يُرجع كل شيء كما كان.
#   6. يعيد الصور والمستندات العامة الناقصة (uploads) دون حذف الأحدث منها ودون الكتابة فوقها.
# لا يستعيد الإعدادات والمفاتيح (runtime.env) ولا التخزين الخاص (object-storage): يبقيان كما هما.
# لا يلمس أي موقع آخر: حاوية jdatna-db ومجلدات /srv/jdatna و/var/backups/jdatna فقط.
set -euo pipefail
umask 077
name=${1:?usage: backup-restore.sh jdatna-YYYYMMDDTHHMMSSZ.tar.gpg}
BACKUPS=${BACKUPS_DIR:-/var/backups/jdatna}
DATA=${DATA_DIR:-/srv/jdatna/data}
DB=${DB_EXEC:-docker exec -i jdatna-db}
SAFETY=${SAFETY_CMD:-systemctl start jdatna-backup.service}
KEY=${BACKUP_KEY:-/etc/jdatna/secrets/backup-key}
export GNUPGHOME=${GNUPGHOME:-/etc/jdatna/gnupg}

[[ "$name" =~ ^jdatna-([0-9]{8})T([0-9]{6})Z\.tar\.gpg$ ]] \
  || { echo "NOT OK: use a full backup file name like jdatna-20261121T020000Z.tar.gpg"; exit 2; }
file=$BACKUPS/$name
[[ -f "$file" && -f "$file.sha256" ]] || { echo "NOT OK: $name is not on the server (only the backups in $BACKUPS)"; exit 2; }
(cd "$BACKUPS" && sha256sum --quiet -c "$name.sha256") || { echo "NOT OK: $name is damaged (sha256)"; exit 2; }
d=${BASH_REMATCH[1]} t=${BASH_REMATCH[2]}
taken=$(TZ=Asia/Riyadh date -d "${d:0:4}-${d:4:2}-${d:6:2}T${t:0:2}:${t:2:2}:${t:4:2}Z" '+%Y-%m-%d %H:%M')
echo "Backup: $name"
echo "Taken:  $taken (Riyadh time), size $(du -h "$file" | cut -f1)"
echo "This replaces ALL current site data (accounts, orders, messages, products) with the data in this backup."
echo "Anything added after $taken will be removed from the site (it stays in the safety backup taken now)."
read -r -p "To continue type: استعادة  > " answer
[[ "$answer" == "استعادة" ]] || { echo "Cancelled. Nothing was changed."; exit 1; }

before=$(ls -1 "$BACKUPS"/jdatna-[0-9]*.tar.gpg 2>/dev/null | sort | tail -1 || true)
echo "1/4 Safety backup of the current data…"
$SAFETY
safety=$(ls -1 "$BACKUPS"/jdatna-[0-9]*.tar.gpg 2>/dev/null | sort | tail -1 || true)
[[ -n "$safety" && "$safety" != "$before" ]] || { echo "NOT OK: the safety backup was not created. Nothing was restored."; exit 3; }
echo "    Safety backup: $(basename "$safety")"

stage=$(mktemp -d "$DATA/restore-stage.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
echo "2/4 Opening the backup…"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$KEY" --decrypt "$file" \
  | tar -x -C "$stage" -f - database.dump uploads 2>/dev/null \
  || gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$KEY" --decrypt "$file" \
       | tar -x -C "$stage" -f - database.dump
[[ -s "$stage/database.dump" ]] || { echo "NOT OK: no database in this backup. Nothing was restored."; exit 4; }
$DB pg_restore --list < "$stage/database.dump" > /dev/null \
  || { echo "NOT OK: the database file in this backup cannot be read. Nothing was restored."; exit 4; }

echo "3/4 Restoring the database (one transaction: any error changes nothing)…"
$DB pg_restore --exit-on-error --single-transaction --clean --if-exists -U jdatna_admin -d jdatna \
  < "$stage/database.dump" \
  || { echo "NOT OK: the database restore failed and was rolled back; the site data is unchanged."; exit 5; }

echo "4/4 Restoring missing public photos and files…"
if [[ -d "$stage/uploads" ]]; then
  mkdir -p "$DATA/uploads"
  cp -a -n "$stage/uploads/." "$DATA/uploads/"
fi

applied=$(echo "SELECT count(*) FROM jdatna.schema_migrations" | $DB psql -X -At -U jdatna_admin -d jdatna 2>/dev/null || echo "?")
echo "DONE. The site now has the data from $taken (Riyadh time). Database migrations in it: $applied."
echo "If this backup is older than the latest site version, run «نشر مع ترحيلات» (deploy-migrate) from GitHub."
echo "To undo: bash $0 $(basename "$safety")"
