"""One-time provisioning on the authorized Contabo host; refuses existing storage.

Run only after placing infra/ under /opt/jdatna. No external downloads or changes
to existing application services, proxy, database, DNS or Docker daemon config.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path('/opt/jdatna')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs).stdout


def write(path, content, mode=0o600):
    p = Path(path)
    if p.exists():
        raise RuntimeError(f'Refusing overwrite: {p}')
    p.write_text(content)
    p.chmod(mode)


assert os.geteuid() == 0
assert run('hostname').strip() == 'vmi3696890'
for path in ['/srv/jdatna', '/etc/jdatna', '/var/backups/jdatna']:
    assert not Path(path).exists(), f'Existing path: {path}'
for unit in ['srv-jdatna-data.mount', 'var-backups-jdatna.mount',
             'jdatna-stack.service', 'jdatna-backup.service', 'jdatna-backup.timer']:
    assert not Path('/etc/systemd/system', unit).exists()
stat = os.statvfs('/')
assert stat.f_bavail * stat.f_frsize > 45 * 1024**3, 'Insufficient free space'

baseline = {'containers': {}, 'config_sha256': {}}
for name in ['aykdmh-web', 'aykdmh-app', 'aykdmh-db', 'aykdmh-livekit']:
    d = json.loads(run('docker', 'inspect', name))[0]
    baseline['containers'][name] = {'id': d['Id'], 'started': d['State']['StartedAt']}
for p in [Path('/opt/aykdmh/deploy/docker-compose.yml'),
          *Path('/opt/aykdmh/deploy/caddy').rglob('*')]:
    if p.is_file():
        baseline['config_sha256'][str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
(ROOT / 'audit').mkdir(mode=0o700)
write(ROOT / 'audit/before.json', json.dumps(baseline, indent=2))

run('useradd', '--system', '--home-dir', '/srv/jdatna', '--no-create-home',
    '--shell', '/usr/sbin/nologin', 'jdatna')
uid = int(run('id', '-u', 'jdatna'))
gid = int(run('id', '-g', 'jdatna'))
for p in ['/srv/jdatna', '/srv/jdatna/volumes', '/srv/jdatna/data',
          '/var/backups/jdatna', '/etc/jdatna', '/etc/jdatna/secrets', '/etc/jdatna/gnupg']:
    Path(p).mkdir(mode=0o700, parents=True, exist_ok=True)

for name, size, mount, unit in [
    ('data', '12G', '/srv/jdatna/data', 'srv-jdatna-data.mount'),
    ('backups', '6G', '/var/backups/jdatna', 'var-backups-jdatna.mount'),
]:
    image = f'/srv/jdatna/volumes/{name}.ext4'
    run('fallocate', '-l', size, image)
    Path(image).chmod(0o600)
    # Do not discard preallocated blocks: reserve real disk space up front.
    run('mkfs.ext4', '-q', '-m', '1', '-E',
        'nodiscard,lazy_itable_init=0,lazy_journal_init=0', '-L', f'jdatna-{name}', image)
    write('/etc/systemd/system/' + unit, f'''[Unit]
Description=Bounded Jdatna {name} storage
Before=jdatna-stack.service

[Mount]
What={image}
Where={mount}
Type=ext4
Options=loop,nodev,nosuid,noexec,noatime
TimeoutSec=90

[Install]
WantedBy=multi-user.target
''', 0o644)
run('systemctl', 'daemon-reload')
run('systemctl', 'enable', '--now', 'srv-jdatna-data.mount', 'var-backups-jdatna.mount')
for p in ['/srv/jdatna/data', '/var/backups/jdatna']:
    Path(p).chmod(0o700)
Path('/srv/jdatna/data/postgres').mkdir(mode=0o700)
os.chown('/srv/jdatna/data/postgres', 70, 70)
for p in ['/srv/jdatna/data/uploads', '/srv/jdatna/data/uploads/public',
          '/srv/jdatna/data/uploads/private']:
    Path(p).mkdir(mode=0o700)
    os.chown(p, uid, gid)
for name in ['db-admin', 'db-app', 'db-migrator', 'backup-key']:
    path = '/etc/jdatna/secrets/' + name
    write(path, secrets.token_hex(32) + '\n', 0o400)
    if name == 'db-admin':
        os.chown(path, 70, 70)
(ROOT / 'infra/backup.sh').chmod(0o700)
run('docker', 'compose', '-f', str(ROOT / 'infra/compose.yaml'), 'config', '--quiet')
for name in ['jdatna-stack.service', 'jdatna-backup.service', 'jdatna-backup.timer']:
    write('/etc/systemd/system/' + name, (ROOT / 'infra' / name).read_text(), 0o644)
run('systemctl', 'daemon-reload')
run('systemctl', 'enable', '--now', 'jdatna-stack.service')
for _ in range(45):
    result = subprocess.run(['docker', 'exec', 'jdatna-db', 'pg_isready',
                             '-U', 'jdatna_admin', '-d', 'jdatna'], capture_output=True)
    if result.returncode == 0:
        break
    time.sleep(2)
else:
    raise RuntimeError('Jdatna database readiness failed')
app = Path('/etc/jdatna/secrets/db-app').read_text().strip()
migrator = Path('/etc/jdatna/secrets/db-migrator').read_text().strip()
# Generated hex values only; never log SQL containing passwords.
sql = f"""
CREATE ROLE jdatna_app LOGIN PASSWORD '{app}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE jdatna_migrator LOGIN PASSWORD '{migrator}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE jdatna FROM PUBLIC;
GRANT CONNECT ON DATABASE jdatna TO jdatna_app, jdatna_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA jdatna AUTHORIZATION jdatna_migrator;
GRANT USAGE ON SCHEMA jdatna TO jdatna_app;
ALTER DEFAULT PRIVILEGES FOR ROLE jdatna_migrator IN SCHEMA jdatna GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jdatna_app;
ALTER DEFAULT PRIVILEGES FOR ROLE jdatna_migrator IN SCHEMA jdatna GRANT USAGE, SELECT ON SEQUENCES TO jdatna_app;
ALTER ROLE jdatna_app IN DATABASE jdatna SET search_path TO jdatna, pg_catalog;
ALTER ROLE jdatna_migrator IN DATABASE jdatna SET search_path TO jdatna, pg_catalog;
ALTER ROLE jdatna_app SET statement_timeout TO '15s';
ALTER ROLE jdatna_app SET idle_in_transaction_session_timeout TO '30s';
"""
run('docker', 'exec', '-i', 'jdatna-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'jdatna_admin', '-d', 'jdatna', input=sql)
run('systemctl', 'start', 'jdatna-backup.service')
run('systemctl', 'enable', '--now', 'jdatna-backup.timer')
print('Provisioned isolated Jdatna storage, database and encrypted backup timer.')
print('Jdatna upload UID/GID:', uid, gid)
