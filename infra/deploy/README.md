# النشر المباشر — تلقائي بعد كل دمج، ويدوي من الجوال عند الحاجة

**الهدف:** بعد كل دمج في `codex/jdatna-platform` ونجاح CI، ينشر GitHub الإصدار تلقائيًا بأمر `deploy-migrate`. ويبقى زر «Run workflow» للتشغيل اليدوي: رجوع، أو حالة، أو إعادة نشر.

**الاتصال:** يتصل GitHub بالخادم بحساب نشر مخصص (`jdatna-deploy`):
- مفتاحه يشغّل بوابة واحدة فقط (`jdatna-deploy-gate`).
- لا shell عام، ولا عضوية Docker.
- البوابة تقبل أربعة أوامر، وتشغّل `jdatna-deploy` عبر sudo مقيد بهذا الملف وحده.

**ما ينفذه السكربت على الخادم، بالترتيب:**
1. يتحقق أن الإصدار من الفرع `codex/jdatna-platform`، ويرفض حذف ترحيلات أو إعادة تسميتها.
2. **نسخة احتياطية مع اختبار استعادة إلزامي** (`VERIFY_CMD`). إن فشل الاختبار يتوقف كل شيء.
3. يبني صورة التطبيق من `git archive`، ويحميها بحاوية حارس.
4. إن وُجدت ترحيلات جديدة (أمر `deploy-migrate`): يبني صورة الترحيل من نفس المصدر (`Dockerfile --target migrator`)، ويشغّلها بحساب migrator دون أي تنزيل وقت التشغيل. أمر `deploy` العادي يرفض إصدارًا فيه ترحيل.
5. يحوّل الموقع ويتحقق من `/api/health`. عند الفشل يرجع تلقائيًا للصورة السابقة.
6. عند النجاح يحمي **صورة الرجوع** (الإصدار السابق) بحارس دائم من التنظيف، ويزيل حراس الإصدارات الأقدم، ثم يأخذ نسخة احتياطية بعد النشر مع اختبار استعادتها.
7. **الرجوع اليدوي (`rollback`) يُرفض** إذا أُضيفت ترحيلات بعد الإصدار السابق وكانت البيانات تستخدم ما لا يفهمه. مثلًا: طلبات بحالة «قيد التجهيز» أو «جاهز» لا يعرفها إصدار ما قبل 017. عندها الحل إصلاح للأمام لا الرجوع.

لا يلمس السكربت أي خدمة أخرى. النشر التلقائي لا يعمل على طلبات الدمج ولا الفروع الأخرى، وقبل تجهيز الأسرار يتخطى بهدوء.

## التجهيز لمرة واحدة (بصلاحية root على الخادم)

1. **نسخة المصدر للبناء** (المستودع عام، والنسخة للقراءة فقط):
   ```sh
   git clone --filter=blob:none https://github.com/alaoufi/aser /opt/jdatna/deploy-src
   install -m 750 -o root -g root /opt/jdatna/deploy-src/infra/deploy/jdatna-deploy.sh /usr/local/sbin/jdatna-deploy
   install -m 755 -o root -g root /opt/jdatna/deploy-src/infra/deploy/jdatna-deploy-gate.sh /usr/local/sbin/jdatna-deploy-gate
   ```

2. **أمر التحويل `/usr/local/sbin/jdatna-switch`** (root، 700):
   - يأخذ وسم الصورة، مثل `jdatna-application:<sha>`، ويحوّل خدمة جدتنا في Coolify إليه بالطريقة المعتمدة يدويًا: تحديث وسم الصورة في Source Compose ثم Deploy، مع `pull_policy: never`.
   - أي رمز API يُحفظ في ملف root فقط تحت `/etc/jdatna/`.
   - جرّبه مرة بإرجاع الإصدار الحالي نفسه.

3. **أمر الترحيل `/usr/local/sbin/jdatna-migrate`** (root، 700): يتلقى وسم صورة الترحيل في `$1`. مثال:
   ```sh
   #!/usr/bin/env bash
   set -euo pipefail
   # migrator.env فيه DATABASE_URL لحساب migrator فقط (root، 600)، ولا يُحفظ في Git.
   docker run --rm --network jdatna_database --env-file /etc/jdatna/migrator.env \
     --read-only --tmpfs /tmp:size=64m --cap-drop ALL --security-opt no-new-privileges:true \
     --memory 256m --pids-limit 64 "$1"
   ```
   جرّبه أولًا على قاعدة `jdatna_test_` بنسخة من `migrator.env` تشير إليها.

