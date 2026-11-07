#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/lock/jdatna-backup.lock
flock -n 9 || exit 0
mountpoint -q /srv/jdatna/data
mountpoint -q /var/backups/jdatna
export GNUPGHOME=/etc/jdatna/gnupg
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d /srv/jdatna/data/backup-stage.XXXXXX)
partial=/var/backups/jdatna/jdatna-$stamp.tar.gpg.partial
cleanup() { rm -rf -- "$stage"; rm -f -- "$partial"; }
trap cleanup EXIT
# Bound backup disk usage while always keeping at least the newest complete copy.
python3 /opt/jdatna/infra/rotate-backups.py
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
tar -C "$stage" -cf - "${files[@]}" -C /srv/jdatna/data uploads \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
      --symmetric --cipher-algo AES256 --compress-algo none --output "$partial"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file /etc/jdatna/secrets/backup-key \
  --decrypt "$partial" | tar -tf - >/dev/null
final=${partial%.partial}
mv -- "$partial" "$final"
sha256sum "$final" > "$final.sha256"
python3 /opt/jdatna/infra/rotate-backups.py
echo "Backup verified: $final"
