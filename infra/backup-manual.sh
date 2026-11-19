#!/usr/bin/env bash
# نسخة يدوية من الإدارة («خذ نسخة الآن»): media = الصور والمستندات، codedb = الكود مع قاعدة البيانات.
# تُحفظ في /var/backups/jdatna/manual بعيدًا عن النسخ الكاملة (فلا تمسّ التدوير ولا فحص الاسترجاع قبل النشر).
# تطبع اسم الملف في آخر سطر عند النجاح.
set -euo pipefail
umask 077
kind=${1:?media|codedb}
[[ "$kind" == media || "$kind" == codedb ]] || { echo "unknown kind: $kind" >&2; exit 2; }
exec 9>/run/lock/jdatna-backup.lock
flock -w 600 9
mountpoint -q /srv/jdatna/data
mountpoint -q /var/backups/jdatna
export GNUPGHOME=/etc/jdatna/gnupg
out=/var/backups/jdatna/manual
mkdir -p -m 700 "$out"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d /srv/jdatna/data/backup-stage.XXXXXX)
partial=$out/jdatna-$kind-$stamp.tar.gpg.partial
storage_paused=0
cleanup() { if [[ "$storage_paused" == 1 ]]; then docker unpause jdatna-storage >/dev/null; fi; rm -rf -- "$stage"; rm -f -- "$partial"; }
trap cleanup EXIT
encrypt() { gpg --batch --yes --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
  --symmetric --cipher-algo AES256 --compress-algo none --output "$partial"; }
database_bytes=0 media_bytes=0 code_bytes=0
if [[ "$kind" == media ]]; then
  if [[ -d /srv/jdatna/data/object-storage ]] && [[ "$(docker inspect -f '{{.State.Running}}' jdatna-storage 2>/dev/null || true)" == true ]]; then
    [[ "$(docker inspect -f '{{.State.Paused}}' jdatna-storage)" == false ]]
    docker pause jdatna-storage >/dev/null
    storage_paused=1
  fi
  dirs=()
  for media in uploads object-storage; do
    [[ ! -d "/srv/jdatna/data/$media" ]] || { dirs+=("$media"); media_bytes=$((media_bytes + $(du -sb "/srv/jdatna/data/$media" | cut -f1))); }
  done
  [[ ${#dirs[@]} -gt 0 ]] || { echo "no media folders" >&2; exit 4; }
  tar -C /srv/jdatna/data -cf - "${dirs[@]}" | encrypt
  if [[ "$storage_paused" == 1 ]]; then docker unpause jdatna-storage >/dev/null; storage_paused=0; fi
else
  # مصدر الإصدار المنشور الآن كما سحبه النشر من GitHub.
  code_dir=/opt/jdatna/deploy-src
  if [[ -f /etc/jdatna/deploy.env ]]; then
    configured=$(sed -n 's/^REPO_DIR=//p' /etc/jdatna/deploy.env | tail -1)
    [[ -z "$configured" ]] || code_dir=$configured
  fi
  git -C "$code_dir" rev-parse HEAD > "$stage/code-version.txt"
  git -C "$code_dir" archive --format=tar HEAD > "$stage/code.tar"
  code_bytes=$(stat -c %s "$stage/code.tar")
  docker exec jdatna-db pg_dump -U jdatna_admin -d jdatna -Fc > "$stage/database.dump"
  docker exec -i jdatna-db pg_restore --list < "$stage/database.dump" >/dev/null
  docker exec jdatna-db pg_dumpall -U jdatna_admin --globals-only > "$stage/roles.sql"
  database_bytes=$(( $(stat -c %s "$stage/database.dump") + $(stat -c %s "$stage/roles.sql") ))
  tar -C "$stage" -cf - code.tar code-version.txt database.dump roles.sql | encrypt
fi
# تحقق: الملف يُفك ويُقرأ كاملًا قبل اعتماده.
gpg --batch --quiet --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
  --decrypt "$partial" | tar -tf - >/dev/null
final=${partial%.partial}
mv -- "$partial" "$final"
sha256sum "$final" > "$final.sha256"
# يبقى على الخادم آخر 3 نسخ يدوية من كل نوع؛ القديم المرفوع يبقى في التخزين الخارجي.
ls -1t "$out"/jdatna-"$kind"-*.tar.gpg | tail -n +4 | while read -r old; do rm -f -- "$old" "$old.sha256"; done
remote=false
if bash /opt/jdatna/infra/backup-upload.sh "$final"; then remote=true; fi
name=$(basename "$final")
{
  printf "INSERT INTO jdatna.backup_runs(file,kind,size_bytes,database_bytes,media_bytes,code_bytes,sha256,remote) VALUES('%s','%s',%s,%s,%s,%s,'%s',%s) ON CONFLICT(file) DO NOTHING;\n" \
    "$name" "$kind" "$(stat -c %s "$final")" "$database_bytes" "$media_bytes" "$code_bytes" "$(cut -d' ' -f1 "$final.sha256")" "$remote"
  kept=$(find "$out" -maxdepth 1 -name "jdatna-$kind-*.tar.gpg" -printf "'%f'," | sed 's/,$//')
  printf "UPDATE jdatna.backup_runs SET on_server=false WHERE kind='%s' AND file NOT IN (%s);\n" "$kind" "${kept:-''}"
  printf "DELETE FROM jdatna.backup_runs WHERE NOT on_server AND NOT remote;\n"
} | docker exec -i jdatna-db psql -X -q -v ON_ERROR_STOP=1 -U jdatna_admin -d jdatna >/dev/null
echo "Manual backup verified: $final"
echo "$name"
