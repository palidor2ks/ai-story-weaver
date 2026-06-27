import type { Task } from "graphile-worker";

/**
 * Self-heal for jammed cron jobs.
 *
 * graphile-worker's crontab does NOT honour the `?jobKey` option (that's an `add_job`
 * feature), so each scheduled entry is a plain job with a null key and no singleton
 * guard. When a scheduled job exhausts its retries — e.g. during a transient outage like
 * a credential rotation that 401s every call — it parks at `attempts = max_attempts` and
 * is never run again. The crontab keeps "firing" (`known_crontabs.last_execution`
 * advances) but produces no runnable work, so the pipeline stalls silently with no error
 * surfaced. This is exactly what stalled `drain_research_queue` for ~5 days after the
 * 2026-06-22 Railway cutover (rep answers stopped being generated entirely).
 *
 * Each run this task:
 *   1. collapses duplicate maxed-out rows per scheduled task (keeps the newest), and
 *   2. grants the survivor exactly ONE fresh attempt.
 *
 * One attempt — not a full `attempts = 0` reset — so a transient failure recovers on the
 * next cycle, while a genuinely-broken endpoint isn't hammered with a fresh 25-retry burst
 * every cycle (it re-maxes after a single try and waits for the next heal). `last_error`
 * is left intact so the underlying failure stays visible.
 *
 * Pure SQL over DATABASE_URL — no edge call — so it can't be taken out by the same auth
 * failures it recovers from.
 */

// Only heal jobs that have been maxed-out for at least this long, so we don't race with
// graphile-worker's own retry/backoff on a job that just failed.
const MIN_STUCK = process.env.STUCK_HEAL_MIN_AGE ?? "50 minutes";

const task: Task = async (_payload, helpers) => {
  await helpers.withPgClient(async (pg) => {
    // 1. de-dupe: keep the newest maxed-out row per scheduled task, drop the rest.
    const pruned = await pg.query(
      `with ranked as (
         select p.id,
                row_number() over (partition by p.task_id order by p.run_at desc) as rn
         from graphile_worker._private_jobs p
         join graphile_worker._private_tasks t on t.id = p.task_id
         join graphile_worker._private_known_crontabs kc on kc.identifier = t.identifier
         where p.attempts >= p.max_attempts and p.locked_at is null
       )
       delete from graphile_worker._private_jobs p
       using ranked r
       where p.id = r.id and r.rn > 1`,
    );

    // 2. grant the surviving maxed-out cron jobs exactly one fresh attempt.
    const revived = await pg.query(
      `update graphile_worker._private_jobs p
       set attempts = greatest(0, p.max_attempts - 1),
           run_at = now(),
           updated_at = now()
       from graphile_worker._private_tasks t
       join graphile_worker._private_known_crontabs kc on kc.identifier = t.identifier
       where p.task_id = t.id
         and p.attempts >= p.max_attempts
         and p.locked_at is null
         and p.run_at < now() - ($1)::interval
       returning t.identifier`,
      [MIN_STUCK],
    );

    const names: string[] = revived.rows.map((r: { identifier: string }) => r.identifier);
    if (names.length || pruned.rowCount) {
      helpers.logger.warn(
        `reset_stuck_cron_jobs: revived ${names.length} stuck cron job(s) [${names.join(", ")}], pruned ${pruned.rowCount ?? 0} duplicate(s)`,
      );
    } else {
      helpers.logger.info("reset_stuck_cron_jobs: nothing stuck");
    }
  });
};

export default task;
