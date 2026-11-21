"""Only prune this project's completed full backups; never delete its newest copy.

- Daily backups (marked by a .daily file, taken at 05:00 Riyadh): keep the newest 10.
- Deploy and manual full backups: keep the newest 5.
- If the backup disk has under 2 GiB free, drop the oldest deploy copies first, then
  the oldest daily copies, but always keep the newest backup of all.
"""
import pathlib
import shutil

root = pathlib.Path('/var/backups/jdatna')
KEEP_DAILY = 10
KEEP_DEPLOY = 5
MIN_FREE = 2 * 1024**3


def remove(path):
    path.unlink(missing_ok=True)
    for extra in ('.sha256', '.daily'):
        path.with_name(path.name + extra).unlink(missing_ok=True)


files = sorted(root.glob('jdatna-[0-9]*.tar.gpg'), key=lambda p: p.name)
if files:
    newest = files[-1]
    daily = [p for p in files if p.with_name(p.name + '.daily').exists()]
    deploy = [p for p in files if p not in daily]
    for old in daily[:-KEEP_DAILY] + deploy[:-KEEP_DEPLOY]:
        if old != newest:
            remove(old)
    left = [p for p in deploy if p.exists()] + [p for p in daily if p.exists()]
    for old in left:
        if shutil.disk_usage(root).free >= MIN_FREE:
            break
        if old != newest:
            remove(old)
