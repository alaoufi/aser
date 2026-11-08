# صور الأطباق الشفافة وترقيمها

المالك طلب إزالة الخلفية وتنعيم الحواف ومظهرًا عائمًا وترقيمًا لتحديد المسميات لاحقًا.
الأرقام تخص هوية الصورة داخل العرض، ولا تُعد أسماء أصناف أو ربطًا بمنتجات أسر.

| الرقم | المسمى المعتمد | الملف الأصلي                         | النسخة المستخدمة                           |
| ----- | -------------- | ------------------------------------ | ------------------------------------------ |
| 1     | الأرز          | public/food/rice-plate.jpeg          | public/food/rice-plate-cutout.png          |
| 2     | مطازيز         | public/food/traditional-platter.jpeg | public/food/traditional-platter-cutout.png |
| 3     | مرقوق          | public/food/clay-pot.jpeg            | public/food/clay-pot-cutout.png            |
| 4     | جريش           | public/food/grain-plate.jpeg         | public/food/grain-plate-cutout.png         |
| 5     | طبق سمك        | public/food/fish-tray.jpeg           | public/food/fish-tray-cutout.png           |

المجلد النهائي داخل هذا المستودع: public/food، والنسخ الأصلية JPEG محفوظة.
المحرر المستخدم: أداة imagegen المدمجة، وليس CLI أو API مدفوعًا منفصلًا.
النواتج نُسخت من مجلد generated_images المحلي إلى المستودع. أبعاد كل ناتج1254×1254
وقناة alpha فعلية مع خلفية شفافة. الظل والأرقام عناصر CSS/HTML منفصلة،
ولا تُحرق داخل الصور. التعديل البصري لا يغير حقوق الصورة الأصلية.

## Prompt set

نفس البرومبت أدناه لكل ملف، مع استبدال N بالرقم من الجدول، وصورة ذلك الصف
فقط كـ edit target، وtransparent_background=true:

> EDIT TARGET: the single attached food photograph. Produce a meticulous photographic background-removal cutout of this EXACT same dish for a website, not a reimagined dish. Preserve the entire plate or vessel and all food, ingredient placement, colors, texture, perspective, proportions, and especially any fish tail. Remove ONLY the surrounding plain white background to genuine transparent alpha. Do not replace it with white, checkerboard, a colored background, a scene or a table. Keep plate interior and white ceramic opaque. Keep the full dish uncropped, centered with a small transparent safety margin. Antialias the outer silhouette with a very subtle soft edge to avoid a white halo; do not blur food or distort geometry. NO baked shadow (the website will add a soft floating shadow), NO labels, numbers, writing, logos, or extra objects. This is asset N of five; output one isolated dish only.

## التحقق

فحص بصري للأطباق، وقناة alpha (min0/max255) لجميع الملفات. اختُبرت على
خلفيات كريمية وبنية داكنة وزيتونية، وتحقق أن استجابة Next/Image المحسنة
تحتفظ بالشفافية. ترقيم1..5 وإزالة الإطارات البيضاء ومظهر الظل متحقق محليًا
على10 مقاسات320..1600، دون تداخل البحث والصور أو تجاوز عرض الشاشة.
اختبار food.spec.ts المخصص للترقيم والهندسة وTypeScript ناجحان.
لوحة الترقيم المرجعية: artifacts/numbered-dishes.png (لقطة HTML، ليست منتجًا في القاعدة).

## اعتماد المسميات

المالك اعتمد1 الأرز،2 مطازيز،3 مرقوق،4 جريش،5 طبق سمك. الأسماء تظهر
تحت الصور وفي النص البديل. تعديل الشكل الحالي عرض CSS بدوران طفيف وتحجيم
متناسب وظل، دون قص أو تمديد أو إعادة تحرير الأصول الشفافة أو تغيير الطعام.
