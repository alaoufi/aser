import { Pool, type PoolClient } from "pg";
let pool: Pool | undefined;
export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database not configured");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  }));
}
export async function transaction<T>(
  action: (client: PoolClient) => Promise<T>,
) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