4. **ملف الإعداد `/etc/jdatna/deploy.env`** (root، 600):
   ```sh
   REPO_DIR=/opt/jdatna/deploy-src
   RELEASES_DIR=/opt/jdatna/releases
   SWITCH_CMD=/usr/local/sbin/jdatna-switch
   MIGRATE_CMD=/usr/local/sbin/jdatna-migrate
   PUBLIC_HEALTH=https://jdatna.com/api/health
   # إلزامي: أمر اختبار استعادة أحدث نسخة مشفرة في قاعدة مؤقتة معزولة (المستخدم سابقًا بعد كل نشر)
   VERIFY_CMD=/usr/local/sbin/jdatna-verify-restore
   ```

5. **حساب النشر المخصص**، بلا shell عام وبلا Docker:
   ```sh
   useradd --system --create-home --shell /bin/sh jdatna-deploy
   echo 'jdatna-deploy ALL=(root) NOPASSWD: /usr/local/sbin/jdatna-deploy' > /etc/sudoers.d/jdatna-deploy
   chmod 440 /etc/sudoers.d/jdatna-deploy && visudo -cf /etc/sudoers.d/jdatna-deploy
   install -d -m 700 -o jdatna-deploy -g jdatna-deploy /home/jdatna-deploy/.ssh
   ssh-keygen -t ed25519 -N '' -C jdatna-github-deploy -f /root/jdatna-deploy-key
   echo "command=\"/usr/local/sbin/jdatna-deploy-gate\",restrict $(cat /root/jdatna-deploy-key.pub)" > /home/jdatna-deploy/.ssh/authorized_keys
   chown jdatna-deploy: /home/jdatna-deploy/.ssh/authorized_keys && chmod 600 /home/jdatna-deploy/.ssh/authorized_keys
   cat /root/jdatna-deploy-key      # انسخه إلى سر GitHub في الخطوة 6 ثم:
   shred -u /root/jdatna-deploy-key
   ssh-keyscan -t ed25519 <عنوان الخادم>   # قيمة JDATNA_DEPLOY_KNOWN_HOSTS
   ```
   تحقّق: `ssh -i <المفتاح> jdatna-deploy@<الخادم> status` يعمل، وأي أمر آخر (`id` أو `bash`) يرجع `rejected`.

6. **في GitHub:** Settings ← Environments ← New environment باسم `production`.
   - للنشر المباشر **لا تفعّل** Required reviewers. إن أردت موافقة قبل كل نشر ففعّلها.
   - في Deployment branches اختر `codex/jdatna-platform` فقط.
   - الأسرار الثلاثة:
     - `JDATNA_DEPLOY_SSH_KEY`: المفتاح الخاص.
     - `JDATNA_DEPLOY_HOST`: بالشكل `jdatna-deploy@<عنوان الخادم>`.
     - `JDATNA_DEPLOY_KNOWN_HOSTS`: ناتج `ssh-keyscan`.

7. **تجربة:** شغّل الزر بالأمر `status`، ثم `deploy-migrate`.

## الاستخدام من الجوال

GitHub ← المستودع ← Actions ← «نشر جدتنا» ← Run workflow:
- `deploy-migrate`: نشر آخر الفرع مع الترحيلات (الافتراضي).
- `deploy`: نشر بلا ترحيلات.
- `rollback`: رجوع للإصدار السابق، ويُرفض إن لم يكن آمنًا.
- `status`: الإصدار الحي والسابق.

السجل في GitHub، وعلى الخادم في `/var/log/jdatna-deploy.log`.

## التراجع

- **من الجوال:** `rollback`، وهو محمي بشرط التوافق أعلاه. إن رُفض، فالحل دمج إصلاح ينشر تلقائيًا.
- **يدويًا:** أرجع وسم الصورة في Coolify. صورة الإصدار السابق محفوظة بحارس `jdatna-guard-<sha>`.
- **لإيقاف النشر الآلي كليًا:** احذف `authorized_keys` لحساب `jdatna-deploy`، أو عطّل workflow «نشر جدتنا» من GitHub.
