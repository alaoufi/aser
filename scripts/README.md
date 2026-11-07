# Authentication maintenance

`cleanup-auth.ts` removes expired session, OTP challenge and rate-limit records only.
Each invocation removes at most 1000 rows from each table (3000 total), in one
transaction. An optional integer argument from 1 through 1000 lowers that cap.
It preserves unexpired and currently locked records, and prints counts without secrets.
It neither contacts SMS/storage providers nor changes users, profiles or documents.
Use the restricted jdatna runtime database role, with DELETE on these three tables.

Manual invocation from the application directory:

```sh
node --env-file=/run/secrets/jdatna-runtime.env --import tsx scripts/cleanup-auth.ts 1000
```

Cron-ready example; an operator must adapt and explicitly install it on the host:

```cron
*/5 * * * * cd /opt/jdatna && /usr/bin/node --env-file=/run/secrets/jdatna-runtime.env --import tsx scripts/cleanup-auth.ts 1000 >> /var/log/jdatna-auth-maintenance.log 2>&1
```

No schedule is installed automatically. Protect the env file and rotate the count-only
log. Monitor failed runs and expiry backlog; change the approved schedule if a single
batch every five minutes is insufficient. For container deployments, invoke inside the
application container or equivalent scheduled worker using that same runtime identity;
do not add a second application or database service solely for maintenance.
