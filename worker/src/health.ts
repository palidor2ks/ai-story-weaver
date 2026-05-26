import http from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { pool } from "./db.js";

export function startHealthServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      try {
        await pool.query("SELECT 1");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", worker_id: config.WORKER_ID }));
      } catch (err) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "db_unreachable", error: String(err) }));
      }
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "health server listening");
  });

  return server;
}
