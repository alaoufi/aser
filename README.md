# أكلات وغذاء الأجداد — jdatna.com

Repository: `alaoufi/aser`.

The initial deliverable is an isolated infrastructure foundation on the existing
Contabo server. The website, API, registration, administration interfaces and mobile
apps have **not** been implemented or published.

- [Current handoff](docs/PROJECT_HANDOFF.md)
- [Remaining tasks](docs/TASKS.md)
- [Infrastructure decisions](docs/DECISIONS.md)
- [Operations and recovery](docs/OPERATIONS.md)

No credentials, database contents or backups belong in Git. Infrastructure scripts
are specific to the authorized server; `infra/provision.py` refuses existing storage
and must not be rerun as an upgrade mechanism.
