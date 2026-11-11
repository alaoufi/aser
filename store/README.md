# حزمة الرفع: قوقل بلاي وآبل ستور

كل ما في هذا المجلد للرفع فقط، ولا يدخل في بناء الموقع. التطبيقان يعرضان jdatna.com نفسه، فكل نشر على الموقع يظهر فيهما فورًا.

| الملف | الاستخدام |
| --- | --- |
| `LISTING.md` | نصوص صفحة التطبيق، أمان البيانات، الخصوصية، ملاحظات المراجع |
| `assets/apple-icon-1024.png` | أيقونة آبل 1024×1024 بلا شفافية |
| `assets/play-icon-512.png` | أيقونة قوقل بلاي 512×512 |
| `assets/play-feature-1024x500.png` | صورة العرض في قوقل بلاي |
| `assets/screens/` | لقطات الشاشة: `android-*` لقوقل (1080×1920)، و`iphone67-*` لآبل 6.7 بوصة (1290×2796)، و`iphone65-*` لآبل 6.5 بوصة (1242×2688) |
| `android/twa-manifest.json` | إعداد تطبيق أندرويد (Bubblewrap / PWABuilder) |
| `ios/capacitor.config.json` | إعداد غلاف الآيفون (Capacitor) |

## قوقل بلاي (الحساب جاهز)

1. ادخل https://www.pwabuilder.com واكتب `https://jdatna.com` ← Package for stores ← Android.
   - Package ID: `com.jdatna.app` — الاسم: أكلات جدتنا — اختر **Signing key: New** واحتفظ بملف المفتاح وكلمته عندكم (لا ترسلها لأحد).
   - أو بالأداة: `npx @bubblewrap/cli init --manifest https://jdatna.com/manifest.webmanifest` ثم `build` (يستخدم `android/twa-manifest.json`).
2. Play Console ← **Create app** (تطبيق جديد مستقل عن تطبيقات الحساب الأخرى) ← ارفع ملف `.aab` في **Internal testing** أولًا.
3. Play Console ← Setup ← **App signing** ← انسخ **SHA-256 certificate fingerprint**.
4. jdatna.com ← الإدارة ← **تطبيق الجوال** ← اسم الحزمة `com.jdatna.app` والبصمة ← حفظ. تحقق: https://jdatna.com/.well-known/assetlinks.json
5. املأ **Store listing** و**Data safety** و**Content rating** و**App access** (الجوال التجريبي) من `LISTING.md`، ثم انقل الإصدار للإنتاج.

## آبل ستور (بناء سحابي بلا ماك)

التطبيق مسجّل: App Store Connect ← «أكلات جدتنا»، المعرف `com.jdatna.app`، فريق آبل `F6RN596WCX`.

1. **مرة واحدة:** App Store Connect ← Users and Access ← Integrations ← App Store Connect API ← Team Keys ← «+»، الاسم `GitHub Build`، الصلاحية **Admin**، ثم حمّل ملف `AuthKey_XXXX.p8` (يُحمَّل مرة واحدة فقط).
2. **مرة واحدة:** GitHub ← المستودع ← Settings ← Secrets and variables ← Actions ← New repository secret، وأضف:
   - `ASC_KEY_ID`: رقم المفتاح (Key ID).
   - `ASC_ISSUER_ID`: Issuer ID أعلى الصفحة نفسها.
   - `ASC_KEY_P8`: محتوى ملف `.p8` كاملًا (افتحه بالمفكرة وانسخ كل ما فيه).
3. **كل إصدار:** GitHub ← Actions ← «بناء تطبيق الآيفون» ← Run workflow ← رقم الإصدار. يُبنى على ماك سحابي ويُرفع إلى TestFlight خلال 20–30 دقيقة.
4. App Store Connect ← TestFlight: جرّب البناء على جوالك، ثم في صفحة الإصدار اختر البناء واملأ الصفحة من `LISTING.md`، ثم Add for Review.

مصدر التطبيق في `mobile/ios/`: إعداد Capacitor، وصفحة «لا يوجد اتصال»، وسكربت `scripts/configure-ios.sh` (الاسم «جدتنا» تحت الأيقونة، نصوص الأذونات بالعربي، الإشعارات الأصلية، روابط jdatna.com، الآيفون فقط). ملف `/.well-known/apple-app-site-association` يحمل `F6RN596WCX.com.jdatna.app` تلقائيًا.

## تنبيه مهم عن إشعارات الآيفون

إشعارات الويب (المفعلة الآن) تعمل في أندرويد داخل التطبيق، وفي الآيفون **للموقع المضاف للشاشة الرئيسية فقط**. داخل تطبيق آبل من المتجر تحتاج إشعارات آبل الأصلية (APNs): مفتاح `.p8` من حساب آبل يُحفظ سرًا على الخادم، وربط إضافة Capacitor بالخادم. هذه خطوة لاحقة مستقلة؛ التطبيق يعمل ويُقبل بدونها، والتنبيه داخل التطبيق (النافذة والعدد الأحمر) يعمل.

## قبل الإرسال للمراجعة

- [ ] وسيلة تواصل في «نصوص الموقع» ← «الدعم والتواصل».
- [ ] جوال تجريبي يستقبل الرمز لمراجعي المتجرين.
- [ ] تعبئة «تطبيق الجوال» في الإدارة بعد إنشاء التطبيقين.
