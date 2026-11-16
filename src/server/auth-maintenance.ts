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
    // سجل الأمان: يُحتفظ به 90 يومًا.
    const events = await client.query(
      `WITH old AS (SELECT id FROM jdatna.security_events WHERE created_at<now()-interval '90 days' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM jdatna.security_events s USING old o WHERE s.id=o.id`,
      [batchSize],
    );
    // سجل «زائر اليوم» للمشاهدات: يكفي يومان (العدّادات نفسها باقية).
    await client.query(
      `WITH old AS (SELECT kind,target_id,visitor,day FROM jdatna.view_seen WHERE day<(now() AT TIME ZONE 'Asia/Riyadh')::date-2 LIMIT $1 FOR UPDATE SKIP LOCKED)
       DELETE FROM jdatna.view_seen s USING old o WHERE s.kind=o.kind AND s.target_id=o.target_id AND s.visitor=o.visitor AND s.day=o.day`,
      [batchSize],
    );
    return {
      securityEvents: events.rowCount ?? 0,
      rateLimits: limits.rowCount ?? 0,
      otpChallenges: challenges.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
    };
  });
}
