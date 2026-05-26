import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.WORKER_DB_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  // Supabase pooler requires SSL; do not verify (managed cert chain)
  ssl: { rejectUnauthorized: false },
  application_name: `polipulse-worker/${config.WORKER_ID}`,
});

pool.on("error", (err) => {
  logger.error({ err }, "pg pool error");
});

export async function shutdownDb(): Promise<void> {
  try {
    await pool.end();
  } catch (err) {
    logger.warn({ err }, "error closing pg pool");
  }
}
