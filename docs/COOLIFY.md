# Coolify — Jdatna runtime and safe operations

This repository and session are for «أكلات جدتنا» (jdatna.com) only. Every site on the
server is fully independent (owner decision 2026-11-16): its own code, containers,
folders, Docker networks and backups. Jdatna never reads, checks or changes another
site. Public HTTPS and routing belong to the neutral server gateway, repository
`alaoufi/server-edge` (`sites/jdatna.com.caddy` is the only Jdatna line there).

| Resource              | Owner                                    | Runtime                                  | Data                            |
| --------------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------- |
| Jdatna application    | Coolify Service bt4gbo9l0tq64cchxtms3ai4 | Node, one internal port 8092             | Jdatna DB/S3 only               |
| Jdatna PostgreSQL     | jdatna-stack.service                     | jdatna-db, 1GiB/1CPU                     | /srv/jdatna/data/postgres       |
| Jdatna object storage | jdatna-storage.service                   | SeaweedFS 4.52, 512MiB/.5CPU             | /srv/jdatna/data/object-storage |

Coolify project: Jdatna syfhtbuirhgcsxznkvx3jsxo. The control plane stays bound to
localhost:8000; connect privately with
`ssh -N -L 18000:127.0.0.1:8000 root@84.247.166.216`, then open http://127.0.0.1:18000.
Never send its password or server/API credentials in chat. The separation plan may
move the application out of Coolify into Jdatna's own compose; until then Coolify only
hosts the Jdatna service listed above.

## Internal port

The application publishes exactly one internal port, 8092, for the gateway. It must
never bind a public interface. Target (separation stage 3): `127.0.0.1:8092`, reached by
the gateway over host networking. During the transition the old binding
`172.18.0.1:8092` is still accepted by `infra/verify.py`.

## Important operating boundaries

Services use prebuilt local image versions, not automatic Git deployments. Build
and test a new Jdatna image, back up, update its image tag in Coolify Source Compose,
then deploy and verify. Never use Pull Latest on local-only images; pull_policy is
never. Keep the database and storage outside application resource teardown/cleanup.

## Rollback

Jdatna holding page remains in /srv/jdatna/data/site (`jdatna-page.service`, internal
port 8091). Application rollback: restore the previous image tag in Coolify; the previous
image is kept by the `jdatna-guard-<sha>` container (see `infra/deploy/README.md`).
Routing rollback is the gateway's own procedure in `alaoufi/server-edge`.

## Jdatna private storage and maintenance

SeaweedFS is Apache2.0 licensed. Version 4.52 was checked against its official
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
following database dump and archived objects keep referenced media. Backup cleanup
always unfreezes storage, including error exits. The backup includes runtime
configuration and encryption material, but its own backup passphrase must be held
separately. Off-server copies remain pending.

jdatna-maintenance.timer runs bounded expired-only authentication cleanup every 15
minutes in exactly one application container selected by the jdatna.role label.
Limits are 1000 rows per table/invocation, verified in scratch tests.
