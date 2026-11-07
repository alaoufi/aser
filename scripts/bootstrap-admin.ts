import { db, transaction } from "../src/server/db";
import { randomUUID } from "node:crypto";
async function main() {
  const id = process.argv[2];
  if (!id || !/^[a-f0-9-]{36}$/i.test(id))
    throw new Error(
      "Usage: tsx scripts/bootstrap-admin.ts <verified-user-uuid>",
    );
  await transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.admin.bootstrap'))",
    );
    const user = (
      await client.query(
        "SELECT id FROM jdatna.users WHERE id=$1 AND phone_verified_at IS NOT NULL FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!user) throw new Error("Verified user not found");
    const admin = (
      await client.query(
        "SELECT id FROM jdatna.users WHERE role='admin' LIMIT 1",
      )
    ).rows[0];
    if (admin)
      throw new Error(
        "An administrator already exists; use a controlled role-management process",
      );
    await client.query("UPDATE jdatna.users SET role='admin' WHERE id=$1", [
      id,
    ]);
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$2)",
      [randomUUID(), id, "admin.bootstrap"],
    );
  });
  console.log("Administrator granted to the specified verified user.");
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db().end();
  });
