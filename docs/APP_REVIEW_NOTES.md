# ملاحظات مراجعة آبل — أكلات جدتنا iOS 1.0.0

رفض 2026-11-11 تحت Guideline 2.1 Information Needed (Submission ID `106f7700-bbda-42e1-8193-945d4b1687f7`).
يُلصق النص الإنجليزي أدناه في App Store Connect ← App Review Information ← Notes، ويُرفق فيديو
المحاكي (من سير العمل `alaoufi/apple-apps` ← Record Jdatna) في Attachment. رقم الجوال وكلمة المرور
للحساب التجريبي في حقلي Sign-In Information فقط، ولا يُكتبان هنا.

---

```text
Hello App Review team, thank you for the review. Answers to the six requests:

1) SCREEN RECORDING
Attached: a screen recording from an iPhone (iOS Simulator) that starts at app launch and shows: the home screen and browsing as a guest; the account sign-up form (mobile number + password, confirmed by an SMS code); sign-in with the demo account; a home-cook family page and a dish page, each with the "Report" button (الإبلاغ); a chat with the family and its ⋮ menu with "Report conversation" (إبلاغ عن المحادثة) and "Block conversation" (حظر المحادثة); the "My orders" (طلباتي) page; and in-app account deletion ("حذف حسابي" at the bottom of My orders, which opens a confirmation where the user types «حذف حسابي» and confirms). The app has no paid content.

2) PURPOSE AND AUDIENCE
"Akalat Jadatna" (أكلات جدتنا, "Our Grandmother's Dishes") is a free Arabic marketplace that connects customers in Saudi Arabia with home-cook families ("productive families", الأسر المنتجة) who sell traditional Saudi dishes such as jareesh, marqooq and matazeez. Customers browse the dishes of the day, filter by region and city, see which families cover their area, send an order request and chat with the family. Families register, pass an eligibility review by our admins, and manage their products, offers, coverage areas and incoming orders. Audience: adults in Saudi Arabia who want home-cooked food, and the home-cook families who sell it. The app shows our website jdatna.com inside a native iOS shell.

3) HOW TO ACCESS THE FEATURES (DEMO ACCOUNT)
Browsing, family pages, dish pages, reporting and placing an order request work without an account.
Sign in: tap the menu (☰) at the top → "تسجيل الدخول" (Sign in) → enter the mobile number and password from the Sign-In Information fields → "دخول". The demo account is already verified, so no SMS code is needed.
- Chats: menu ☰ → "المحادثات" (Messages), or open a family page → message the family. In a chat, the ⋮ button at the top has Report and Block.
- Orders: menu ☰ → "طلباتي" (My orders).
- Report content: "الإبلاغ عن الأسرة المنتجة" on a family page, "الإبلاغ عن المنتج" on a dish page.
- Delete account: menu ☰ → "طلباتي" → scroll to the bottom → "حذف حسابي" → type «حذف حسابي» → "حذف حسابي نهائيًا". It is also at https://jdatna.com/account/delete.
New accounts sign up with a Saudi mobile number and a 4-digit SMS code, so please use the demo account instead.

4) THIRD-PARTY SERVICES
- Taqnyat (Saudi SMS provider): sends the one-time SMS code at sign-up and password reset.
- S3-compatible object storage: stores product photos (public) and families' eligibility documents (private).
- OpenStreetMap map tiles (through the open-source Leaflet library): maps of family coverage areas.
- Phone and WhatsApp links open the iOS Phone app or WhatsApp only when the user taps them.
There is no third-party sign-in, advertising, analytics/tracking SDK, or payment provider. Our own server (in-house) hosts the website and the PostgreSQL database.

5) DIFFERENCES BETWEEN COUNTRIES OR REGIONS
The app is the same in every country. Its content is in Arabic and the families and their coverage areas are in Saudi Arabia, so it is useful mainly in Saudi Arabia. Sign-up needs a Saudi mobile number to receive the SMS code.

6) REGULATED INDUSTRY
No. The app is not in a highly regulated field (not health, finance, gambling, alcohol or similar). It does not process payments: the customer and the family agree on the order, price and delivery directly, and payment happens outside the app between them. The app has no in-app purchases or subscriptions. Families provide their own documents for our eligibility review; the documents stay private.

Thank you.
```
