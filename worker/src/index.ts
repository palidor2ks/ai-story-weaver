import { logger } from "./logger.js";
import { runPoller, stopPoller } from "./poller.js";
import { startHealthServer } from "./health.js";
import { shutdownDb } from "./db.js";

const server = startHealthServer();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  stopPoller();
  await new Promise<void>((r) => server.close(() => r()));
  await shutdownDb();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
});

runPoller().catch((err) => {
  logger.fatal({ err }, "poller crashed");
  process.exit(1);
});
