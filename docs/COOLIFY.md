# Coolify — ownership and safe operations

The owner authorized organizing both public sites in Coolify. That instruction
supersedes the old Aykdmh documentation saying to leave Coolify unused. It does not
authorize replacing Aykdmh application code or migrating its customer database.

| Resource                | Owner                                    | Runtime                                        | Data                               |
| ----------------------- | ---------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| Jdatna application      | Coolify Service bt4gbo9l0tq64cchxtms3ai4 | Node, private gateway8092                      | Existing jdatna DB/S3 only         |
| Jdatna PostgreSQL       | jdatna-stack.service                     | jdatna-db,1GiB/1CPU                            | /srv/jdatna/data/postgres          |
| Jdatna object storage   | jdatna-storage.service                   | SeaweedFS4.52,512MiB/.5CPU                     | /srv/jdatna/data/object-storage    |
| Aykdmh frontend         | Coolify Service 0oo2kes5tlkjobgrc2ercloe | Exact existing Caddy image,private gateway8093 | Existing published files read-only |
| Aykdmh API/DB/LiveKit   | Original Docker stack                    | Original images/containers unchanged           | Original volumes unchanged         |
| Shared TLS/TURN ingress | Existing aykdmh-web                      | Original container,graceful config reload      | Existing certificates/config       |

Coolify projects: Jdatna syfhtbuirhgcsxznkvx3jsxo; Aykdmh krplfrejyaryktomklbmyqhr.
Control plane stays bound to localhost:8000. No new public admin port was opened.
Connect privately with `ssh -N -L 18000:127.0.0.1:8000 aykdmh`, then open
http://127.0.0.1:18000 and use the existing Coolify account. Never send its password
or server/API credentials in chat.

## Important operating boundaries

Services use prebuilt local image versions, not automatic Git deployments. Build
and test a new Jdatna image, back up, update its image tag in Coolify Source Compose,
then deploy and verify. Never use Pull Latest on local-only images; pull_policy is
never. Service definitions and read-only mounts were checked before deployment.
Keep the database and storage outside application resource teardown/cleanup.

The Aykdmh frontend derives its routing from the actual running configuration,
not the newer unpublished Git branch. It forwards the trusted resolved client IP
as one X-Forwarded-For value and preserves HTTPS for its existing one-hop backend.
Source checkout was fast-forwarded from e91dc41 to authoritative2d5c105 after an
encrypted working-file backup and proof of disjoint changes. All existing modified
and untracked files remained byte-identical. That source was built only in isolated
checks; no replacement production API/client release was deployed. Public build
remained e91dc41. Do not confuse frontend hosting with migration of its API/database
or claim a speed improvement without measurements. Browser/HTTP checks do not prove
physical-phone call quality.

Future Aykdmh releases must preserve this split: its site routes now live in
`/etc/aykdmh/coolify-site/Caddyfile`, and the original shared Caddyfile is an ingress
for both sites plus TURN. The legacy deployment script may replace that ingress;
review/merge a new release procedure before using that script again. The canonical
site configuration is now also recorded in its deploy/caddy/aykdmh-site.Caddyfile;
its cache/CSP/privacy checks read that file, and the legacy setup script fails closed
under Coolify before any mutation. No automatic legacy deploy was enabled.

## Rollback

Jdatna holding page remains in /srv/jdatna/data/site. Start jdatna-page.service if
needed and restore only its upstream to private gateway8091 after validation.
Its pre-platform ingress snapshot is in /opt/jdatna/audit/.

Aykdmh rollback config:
`/etc/aykdmh/coolify-site/original-ingress.caddy`. This snapshot already contains
the working Jdatna8092 upstream. Restore it to the shared Caddyfile, validate it in
aykdmh-web, and gracefully reload Caddy. Never stop the original ingress, database
or LiveKit as part of frontend rollback. Do not delete files/volumes.

Encrypted pre-adoption backup:
`/var/backups/aykdmh-coolify/before-routing-1794091999876824357.tar.gpg`.
Its database was restored in an isolated temporary container with72 public tables.
It includes config/environment; original published assets were not modified or
copied. Their complete disaster-recovery backup remains the existing site's duty.

## Jdatna private storage and maintenance

SeaweedFS is Apache2.0 licensed. Version4.52 was checked against its official
[release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.52) and
[S3 documentation](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API).
Only its TLS S3 listener is reachable on the dedicated internal network. Filer,
master and volume listeners bind loopback. Runtime credentials are restricted to
the Jdatna bucket; bootstrap administrator credentials are never mounted into the app.
SSE KEK and app-level AES256-GCM key are distinct. Certificates/keys/config stay
under /etc/jdatna/storage and /etc/jdatna/runtime.env with restricted permissions.
Internal TLS certificate renewal is required before its one-year expiry; restart
storage and the application after a coordinated renewal of the trusted certificate.

Private object storage is briefly frozen during the daily encrypted backup so the
following database dump and archived objects keep referenced media. Uploads can
pause or fail during that window; download/register journeys need retesting after
SMS activation. Backup cleanup always unfreezes storage, including error exits.
The backup includes runtime configuration and encryption material, but its own
backup passphrase must be held separately. Off-server copies remain pending.

jdatna-maintenance.timer runs bounded expired-only authentication cleanup every15
minutes. It executes the bundled cleanup-auth.cjs in exactly one application
container selected by the jdatna.role label. A database cleanup never touches
Aykdmh tables. Limits are1000 rows per table/invocation, verified in scratch tests.

## Verified closeout — 2026-11-08

Published Jdatna code:1eb03d1e032ccc1740cb1c9a37d45eec739c072e.
Aykdmh hosting-source commit:a2a6cfe (server checkout only). No source pushes
performed. Temporary API token revoked; original is_api_enabled=false and
allowed_ips=null restored. Existing account unchanged; private UI login200.
