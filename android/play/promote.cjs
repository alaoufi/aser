// ترقية إصدار من مسار إلى مسار في Google Play (مثلًا من الاختبار المغلق إلى الإنتاج).
// يغيّر المتجر ويرسل للمراجعة، فلا يعمل إلا بطلب صريح مطابق في android/play/promote-request.json
// (قرار المالك). إن كان الإصدار في المسار الهدف أصلًا فلا يفعل شيئًا.
// Usage: PLAY_PACKAGE=com.jdatna.app node android/play/promote.cjs
const fs = require('fs');
const path = require('path');
const { accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const packageName = process.env.PLAY_PACKAGE || 'com.jdatna.app';
  const request = JSON.parse(fs.readFileSync(path.join(__dirname, 'promote-request.json'), 'utf8'));
  const { from, to } = request;
  const versionCode = String(request.versionCode);
  if (request.package !== packageName) throw new Error(`request is for ${request.package}, not ${packageName}`);
  if (!['alpha', 'beta', 'internal'].includes(from) || to !== 'production' || !/^\d+$/.test(versionCode))
    throw new Error('request must be {from: alpha|beta|internal, to: production, versionCode}');

  const { token } = await accessToken();
  console.log("Signed in with the service account");
  await withEdit(token, packageName, async edit => {
    const source = await edit.call('GET', `/tracks/${from}`);
    const release = (source.releases || []).find(r => (r.versionCodes || []).map(String).includes(versionCode));
    if (!release) throw new Error(`version ${versionCode} is not in track ${from}`);
    const target = await edit.call('GET', `/tracks/${to}`);
    const current = (target.releases || []).flatMap(r => (r.versionCodes || []).map(String));
    console.log(`${to} now: [${current.join(',')}]  ${from}: ${release.name} [${versionCode}]`);
    if (current.includes(versionCode)) {
      console.log(`Nothing to do: version ${versionCode} is already in ${to}`);
      return false;
    }
    await edit.call('PUT', `/tracks/${to}`, {
      track: to,
      releases: [{ name: release.name, versionCodes: [versionCode], status: 'completed', releaseNotes: release.releaseNotes || [] }],
    });
    await edit.call('POST', ':validate');
    console.log('Edit validated by Google');
    try {
      await edit.call('POST', ':commit');
      console.log(`DONE: ${release.name} [${versionCode}] is now in ${to} and was sent for review`);
    } catch (err) {
      // قوقل يرفض الإرسال التلقائي أحيانًا (تغييرات سابقة مرفوضة أو قيد المراجعة): نحفظ التغيير
      // ويبقى زر «إرسال للمراجعة» في Play Console للمالك.
      if (!/changesNotSentForReview/i.test(err.message)) throw err;
      await edit.call('POST', ':commit?changesNotSentForReview=true');
      console.log(`SAVED, NOT SENT: ${release.name} [${versionCode}] is in ${to}; press "Send for review" in Play Console (Publishing overview)`);
    }
    return false; // الحفظ تم أعلاه
  });
})().catch(err => {
  console.error(`NOT OK: ${err.message}`);
  process.exit(1);
});
