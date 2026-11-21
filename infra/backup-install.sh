#!/usr/bin/env bash
# تركيب النسخ الاحتياطية المحدَّثة على خادم جدتنا (مرة واحدة، بموافقة المالك، root).
# يُشغَّل من آخر إصدار في المستودع:
#   git -C /opt/jdatna/deploy-src fetch -q origin codex/jdatna-platform && \
#   git -C /opt/jdatna/deploy-src show FETCH_HEAD:infra/backup-install.sh | bash
# ما يفعله:
#   1. ينسخ سكربتات النسخ من الإصدار إلى /opt/jdatna/infra (backup.sh، rotate-backups.py، backup-restore.sh،
#      backup-manual.sh، backup-upload.sh، backup-remote-delete.sh، backup-requests.sh)، ويحفظ القديمة في
#      /opt/jdatna/infra/.before-<وقت>. ويحدّث سكربت النشر /usr/local/sbin/jdatna-deploy (نسخة الأمان المؤقتة قبل
#      النشر بدل نسختي قبل النشر وبعده، طلب المالك 2026-11-22).
#   2. يركّب المؤقت اليومي 05:00 بتوقيت الرياض (jdatna-backup.timer → jdatna-backup-daily.service)
#      وخدمة «خذ نسخة الآن» (jdatna-backup-requests.timer، كل دقيقة).
#   3. يعلّم النسخ الموجودة المأخوذة بين 4:00 و5:59 بتوقيت الرياض «يومية» حتى لا يحذفها التدوير.
# لا يأخذ نسخة ولا يحذف شيئًا ولا يعيد تشغيل الموقع. لا يلمس أي موقع آخر.
set -euo pipefail
SRC=/opt/jdatna/deploy-src
REF=${REF:-FETCH_HEAD}
DEST=/opt/jdatna/infra
UNITS=/etc/systemd/system
stamp=$(date -u +%Y%m%dT%H%M%SZ)
show() { git -C "$SRC" show "$REF:infra/$1"; }

[[ -d "$DEST" ]] || { echo "NOT OK: $DEST not found"; exit 2; }
for f in backup.sh rotate-backups.py backup-restore.sh backup-manual.sh backup-upload.sh backup-remote-delete.sh \
         backup-requests.sh deploy/jdatna-deploy.sh jdatna-backup.timer jdatna-backup-daily.service jdatna-backup-requests.service jdatna-backup-requests.timer; do
  show "$f" > /dev/null || { echo "NOT OK: infra/$f is not in $REF (fetch first)"; exit 2; }
done

keep="$DEST/.before-$stamp"
mkdir -p -m 700 "$keep"
for f in backup.sh rotate-backups.py backup-restore.sh backup-manual.sh backup-upload.sh backup-remote-delete.sh backup-requests.sh; do
  [[ ! -f "$DEST/$f" ]] || cp -p "$DEST/$f" "$keep/"
  show "$f" > "$DEST/$f.new"
  chmod 700 "$DEST/$f.new"
  mv -f "$DEST/$f.new" "$DEST/$f"
done
bash -n "$DEST/backup.sh" "$DEST/backup-restore.sh" "$DEST/backup-requests.sh" "$DEST/backup-remote-delete.sh"
python3 -m py_compile "$DEST/rotate-backups.py"
# سكربت النشر: يُفحص قبل وضعه، والقديم محفوظ بجانب السكربتات.
deploy=/usr/local/sbin/jdatna-deploy
show deploy/jdatna-deploy.sh > "$deploy.new"
bash -n "$deploy.new"
[[ ! -f "$deploy" ]] || cp -p "$deploy" "$keep/jdatna-deploy"
install -m 750 -o root -g root "$deploy.new" "$deploy"
rm -f "$deploy.new"
echo "1/3 Scripts updated in $DEST and $deploy (previous copies in $keep)"

for u in jdatna-backup.timer jdatna-backup-daily.service jdatna-backup-requests.service jdatna-backup-requests.timer; do
  [[ ! -f "$UNITS/$u" ]] || cp -p "$UNITS/$u" "$keep/"
  show "$u" > "$UNITS/$u"
  chmod 644 "$UNITS/$u"
done
systemctl daemon-reload
systemctl enable --now jdatna-backup.timer jdatna-backup-requests.timer >/dev/null
systemctl restart jdatna-backup.timer
echo "2/3 Timers installed: daily backup 05:00 Riyadh, and «take a backup now» every minute"

marked=0
for f in /var/backups/jdatna/jdatna-[0-9]*.tar.gpg; do
  [[ -f "$f" ]] || continue
  t=$(basename "$f" | sed -E 's/^jdatna-[0-9]{8}T([0-9]{2}).*/\1/')
  # 01 و02 بتوقيت UTC = 04 و05 بتوقيت الرياض: وقت النسخة اليومية القديمة (4:30) والجديدة (5:00).
  if [[ "$t" == 01 || "$t" == 02 ]] && [[ ! -f "$f.daily" ]]; then : > "$f.daily"; marked=$((marked + 1)); fi
done
echo "3/3 Existing daily backups marked: $marked"
echo
systemctl list-timers --all --no-pager | grep -E 'NEXT|jdatna-backup' || true
echo
ls -1 /var/backups/jdatna/ | grep -E '^jdatna-[0-9].*\.tar\.gpg$' | while read -r b; do
  printf '%s  %s\n' "$b" "$([[ -f /var/backups/jdatna/$b.daily ]] && echo daily || echo deploy)"
done
echo "DONE. The next daily backup runs at 05:00 Riyadh time and appears in the admin report."
