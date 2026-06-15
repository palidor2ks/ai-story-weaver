// Helpers for interpreting donor_import_sessions status in the admin history view.
//
// Donor imports are browser-driven: the terminal status ('completed' /
// 'completed_with_errors') is written only by the browser at the end of the batch
// loop. If the tab is closed, navigated away, or the network drops, the row is
// orphaned at status='running' forever. The edge function stamps `last_progress_at`
// on every processed batch, so a 'running' row whose last progress is old is really
// stalled, not active.

// How long without progress before a 'running' import is treated as stalled.
// Batches are 500 rows with a ~150ms delay plus retries, so even large batches finish
// in seconds; 10 minutes of silence means the browser loop died.
export const STALE_IMPORT_MS = 10 * 60 * 1000;

/**
 * True when a session claims to be 'running' but hasn't made progress recently,
 * meaning the browser-driven loop was almost certainly abandoned.
 *
 * `lastProgressAt` falls back to `startedAt` for sessions imported before the
 * heartbeat column existed.
 */
export function isStalledImport(
  status: string,
  lastProgressAt: string | null,
  startedAt: string,
  now: number = Date.now(),
): boolean {
  if (status !== 'running') return false;
  const last = new Date(lastProgressAt ?? startedAt).getTime();
  if (Number.isNaN(last)) return false;
  return now - last > STALE_IMPORT_MS;
}
