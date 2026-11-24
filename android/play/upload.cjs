// يرفع ملف .aab الموقّع إلى مسار في Google Play ويرسله للمراجعة (قرار المالك 2026-11-24: «ارفعه الآن»).
// لا يعمل إلا من سير «بناء تطبيق أندرويد» حين يختار المالك الرفع عند التشغيل.
// Usage: PLAY_PACKAGE=com.jdatna.app node android/play/upload.cjs <file.aab> <track> <versionName> <versionCode>
const fs = require('fs');
const { API, accessToken, withEdit } = require('./play-api.cjs');

const NOTES = 'التطبيق يفتح jdtna.sa، وتحسين الاستقرار عند فتح التطبيق.';

(async () => {
  const [file, track, name, code] = process.argv.slice(2);
  const packageName = process.env.PLAY_PACKAGE || 'com.jdatna.app';
  if (!file || !fs.existsSync(file)) throw new Error(`bundle not found: ${file}`);
  if (!['internal', 'alpha', 'beta', 'production'].includes(track)) throw new Error(`bad track: ${track}`);
  if (!/^\d+$/.test(code || '')) throw new Error(`bad version code: ${code}`);
  const { token } = await accessToken();
  console.log('Signed in with the service account');
  await withEdit(token, packageName, async edit => {
    const res = await fetch(
      `${API.replace('/androidpublisher/', '/upload/androidpublisher/')}/${packageName}/edits/${edit.id}/bundles?uploadType=media`,
      { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: fs.readFileSync(file) },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`upload: ${res.status} ${data?.error?.message || res.statusText}`);
    if (String(data.versionCode) !== String(code)) throw new Error(`uploaded version ${data.versionCode}, expected ${code}`);
    console.log(`Uploaded ${name} [${code}] sha256=${data.sha256}`);
    await edit.call('PUT', `/tracks/${track}`, {
      track,
      releases: [{ name, versionCodes: [String(code)], status: 'completed', releaseNotes: [{ language: 'ar', text: NOTES }] }],
    });
    await edit.call('POST', ':validate');
    console.log('Edit validated by Google');
    try {
      await edit.call('POST', ':commit');
      console.log(`DONE: ${name} [${code}] is in ${track} and was sent for review`);
    } catch (err) {
      // كما في promote.cjs: إن رفض قوقل الإرسال التلقائي يُحفظ الإصدار ويبقى زر «إرسال للمراجعة» للمالك.
      if (!/changesNotSentForReview/i.test(err.message)) throw err;
      await edit.call('POST', ':commit?changesNotSentForReview=true');
      console.log(`SAVED, NOT SENT: ${name} [${code}] is in ${track}; press "Send for review" in Play Console (Publishing overview)`);
    }
    return false;
  });
})().catch(err => {
  console.error(`NOT OK: ${err.message}`);
  process.exit(1);
});
