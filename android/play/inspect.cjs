// قراءة فقط: يعرض ما يراه مفتاح Google Play عن التطبيق (المسارات، البلدان، المختبرون، بطاقة المتجر،
// بيانات التواصل) ليُعرف ما ينقصه. يفتح edit ثم يحذفه، فلا يتغير شيء في المتجر.
// Usage: PLAY_PACKAGE=com.jdatna.app node android/play/inspect.cjs
const { accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const packageName = process.env.PLAY_PACKAGE || 'com.jdatna.app';
  const { token } = await accessToken();
  console.log("Signed in with the service account");
  await withEdit(token, packageName, async edit => {
    const read = async (label, path, show) => {
      try {
        show(await edit.call(path.startsWith(':') ? 'POST' : 'GET', path));
      } catch (err) {
        console.log(`${label}: (${err.status || '?'}) ${String(err.message).slice(0, 160)}`);
      }
    };
    await read('tracks', '/tracks', ({ tracks = [] }) => {
      for (const t of tracks) {
        for (const r of t.releases || [])
          console.log(`track ${t.track}: ${r.name} [${(r.versionCodes || []).join(',')}] status=${r.status} notes=${(r.releaseNotes || []).map(n => n.language).join(',') || 'none'}`);
        if (!(t.releases || []).length) console.log(`track ${t.track}: empty`);
      }
    });
    for (const track of ['production', 'alpha', 'internal'])
      await read(`countries ${track}`, `/countryAvailability/${track}`, d =>
        console.log(`countries ${track}: restOfWorld=${Boolean(d.restOfWorld)} syncWithProduction=${Boolean(d.syncWithProduction)} [${(d.countries || []).map(c => c.countryCode).join(',')}]`));
    for (const track of ['alpha', 'internal'])
      await read(`testers ${track}`, `/testers/${track}`, d =>
        console.log(`testers ${track}: googleGroups=${(d.googleGroups || []).length}`));
    await read('details', '/details', d =>
      console.log(`details: defaultLanguage=${d.defaultLanguage} email=${d.contactEmail ? 'set' : 'MISSING'} phone=${d.contactPhone ? 'set' : 'missing'} website=${d.contactWebsite || 'missing'}`));
    await read('listings', '/listings', ({ listings = [] }) => {
      for (const l of listings)
        console.log(`listing ${l.language}: title="${l.title}" short=${(l.shortDescription || '').length}ch full=${(l.fullDescription || '').length}ch video=${l.video ? 'yes' : 'no'}`);
      if (!listings.length) console.log('listings: NONE');
    });
    for (const type of ['icon', 'featureGraphic', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'])
      await read(`images ${type}`, `/listings/ar/${type}`, d => console.log(`images ar/${type}: ${(d.images || []).length}`));
    await read('listing texts', '/listings/ar', l => {
      const limits = { title: 30, shortDescription: 80, fullDescription: 4000 };
      for (const [field, max] of Object.entries(limits)) {
        const length = [...(l[field] || '')].length;
        console.log(`listing ar ${field}: ${length}/${max} ${length === 0 ? 'EMPTY' : length > max ? 'TOO LONG' : 'ok'}`);
      }
      console.log(`listing ar short text: ${l.shortDescription}`);
    });
    // فحص قوقل نفسه للإعدادات الحالية دون أي تغيير: يرفض إن كان في المسارات أو البطاقة خطأ.
    await read('validate', ':validate', () => console.log('validate: Google accepts the current settings (no errors)'));
    return false; // قراءة فقط: يُحذف الـ edit
  });
  console.log('OK: read only, nothing was changed');
})().catch(err => {
  console.error(`NOT OK: ${err.message}`);
  process.exit(1);
});
