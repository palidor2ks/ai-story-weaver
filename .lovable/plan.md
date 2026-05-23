The previous background loop (PID 2291) is no longer running. I'll restart it and let it run unattended.

### Steps
1. Check current unassigned committee count in `committee_pool_mv`.
2. Write `/tmp/loop.sh`: loop up to 40 iterations, each POSTing to `classify-committee-topic` with `{"limit": 100}`, sleeping 90s between batches, logging progress to `/tmp/loop.log`. Exit early when unassigned count hits 0 or stops decreasing for 2 iterations.
3. Launch with `nohup ... &` so it survives. Confirm PID is alive.
4. Return immediately — do not block monitoring.
5. On a follow-up message from you, I'll tail `/tmp/loop.log` and query final tallies (assigned/unassigned counts, any new `pending` causes).

No app code, UI, migration, or edge function changes.