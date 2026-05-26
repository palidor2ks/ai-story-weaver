import { z } from "zod";

const Schema = z.object({
  WORKER_DB_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  WORKER_ID: z.string().default(`worker-${Math.random().toString(36).slice(2, 8)}`),
  WORKER_JOB_TYPES: z.string().default("rep_answers_generate"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  CLAIM_BATCH_SIZE: z.coerce.number().int().positive().max(20).default(1),
  LOCK_SECONDS: z.coerce.number().int().positive().default(600),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PERPLEXITY_API_KEY: z.string().optional(),
  LOVABLE_API_KEY: z.string().optional(),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(2_000_000),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  NODE_ENV: z.string().default("development"),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid worker config:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  jobTypes: parsed.data.WORKER_JOB_TYPES.split(",").map((s) => s.trim()).filter(Boolean),
};

export type WorkerConfig = typeof config;
