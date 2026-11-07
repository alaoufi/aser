"""Only prune this project's completed backups; never delete its last copy."""
import pathlib
import time

root = pathlib.Path('/var/backups/jdatna')
files = sorted(root.glob('jdatna-*.tar.gpg'), key=lambda p: p.stat().st_mtime)
limit = 3 * 1024**3
while len(files) > 1:
    oldest = files[0]
    if (len(files) <= 7 and time.time() - oldest.stat().st_mtime < 7 * 86400
            and sum(p.stat().st_size for p in files) <= limit):
        break
    oldest.unlink()
    oldest.with_name(oldest.name + '.sha256').unlink(missing_ok=True)
    files.pop(0)
