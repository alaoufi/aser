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

## آبل ستور (الحساب جاهز)

1. App Store Connect ← **My Apps ← +** ← Bundle ID: `com.jdatna.app`، الاسم: أكلات جدتنا، اللغة الأساسية: العربية.
2. البناء يحتاج جهاز Mac مع Xcode:
   ```
   npm create @capacitor/app jdatna-ios && cd jdatna-ios
   npm i @capacitor/ios @capacitor/push-notifications @capacitor/geolocation
   انسخ store/ios/capacitor.config.json إلى المشروع
   npx cap add ios && npx cap open ios
   ```
   - في Xcode: Signing (فريقكم)، Capabilities: **Push Notifications** و**Associated Domains** (`applinks:jdatna.com`)، وفي Info.plist: `NSLocationWhenInUseUsageDescription` = «نستخدم موقعك لعرض أطباق منطقتك ومعرفة هل توصل الأسرة المنتجة إليك».
   - Product ← Archive ← Distribute ← App Store Connect.
3. jdatna.com ← الإدارة ← **تطبيق الجوال** ← `TeamID.com.jdatna.app`. تحقق: https://jdatna.com/.well-known/apple-app-site-association
4. املأ الصفحة والخصوصية وملاحظات المراجع من `LISTING.md`، وارفع لقطات `iphone67-*` و`iphone65-*`.

## تنبيه مهم عن إشعارات الآيفون

إشعارات الويب (المفعلة الآن) تعمل في أندرويد داخل التطبيق، وفي الآيفون **للموقع المضاف للشاشة الرئيسية فقط**. داخل تطبيق آبل من المتجر تحتاج إشعارات آبل الأصلية (APNs): مفتاح `.p8` من حساب آبل يُحفظ سرًا على الخادم، وربط إضافة Capacitor بالخادم. هذه خطوة لاحقة مستقلة؛ التطبيق يعمل ويُقبل بدونها، والتنبيه داخل التطبيق (النافذة والعدد الأحمر) يعمل.

## قبل الإرسال للمراجعة

- [ ] وسيلة تواصل في «نصوص الموقع» ← «الدعم والتواصل».
- [ ] جوال تجريبي يستقبل الرمز لمراجعي المتجرين.
- [ ] تعبئة «تطبيق الجوال» في الإدارة بعد إنشاء التطبيقين.
