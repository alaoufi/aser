# مراجعة Apple — «أكلات جدتنا» (com.jdatna.app)

الرفض في 2026-11-11: **Guideline 2.1 – Information Needed** (2.1.0 App Completeness). تطلب Apple ستة أشياء في خانة
**Notes** داخل App Review Information، ومعها تسجيل شاشة. الطريقة نفسها المتبعة في «أي خدمة»
(`docs/APP_REVIEW_NOTES.md` في alaoufi/aykdmah). لا كلمات مرور هنا.

## حسابا المراجعة (5.7.0.0)

يجهزهما المالك من **الإدارة ← مراجعة المتاجر**، ويختار هناك كلمة مرور واحدة للحسابين، فلا تُحفظ في المستودع:

| الحساب                       | اسم المستخدم          | الجوال (لا تصله رسائل)                           |
| ---------------------------- | --------------------- | ------------------------------------------------ |
| عميل                         | `apple_review_client` | 0500000001                                       |
| أسرة منتجة                   | `apple_review_family` | 0500000002                                       |
| إنشاء حساب ثم حذفه في المقطع | —                     | 0500000003، والرمز 1234 أثناء «وضع المراجعة» فقط |

- الدخول باسم المستخدم وكلمة المرور، بلا رمز SMS.
- التجهيز ينشئ للأسرة «أسرة المراجعة» طبقًا متاحًا هو «جريش بالدجاج (تجريبي)»، وطلبًا مقبولًا، ومحادثة من رسالتين.
- الأسرة التجريبية لا تظهر في البحث ولا «مائدة اليوم» ولا العروض ولا خريطة الموقع.
- لا يطلب من الأسرة التجريبية ولا يراسلها إلا حساب مراجعة، وحساب المراجعة لا يصل إلى أسرة حقيقية.
- «وضع المراجعة» يُفتح لمدة يختارها المالك ويُغلق تلقائيًا. أثناءه فقط يُقبل الرمز الثابت للرقم الثالث.
- حسابا المراجعة لا يُغيَّر لهما شيء برمز التحقق.
- رمز SMS لباقي المستخدمين كما هو دائمًا.

## Notes: تُلصق في App Store Connect ← النسخة ← App Review Information ← Notes

```
1) SCREEN RECORDING
Attached (App Review Information > Attachment). It starts by launching the app and shows: browsing as a guest,
creating a new account, deleting it, signing in with the demo customer account, the order, the chat with Report
and Block, the family page with its dish and Report button, and rating.

2) PURPOSE AND AUDIENCE
Jdatna ("Our Grandmother's Dishes") is a Saudi marketplace for traditional homemade food. Home-based "productive
families" list their dishes; people who want homemade food find dishes available today near them, send an order
request and chat with the family. Audience: adults in Saudi Arabia (customers and home cooks).

3) HOW TO ACCESS THE MAIN FEATURES
The interface is Arabic; button names are given in quotes. Browsing needs no account. Demo accounts sign in with
a password only (no SMS code):
- Customer: apple_review_client
- Productive family: apple_review_family
The password is in the Password field above (same for both).
Sign in: menu ☰ (top right) > "تسجيل الدخول" > username and password > "دخول".
As the customer (opens on "طلباتي" = My orders):
- The accepted order of "جريش بالدجاج (تجريبي)" from the demo family "أسرة المراجعة".
- "مراسلة الأسرة المنتجة" opens the chat. In the chat, the ⋮ button has "إبلاغ عن المحادثة" (Report) and
  "حظر المحادثة" (Block; both sides can no longer send).
- Rating: under the order choose stars, tick the honesty pledge, "إرسال التقييم". Comments are seen only by admins;
  the public sees the average.
- In the chat, tap the family name at the top to open the family page: its dish, "مراسلة الأسرة المنتجة" and
  "الإبلاغ عن الأسرة المنتجة" (Report). The dish page has "الإبلاغ عن المنتج" and the order form ("مراجعة الطلب قبل
  الإرسال"). "إعداد طلب جديد من المنتج" under the order opens a new order request.
- Reports go to our admin team, reviewed within 24 hours; admins can hide dishes and suspend accounts.
- Account deletion: bottom of "طلباتي": "حذف حسابي" > "نعم، أريد الحذف" > type DELETE (or "حذف حسابي") >
  "حذف حسابي نهائيًا" > OK.
  Also https://jdatna.com/account/delete . Please do not delete the demo accounts.
As the family: sign out ("تسجيل الخروج"), sign in as apple_review_family: "لوحتي" (Dashboard) shows its dish,
incoming orders ("الطلبات") and the same chat.
New account (optional): "تسجيل الدخول" > "إنشاء حساب جديد", type "عميل", mobile 0500000003,
"أرسل رمز التحقق", code 1234, then set a password. This number works only during review; delete it afterwards.

4) EXTERNAL SERVICES
- Our own server and PostgreSQL database (jdatna.com); the app shows jdatna.com inside a native shell.
- S3-compatible object storage on our account: dish photos and private verification documents.
- Taqnyat (Saudi SMS gateway): verification codes at sign-up and password reset.
- OpenStreetMap tiles: map for delivery coverage.
- Web Push / Apple Push Notification service: notifications for new messages and orders.
No payment processor, no ads, no analytics or tracking SDKs, no AI services.

5) REGIONAL DIFFERENCES
The app works the same in all regions. Families are currently in Saudi Arabia, and the interface is Arabic.

6) REGULATED INDUSTRY / THIRD-PARTY MATERIAL / PAYMENTS
No payments in the app: customer and family agree and pay each other directly on pickup or delivery, outside the
app, with no commission. No digital goods and no in-app purchase. Families confirm they hold any licenses their
home food business requires; our team reviews each family before publishing. No protected third-party content.
```

## تسجيل الشاشة

سير العمل «Record Jdatna» في alaoufi/apple-apps (`.github/workflows/jdatna-record.yml` و`scripts/jdatna-record.py`)
يسجّل على محاكي آيفون نفس خطوات Notes بالترتيب. يقرأ السر `JDATNA_REVIEW_LOGIN`: السطر الأول
`apple_review_client`، والثاني كلمة المرور. يعمل بعد تجهيز الحسابين وفتح «وضع المراجعة». الفيديو مضغوط أقل من
30MB ويُرفع في Attachment.
