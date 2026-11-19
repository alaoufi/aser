// Read-only check of the Google Play key (المصدر: alaoufi/server-edge playbooks/code/stores): signs in with PLAY_SERVICE_ACCOUNT_JSON, opens
// an edit of the app, lists every track with its versions, then deletes the edit. Nothing in the
// store changes. Usage: PLAY_PACKAGE=com.jdatna.app node android/play/check.cjs
const { accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const packageName = process.env.PLAY_PACKAGE || 'com.jdatna.app';
  const { token, email } = await accessToken();
  console.log(`Signed in to Google as ${email}`);
  await withEdit(token, packageName, async edit => {
    const { tracks = [] } = await edit.call('GET', '/tracks');
    console.log(`App ${packageName}: ${tracks.length} tracks`);
    for (const track of tracks) {
      const releases = (track.releases || []).map(r => `${r.name || '?'} [${(r.versionCodes || []).join(',')}] ${r.status}${r.userFraction ? ` ${Math.round(r.userFraction * 100)}%` : ''}`);
      console.log(`- ${track.track}: ${releases.join(' | ') || 'empty'}`);
    }
    return false; // read only: the edit is deleted, nothing is published
  });
  console.log('OK: the key can manage releases of this app (nothing was changed)');
})().catch(err => {
  console.error(`NOT OK: ${err.message}`);
  if (err.status === 403 || err.status === 401) console.error('The key is valid but has no access to this app in Play Console (Users and permissions).');
  process.exit(1);
});
