# النشر من الجوال — زر نشر يدوي في GitHub

الهدف: ينشر المالك إصدارًا جديدًا من الجوال دون فتح اللابتوب. يضغط زر «Run workflow» في GitHub، فيوافق على النشر، ويتصل GitHub بالخادم بمفتاح مقيد، ثم ينفذ السكربت `jdatna-deploy` على الخادم نفسه.

الخطوات التي ينفذها السكربت على الخادم: يتحقق أن الإصدار من الفرع `codex/jdatna-platform`، ويرفض الإصدار إذا فيه ترحيل جديد، ويأخذ نسخة احتياطية ويتحقق منها، ويبني الصورة، ويحميها بحاوية حارس، ثم يحوّل الموقع إلى الصورة الجديدة. بعدها يتحقق من `/api/health`، وإذا فشل الفحص يرجع للإصدار السابق تلقائيًا. في النهاية يزيل الحارس ويأخذ نسخة احتياطية بعد النشر.

لا يوجد نشر تلقائي عند الدفع، ولا يُعدّل السكربت قاعدة البيانات، ولا يلمس أي خدمة أخرى. أي إصدار فيه ترحيلات يُرفض ويُنشر يدويًا كما في `docs/START_HERE.md`.

## التجهيز لمرة واحدة (بصلاحية root على الخادم)

1. **نسخة من المصدر للبناء** (المستودع عام، والنسخة للقراءة فقط):
   ```sh
   git clone --filter=blob:none https://github.com/alaoufi/aser /opt/jdatna/deploy-src
   install -m 750 -o root -g root /opt/jdatna/deploy-src/infra/deploy/jdatna-deploy.sh /usr/local/sbin/jdatna-deploy
   ```
2. **أمر التحويل `SWITCH_CMD`**: سكربت صغير يأخذ وسم الصورة (مثل `jdatna-application:<sha>`) ويحوّل خدمة جدتنا في Coolify إليه، بنفس الطريقة المعتمدة يدويًا: تحديث وسم الصورة في Source Compose ثم Deploy مع `pull_policy: never`. يكتبه من نفّذ النشرات السابقة لأنه يعرف الطريقة المجربة. يُحفظ في `/usr/local/sbin/jdatna-switch` بملكية root وصلاحية 700. أي رمز API يحتاجه يُحفظ في ملف root فقط تحت `/etc/jdatna/`، ولا يُحفظ في Git ولا في GitHub. جرّبه يدويًا مرة بإرجاع الإصدار الحالي نفسه.
3. **ملف الإعداد** `/etc/jdatna/deploy.env` بصلاحية 600:
   ```sh
   REPO_DIR=/opt/jdatna/deploy-src
   RELEASES_DIR=/opt/jdatna/releases
   SWITCH_CMD=/usr/local/sbin/jdatna-switch
   PUBLIC_HEALTH=https://jdatna.com/api/health
   # اختياري: أمر اختبار استعادة النسخة الاحتياطية المعتمد
   VERIFY_CMD=
   ```
4. **مفتاح النشر المقيد**: يُنشأ على الخادم، ويُسمح له بتشغيل السكربت فقط:
   ```sh
   ssh-keygen -t ed25519 -N '' -C jdatna-github-deploy -f /root/jdatna-deploy-key
   echo "command=\"/usr/local/sbin/jdatna-deploy\",restrict $(cat /root/jdatna-deploy-key.pub)" >> /root/.ssh/authorized_keys
   cat /root/jdatna-deploy-key      # انسخه إلى سر GitHub في الخطوة 5 ثم احذفه:
   shred -u /root/jdatna-deploy-key
   ssh-keyscan -t ed25519 <عنوان الخادم>   # قيمة JDATNA_DEPLOY_KNOWN_HOSTS
   ```
5. **في GitHub** (يمكن من متصفح الجوال): افتح Settings ثم Environments ثم New environment، وسمّها `production`.
   - فعّل **Required reviewers** وأضف حساب المالك، حتى لا يبدأ أي نشر إلا بموافقته.
   - أضف أسرار البيئة الثلاثة:
     - `JDATNA_DEPLOY_SSH_KEY`: المفتاح الخاص من الخطوة 4.
     - `JDATNA_DEPLOY_HOST`: بالشكل `root@<عنوان الخادم>`.
     - `JDATNA_DEPLOY_KNOWN_HOSTS`: ناتج `ssh-keyscan`.
6. **تجربة**: شغّل الزر بالأمر `status` أولًا، ثم `deploy`.

## الاستخدام من الجوال

افتح تطبيق GitHub أو المتصفح، ثم المستودع، ثم Actions، ثم «نشر جدتنا (يدوي)»، ثم Run workflow. اختر:
- `deploy` لنشر آخر الفرع، ويمكن تحديد commit معيّن.
- `rollback` للرجوع للإصدار السابق.
- `status` لمعرفة الإصدار الحي.

بعدها وافق على طلب بيئة `production`. السجل الكامل يظهر في GitHub، ويُحفظ على الخادم في `/var/log/jdatna-deploy.log`.

## التراجع

- **من الجوال:** شغّل `rollback`، وهو يرجع إلى الإصدار السابق المسجل في `/var/lib/jdatna-deploy/previous`.
- **يدويًا:** أرجع وسم الصورة في Coolify.
- **لإيقاف الزر كليًا:** احذف سطر المفتاح من `authorized_keys`، أو عطّل workflow من GitHub.
