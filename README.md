# أكلات وغذاء الأجداد — jdatna.com

Repository: `alaoufi/aser`.

Arabic RTL producer marketplace built with Next.js, TypeScript and PostgreSQL.
The public catalogue is live at https://jdatna.com and its application runs in Coolify.
Producer/admin interfaces, moderation, private documents/photos and OTP adapters
are implemented. **Production phone registration remains closed until real SMS is
configured and tested.** No fictional producers or products are published.
Platform orders and Android/iOS applications remain later phases.

## Development and checks

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Without DATABASE_URL, public browsing uses canonical category/city metadata and
empty listing states. Configured database failures are surfaced, not hidden as
empty data. Integration tests require an explicitly enabled `jdatna_test_` database;
see scripts/README.md. Keep real environment files outside synced workspaces and Git.

- [Current handoff](docs/PROJECT_HANDOFF.md)
- [Remaining tasks](docs/TASKS.md)
- [Infrastructure decisions](docs/DECISIONS.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Current implementation and release details](docs/IMPLEMENTATION_PROGRESS.md)
- [Coolify ownership and rollback](docs/COOLIFY.md)

No credentials, database contents or backups belong in Git. Infrastructure scripts
are specific to the authorized server; `infra/provision.py` refuses existing storage
and must not be rerun as an upgrade mechanism.
