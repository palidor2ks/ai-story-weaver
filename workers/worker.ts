/**
 * Railway worker entry point.
 *
 * Starts a graphile-worker runner connected to Supabase Postgres (direct
 * connection, not the pooler — graphile-worker requires LISTEN/NOTIFY).
 *
 * On first run, graphile-worker auto-migrates its own schema (`graphile_worker`)
 * into the database. No manual migration needed.
 *
 * Required env vars:
 *   DATABASE_URL              — direct Postgres URL (db.[ref].supabase.co:5432)
 *   SUPABASE_URL              — project URL (used by call-edge)
 *   SUPABASE_SERVICE_ROLE_KEY — service key (used by call-edge as auth)
 *
 * Optional:
 *   WORKER_CONCURRENCY        — parallel job slots (default: 5)
 */

import { run } from "graphile-worker";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (direct Postgres connection, not pooler)");
  process.exit(1);
}

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? "5");

console.log(`[worker] starting — concurrency=${concurrency}`);

const runner = await run({
  connectionString: DATABASE_URL,
  concurrency,
  noHandleSignals: false,
  pollInterval: 2000,
  taskDirectory: join(__dirname, "tasks"),
  crontabFile: join(__dirname, "crontab"),
});

// runner.promise resolves when the runner stops (SIGTERM / SIGINT).
await runner.promise;

console.log("[worker] stopped");
