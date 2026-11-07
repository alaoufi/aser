"""Verify infrastructure and restore only into a uniquely named Jdatna test DB."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs).stdout


def sql(query, database='jdatna'):
    return run('docker', 'exec', '-i', 'jdatna-db', 'psql', '-X', '-At',
               '-v', 'ON_ERROR_STOP=1', '-U', 'jdatna_admin', '-d', database,
               input=query.encode()).decode().strip()


def check(value, message):
    if not value:
        raise AssertionError(message)
    print('PASS:', message, flush=True)


before = json.loads(Path('/opt/jdatna/audit/before.json').read_text())
for name, old in before['containers'].items():
    d = json.loads(run('docker', 'inspect', name))[0]
    check(d['Id'] == old['id'] and d['State']['StartedAt'] == old['started']
          and d['State']['Running'], name + ' unchanged and running')
for p, digest in before['config_sha256'].items():
    content = Path(p).read_bytes()
    addition = Path('/opt/jdatna/infra/jdatna-proxy.caddy')
    if p == '/opt/aykdmh/deploy/caddy/Caddyfile' and addition.exists():
        approved_file = Path('/opt/jdatna/audit/approved-ingress.json')
        if approved_file.exists():
            approved = json.loads(approved_file.read_text())
            check(hashlib.sha256(content).hexdigest() == approved['approved_sha256'],
                  'Shared ingress matches approved Coolify routing')
            check(approved['backup_path'] == '/etc/aykdmh/coolify-site/original-ingress.caddy',
                  'Original ingress backup has expected independent path')
            content = Path(approved['backup_path']).read_bytes()
        suffix = b'\n' + addition.read_bytes()
        if content.endswith(suffix):
            content = content[:-len(suffix)]
    check(hashlib.sha256(content).hexdigest() == digest,
          'Original existing config preserved: ' + p)
d = json.loads(run('docker', 'inspect', 'jdatna-db'))[0]
check(d['State'].get('Health', {}).get('Status') == 'healthy', 'Database healthy')
check(d['HostConfig']['Memory'] == 1024**3 and d['HostConfig']['NanoCpus'] == 10**9,
      'Database limited to 1 GiB and 1 CPU')
check(not d['HostConfig']['PortBindings'], 'No database host ports published')
check(d['HostConfig']['ReadonlyRootfs'] and d['Config']['User'] == '70:70',
      'Non-root database with read-only container root')
check(set(d['NetworkSettings']['Networks']) == {'jdatna_database'},
      'Database only joins its private project network')
net = json.loads(run('docker', 'network', 'inspect', 'jdatna_database'))[0]
check(net['Internal'], 'Database network marked internal')
apps = run('docker', 'ps', '-q', '--filter', 'label=jdatna.role=application').decode().split()
check(len(apps) == 1, 'Exactly one Jdatna application is running')
app = json.loads(run('docker', 'inspect', apps[0]))[0]
check(app['Config']['User'] == '10001:10001' and app['HostConfig']['ReadonlyRootfs'],
      'Application runs non-root on a read-only filesystem')
check('aykdmh_default' not in app['NetworkSettings']['Networks'] and
      'jdatna_database' in app['NetworkSettings']['Networks'], 'Application networks isolated from Aykdmh')
check(app['HostConfig']['PortBindings'].get('3000/tcp') == [{'HostIp':'172.18.0.1','HostPort':'8092'}],
      'Application port binds only the private ingress gateway')
store = json.loads(run('docker', 'inspect', 'jdatna-storage'))[0]
check(not store['HostConfig']['PortBindings'] and set(store['NetworkSettings']['Networks']) == {'jdatna_storage'},
      'Object storage has no host ports or other project networks')
check(store['State']['Running'] and not store['State']['Paused'], 'Object storage running and unfrozen')
for path, gib in [('/srv/jdatna/data', 12), ('/var/backups/jdatna', 6)]:
    mount = json.loads(run('findmnt', '-J', '--mountpoint', path))['filesystems'][0]
    check(mount['source'].startswith('/dev/loop') and 'noexec' in mount['options'],
          path + ' uses separate bounded loop filesystem')
    st = os.statvfs(path)
    check(st.f_blocks * st.f_frsize <= gib * 1024**3, path + ' size bounded')
for p in Path('/etc/jdatna/secrets').iterdir():
    check(p.stat().st_mode & 0o077 == 0, 'Private secret permissions: ' + p.name)
check(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('jdatna_app','jdatna_migrator') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication") == '2',
      'Application and migration accounts have no server administration privileges')
check(sql("SELECT has_schema_privilege('jdatna_app','jdatna','CREATE') OR has_database_privilege('jdatna_app','jdatna','CREATE')") == 'f',
      'Application account cannot create schema objects')
sql('''BEGIN;
SET LOCAL ROLE jdatna_migrator;
CREATE TABLE jdatna.isolation_verification(value text NOT NULL);
SET LOCAL ROLE jdatna_app;
INSERT INTO jdatna.isolation_verification VALUES ('permission-check');
SELECT * FROM jdatna.isolation_verification;
UPDATE jdatna.isolation_verification SET value='updated';
DELETE FROM jdatna.isolation_verification;
ROLLBACK;''')
check(sql("SELECT to_regclass('jdatna.isolation_verification') IS NULL") == 't',
      'Application CRUD defaults work; transaction test leaves no table or records')
password = Path('/etc/jdatna/secrets/db-app').read_bytes()
auth = run('docker', 'exec', '-i', 'jdatna-db', 'sh', '-c',
           'read -r PGPASSWORD; export PGPASSWORD; exec psql -X -At -h 127.0.0.1 -U jdatna_app -d jdatna -c "SELECT current_user"', input=password)
check(auth.decode().strip() == 'jdatna_app', 'Application password authenticates over TCP')
wrong = subprocess.run(['docker','exec','-i','jdatna-db','sh','-c',
          'read -r PGPASSWORD; export PGPASSWORD; exec psql -X -At -h 127.0.0.1 -U jdatna_app -d jdatna -c "SELECT current_user"'],
          input=b'incorrect-verification-password\n', capture_output=True)
check(wrong.returncode != 0 and b'password authentication failed' in wrong.stderr,
      'Wrong application password rejected')
other = json.loads(run('docker','inspect','aykdmh-db'))[0]
other_ip = other['NetworkSettings']['Networks']['aykdmh_default']['IPAddress']
probe = subprocess.run(['docker','exec','jdatna-db','pg_isready','-h',other_ip,'-t','3'], capture_output=True)
check(probe.returncode == 2, 'Jdatna network cannot reach Aykdmh PostgreSQL')
latest = sorted(Path('/var/backups/jdatna').glob('jdatna-*.tar.gpg'))[-1]
run('sha256sum', '-c', str(latest) + '.sha256')
env = dict(os.environ, GNUPGHOME='/etc/jdatna/gnupg')
# Stream the archive to a bounded project filesystem, not host /tmp or RAM.
stage = Path('/srv/jdatna/data/restore-check-' + str(time.time_ns()))
stage.mkdir(mode=0o700)
scratch = 'jdatna_restore_' + str(time.time_ns())
created = False
try:
    archive = stage / 'backup.tar'
    with archive.open('wb') as out:
        subprocess.run(['gpg','--batch','--quiet','--pinentry-mode','loopback',
                        '--passphrase-file','/etc/jdatna/secrets/backup-key','--decrypt',str(latest)],
                        stdout=out, stderr=subprocess.PIPE, env=env, check=True)
    dump = stage / 'database.dump'
    with tarfile.open(archive) as tar, dump.open('wb') as out:
        import shutil
        shutil.copyfileobj(tar.extractfile('database.dump'), out)
        check({'roles.sql','compose.yaml','uploads','uploads/public','uploads/private'}.issubset(tar.getnames()),
              'Encrypted backup includes roles, database, config and upload directories')
    sql('CREATE DATABASE ' + scratch, 'postgres')
    created = True
    with dump.open('rb') as source:
        subprocess.run(['docker','exec','-i','jdatna-db','pg_restore','--exit-on-error',
                        '-U','jdatna_admin','-d',scratch], stdin=source, capture_output=True, check=True)
    check(sql("SELECT nspowner::regrole FROM pg_namespace WHERE nspname='jdatna'", scratch) == 'jdatna_migrator',
          'Encrypted database backup restored with correct schema ownership')
    check(sql("SELECT has_schema_privilege('jdatna_app','jdatna','USAGE')", scratch) == 't',
          'Restored application schema permissions valid')
finally:
    if created:
        sql('DROP DATABASE ' + scratch, 'postgres')
    for p in stage.iterdir():
        p.unlink()
    stage.rmdir()
check(run('systemctl','is-active','jdatna-backup.timer').strip() == b'active', 'Daily backup timer active')
code = run('curl','-sS','-o','/dev/null','-w','%{http_code}','--max-time','15','https://aykdmh.com').decode()
check(code == '200', 'Aykdmh HTTPS still returns HTTP 200')
print('ALL CHECKS PASSED', flush=True)
