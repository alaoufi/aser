# Operations — Jdatna only

SSH: `ssh aykdmh`. Run commands below on the server. Never print secret files or
inspect container environments indiscriminately. Existing Aykdmh services are out
of scope for these commands.

## Status and validation

```sh
systemctl status jdatna-stack.service jdatna-backup.timer
docker compose -f /opt/jdatna/infra/compose.yaml ps
df -h / /srv/jdatna/data /var/backups/jdatna
python3 /opt/jdatna/infra/verify.py
```

The verification script creates then drops one uniquely named restore database
inside **jdatna-db** and rolls back its CRUD test. It never modifies Aykdmh data.
Its baseline container-start checks intentionally flag later unrelated Aykdmh
deployments; review those changes before refreshing any baseline.

## Backup

```sh
systemctl start jdatna-backup.service
journalctl -u jdatna-backup.service -n 30 --no-pager
systemctl list-timers jdatna-backup.timer
```

Backups live on a separate 6 GiB filesystem. Daily copies contain database.dump,
roles.sql, compose.yaml and upload directories in one GPG-encrypted tar archive.
No payment credentials or user files should ever be added to Git.

The encryption key is `/etc/jdatna/secrets/backup-key`; it must eventually have a
separate protected recovery copy. Losing the server and this key loses access to
these backups. Configure an authorized off-server destination before production.

For recovery, provision a **new isolated target**, verify SHA256 and fully decrypt
the archive before extracting it. Restore roles before restoring database.dump
with `pg_restore --exit-on-error`, and restore uploads with the expected owner.
Use a scratch database first and verify schema, grants and application behavior.
Never restore onto `aykdmh-db`, and never use destructive restore flags against a
live database. `verify.py` implements the tested scratch restoration path.

Database dumps are transaction-consistent. Once the app writes media concurrently,
define its media retention/snapshot strategy; the current filesystem tar is not an
atomic snapshot coordinated with future application writes.

## Stop/rollback without removing data

```sh
systemctl disable --now jdatna-backup.timer
systemctl stop jdatna-stack.service
```

This leaves both filesystems, data, secrets and backups intact. Do not run Docker
prune, remove volumes, delete image files or unmount running database storage.
To resume: `systemctl start jdatna-stack.service` and
`systemctl enable --now jdatna-backup.timer`.

## Provisioning and changes

`provision.py` is a one-time, host-specific installer. It refuses existing storage
and is not an idempotent upgrade tool. Initial provisioning used the already present
PostgreSQL image digest and did not install packages or change Docker daemon config.
For future edits validate Compose/systemd first, back up Jdatna, then restart only
its service. Application containers must not mount the Docker socket, host root,
admin password or unrelated project directories. Join only the Jdatna networks.

The future application needs its own restricted network for outbound traffic;
keep PostgreSQL on the internal network. No app container or outbound network has
been deployed yet. Public reverse proxy, DNS and HTTPS are also pending.
