// لقطات التابلت (7 و10 بوصة) لبطاقة المتجر العربية من store/assets/screens/tablet7-*.png وtablet10-*.png.
// الوضع الافتراضي تجربة: يرفع اللقطات داخل edit، يطلب تحقق قوقل، ثم يحذف الـ edit فلا يتغير شيء.
// الحفظ الفعلي (يرسل التغيير للمراجعة) يحتاج PLAY_APPLY=tablet-screens، ولا يُشغَّل إلا بموافقة المالك.
// نتيجة 2026-11-19: قوقل قبل اللقطات العشر، لكن المفتاح بلا صلاحية تعديل بطاقة المتجر (403 عند التحقق)،
// فيرفعها المالك من Play Console أو يمنح المفتاح صلاحية «إدارة بطاقة المتجر».
// Usage: PLAY_PACKAGE=com.jdatna.app node android/play/tablet-screens.cjs
const fs = require('fs');
const path = require('path');
const { accessToken, withEdit } = require('./play-api.cjs');

const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const DIR = path.join(__dirname, '..', '..', 'store', 'assets', 'screens');
const SETS = [['sevenInchScreenshots', 'tablet7-'], ['tenInchScreenshots', 'tablet10-']];

(async () => {
  const packageName = process.env.PLAY_PACKAGE || 'com.jdatna.app';
  const apply = process.env.PLAY_APPLY === 'tablet-screens';
  const { token, email } = await accessToken();
  console.log(`Signed in as ${email}. Mode: ${apply ? 'APPLY' : 'dry run'}`);
  await withEdit(token, packageName, async edit => {
    for (const [type, prefix] of SETS) {
      const files = fs.readdirSync(DIR).filter(f => f.startsWith(prefix) && f.endsWith('.png')).sort();
      if (files.length < 2) throw new Error(`need at least 2 files ${prefix}*.png in store/assets/screens`);
      const before = (await edit.call('GET', `/listings/ar/${type}`)).images || [];
      if (before.length) await edit.call('DELETE', `/listings/ar/${type}`);
      for (const file of files) {
        const res = await fetch(`${UPLOAD}/${packageName}/edits/${edit.id}/listings/ar/${type}?uploadType=media`, {
          method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
          body: fs.readFileSync(path.join(DIR, file)),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`upload ${file}: ${res.status} ${text.slice(0, 200)}`);
      }
      const after = (await edit.call('GET', `/listings/ar/${type}`)).images || [];
      console.log(`${type}: was ${before.length}, now ${after.length} in the edit (${files.join(', ')})`);
      if (after.length !== files.length) throw new Error(`${type}: expected ${files.length} images`);
    }
    await edit.call('POST', ':validate');
    console.log('Google accepts the edit with the tablet screenshots');
    if (!apply) console.log('DRY RUN OK: the edit is deleted, nothing was changed in the store');
    return apply;
  });
  if (apply) console.log('APPLIED: tablet screenshots saved and sent with the listing');
})().catch(err => {
  console.error(`NOT OK: ${err.message}`);
  process.exit(1);
});
