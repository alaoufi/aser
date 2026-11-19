# النسخ الاحتياطية: التقرير، و«خذ نسخة الآن»، والتخزين الخارجي (R2)

صفحة الإدارة ← التقارير ← «النسخ الاحتياطية» تعرض ما يسجّله الخادم. التطبيق لا يأخذ النسخ بنفسه ولا يملك مفتاح تشفيرها: يكتب الطلب فقط، والخادم ينفّذه.

## الأنواع

| النوع | ما يحتويه | أين يُحفظ على الخادم |
| --- | --- | --- |
| كاملة `full` | قاعدة البيانات، الإعدادات، الصور والمستندات | `/var/backups/jdatna/jdatna-<وقت>.tar.gpg` (يومية 04:30 وقبل كل نشر) |
| صور ومستندات `media` | `uploads` و`object-storage` | `/var/backups/jdatna/manual/jdatna-media-<وقت>.tar.gpg` |
| كود وقاعدة بيانات `codedb` | مصدر الإصدار المنشور (`git archive`) وقاعدة البيانات | `/var/backups/jdatna/manual/jdatna-codedb-<وقت>.tar.gpg` |

النسخ اليدوية في مجلد `manual` فلا تمسّ تدوير النسخ الكاملة ولا فحص الاسترجاع قبل النشر. يبقى على الخادم آخر 3 من كل نوع يدوي.

كل ملف مشفّر (AES-256) بالمفتاح `/etc/jdatna/secrets/backup-key`. **احتفظ بنسخة من هذا المفتاح خارج الخادم؛ بدونه لا تُسترجع أي نسخة.**

## الملفات

- `infra/backup.sh`: النسخة الكاملة (كما كانت)، ثم الرفع إلى R2 والتسجيل في `backup_runs`.
- `infra/backup-manual.sh media|codedb`: نسخة يدوية.
- `infra/backup-upload.sh <ملف>`: الرفع إلى R2 (يخرج 3 إن لم يُهيأ).
- `infra/backup-requests.sh` مع `jdatna-backup-requests.service/.timer`: ينفّذ طلبات الإدارة كل دقيقة.

## التفعيل على الخادم (يدوي، مرة واحدة، بموافقة المالك)

1. تحديث مجلد `/opt/jdatna/infra` بالملفات أعلاه من الإصدار المنشور.
2. خدمة الطلبات: نسخ ملفي `jdatna-backup-requests.*` إلى `/etc/systemd/system/` ثم `systemctl daemon-reload && systemctl enable --now jdatna-backup-requests.timer`.
3. R2 للرفع من الخادم: ملف `/etc/jdatna/secrets/r2.env` (root، 600):
   ```
   R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   R2_BUCKET=<اسم الحاوية>
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   ```
4. R2 للتحميل من الموقع: المتغيرات الأربعة نفسها في `/etc/jdatna/runtime.env`، ثم إعادة تشغيل التطبيق (أو مع النشر التالي). يُفضَّل لها مفتاح R2 **للقراءة فقط** على حاوية النسخ.
5. بديل التحميل دون R2: ربط `/var/backups/jdatna` بالتطبيق للقراءة وضبط `BACKUP_DIR`.

المفاتيح لا تُكتب في Git ولا في المحادثة.

## ما لم يُختبر

سكربتات الخادم (`backup-manual.sh`, `backup-upload.sh`, `backup-requests.sh`) فُحصت صياغتها وجُرّبت جمل SQL التي تكتبها على قاعدة اختبار، ولم تُشغَّل على الخادم ولا مع R2 حقيقي. أول تشغيل يُراقَب، ويُتحقق من ظهور النسخة في التقرير ومن فتح الملف المنزَّل بالمفتاح.

الحذف من R2 ليس آليًا: السكربتات لا تحذف منه. تُضبط مدة الاحتفاظ من قاعدة دورة الحياة (Lifecycle) في لوحة Cloudflare.
