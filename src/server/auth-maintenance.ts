import { transaction } from "./db";
/** One bounded batch per table; unexpired authentication records are never removed. */
export async function cleanupAuthRows(batchSize = 1000) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error("Cleanup batch must be an integer from 1 to 1000");
  return transaction(async (client) => {
    const limits = await client.query(
      `WITH expired AS (SELECT key FROM jdatna.rate_limits WHERE reset_at<=now() ORDER BY reset_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM jdatna.rate_limits r USING expired e WHERE r.key=e.key AND r.reset_at<=now()`,
      [batchSize],
    );
    const challenges = await client.query(
      `WITH expired AS (SELECT id FROM jdatna.otp_challenges WHERE expires_at<=now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM jdatna.otp_challenges c USING expired e WHERE c.id=e.id AND c.expires_at<=now()`,
      [batchSize],
    );
    const sessions = await client.query(
      `WITH expired AS (SELECT token_hash FROM jdatna.sessions WHERE expires_at<=now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM jdatna.sessions s USING expired e WHERE s.token_hash=e.token_hash AND s.expires_at<=now()`,
      [batchSize],
    );
    return {
      rateLimits: limits.rowCount ?? 0,
      otpChallenges: challenges.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
    };
  });
}
