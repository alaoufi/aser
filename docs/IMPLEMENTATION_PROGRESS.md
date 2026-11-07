# Implementation progress — 2026-11-08 Riyadh

Approved spec: `docs/superpowers/specs/2026-11-08-platform-design.md`.
Plan: `docs/superpowers/plans/2026-11-08-platform.md`.

## Implemented and verified locally

Next.js 16.4.5 / React19.3.1 / TypeScript7.0.2, Arabic public catalogue and profiles,
cookie/OTP sessions, private encrypted S3 documents/photos, producer registration,
advanced profile, product CRUD, administration review/moderation/categories/locations/
reports. No fictional production records. Product photo re-encoding strips EXIF.

- Production build and TypeScript passed.
- Latest full unit/integration suite: 37/37, no skips, isolated `jdatna_test_20261108`.
- Browser suite:18/18 desktop/mobile Chromium. Photos/hours/forms have additional
  mocked API UI checks; real SMS not configured or tested.
- Final reviewer found media URLs rejected by UI; fixed with a restricted internal
  media URL helper and failing-then-passing rendered image regression.
- Final reviewer found target limiter DB growth; fixed global limits first and added
  bounded expiry cleanup. Advanced profile UI gap also fixed and browser-tested.
- Prettier formatting applied; screenshot artifacts remain ignored under artifacts/.

## Server state — latest verified

- Encrypted Coolify metadata backup under `/var/backups/coolify-management`.
- Temporary team API token under `/etc/coolify-management/api-token`; must revoke
  when finished and restore API settings from `settings-before.json` in that folder.
  API temporarily enabled with local-only IP allowlist. Original API was disabled.
- Coolify projects: Jdatna `syfhtbuirhgcsxznkvx3jsxo`, Aykdmh
  `krplfrejyaryktomklbmyqhr`.
- Live Jdatna Service `bt4gbo9l0tq64cchxtms3ai4`, publicly routed on jdatna.com.
  Its compose preserves external `jdatna_database` and `jdatna_storage`, non-root,
  512MiB/1CPU and private gateway port172.18.0.1:8092.
- Docker image `jdatna-application:phase1` built on server from a source archive.
  Build log `/opt/jdatna/audit/build-phase1.log`; source `/opt/jdatna/releases/phase1`.
- Production jdatna-only migrations001..005 applied after backup. No users/families/
  products seeded. Real canonical categories/cities only.
- New private SeaweedFS4.52 object storage image pinned by digest; standalone
  `jdatna-storage.service`, no published ports, TLS8334, internal network,512MiB/.5CPU,
  files within `/srv/jdatna/data/object-storage`. Real signed TLS S3 upload/read,
  app-level encryption/decryption, anonymous403 and removal all passed.
- Storage config/secrets/TLS under `/etc/jdatna/storage` only. Runtime env under
  `/etc/jdatna/runtime.env`; PRIVATE_STORAGE_VERIFIED true after the real probe;
  SMS_VERIFIED false, registration closed. Application/migration passwords rotated;
  local integration credentials moved outside OneDrive into restricted private files.
- Initial storage probe500 was traced to volume-growth defaults and missing SSE KEK.
  Configured one-volume growth and a separate server-side KEK, then verified the
  actual protocol. Never remove those settings or enable anonymous identities.
- Backup script includes frozen object storage, runtime configuration and existing
  site/uploads/database/roles in encrypted archive. Last run before final SSE config
  passed. Latest post-storage backup and infrastructure restore verification passed.

## Additional completed operations

- Production health200, registration closed; public homepage and browse/login200.
- Auth cleanup bundled into image and scheduled every15 minutes; real run removed0
  expired rows, timer active. No valid records removed.
- Aykdmh frontend Service `0oo2kes5tlkjobgrc2ercloe` is running and publicly routed.
  Its original API/DB/LiveKit containers/image IDs/start times stayed unchanged.
  Homepage/version bodies identical before/after; API200, LiveKit validate401 and
  privacy-path404 checks passed. Shared TLS/TURN ingress reloaded without restart.
- Aykdmh encrypted DB/config backup restored in isolated temporary PostgreSQL,
  72 public tables. Working files separately encrypted/backed up and hash-checked.
- Aykdmh checkout FF-updated to authoritative2d5c105 without deploying that source;
  live build remains e91dc41. Existing local Caddy and untracked e2e files preserved.
  Hosting operation AYK-201 noted in its handoff/tasks/decisions so another agent
  does not run the legacy deployment script over the shared ingress.
- Updated Jdatna verification accepts only the exact approved ingress hash and
  separately verifies the original preserved configuration snapshot.

## Release closeout

Published code commit: 1eb03d1e032ccc1740cb1c9a37d45eec739c072e.
Image and checks: docs/RELEASE.json. Public HTTPS health reports the matching
full commit; www redirects to apex. All isolation/backup restore checks passed
again after deployment. Temporary Coolify token revoked and API restored disabled.
Aykdmh final isolated checks passed:55 server,152 client,238 integration;482s,
including both absolute/basename legacy-deploy guard tests. Hosting source commit
a2a6cfe is saved on server. Neither repository was pushed automatically.
See docs/COOLIFY.md for ownership boundaries and future-deploy caution.

Remaining external dependency: real SMS provider and authorized test destination.
Off-server backups also still need an approved destination. Android/iOS and platform
orders remain later phases per original requirements.
