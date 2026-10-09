# خطوط توليد السيرة

خط **Readex Pro** بأوزانه الأربعة، يُضمَّن في حزمة دالة `cv-pdf` عند البناء
عبر `scripts/build-site.mjs`، ويُستخدم في صفّ ملف السيرة بمحرك Typst.

- المصدر: [Readex Pro](https://github.com/ThomasJockin/readexpro) عبر Google Fonts.
- الرخصة: SIL Open Font License 1.1 — نصّها الكامل في [OFL.txt](OFL.txt)، وهي تجيز التضمين وإعادة التوزيع.

لتحديث الأوزان أو إضافة خط، ضع ملف `.ttf` أو `.otf` هنا؛ يلتقطه البناء تلقائيًا.
وغيِّر اسم العائلة في `renderCvTypst` بـ `src/cv-typst.mjs` إن أردت خطًّا آخر.
