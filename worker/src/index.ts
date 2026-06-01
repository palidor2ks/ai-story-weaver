/**
 * AI Story Weaver - Data Sync Worker
 * 
 * Background service that runs 24/7 to keep Supabase database
 * synchronized with external data sources (FEC.gov, Congress.gov, etc.)
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { logger } from './lib/logger';
import { DataSyncAgent } from './lib/dataSyncAgent';
import { validateEnvironment } from './lib/config';

// Validate environment on startup
const config = validateEnvironment();

// Initialize Supabase client
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// Initialize sync agent
const syncAgent = new DataSyncAgent(supabase, config, logger);

/**
 * Main sync job
 */
async function runSync(): Promise<void> {
  const startTime = Date.now();
  logger.info('🚀 Starting scheduled data sync');

  try {
    await syncAgent.runFullSync();
    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.info(`✅ Sync completed in ${duration}s`);
  } catch (error) {
    logger.error({ error }, '❌ Sync failed');
    // Continue running - don't crash the worker
  }
}

/**
 * Health check endpoint (for Railway)
 */
async function startHealthCheckServer(): Promise<void> {
  const http = await import('http');
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, () => {
    logger.info(`🏥 Health check server listening on port ${port}`);
  });
}

/**
 * Start the worker
 */
async function start(): Promise<void> {
  logger.info('🎯 Initializing Data Sync Worker');
  logger.info(`   Supabase URL: ${config.supabaseUrl}`);
  logger.info(`   Sync Schedule: ${config.syncCron}`);
  logger.info(`   Max Duration: ${config.maxDurationHours}h`);

  // Start health check server
  await startHealthCheckServer();

  // Schedule sync job
  const job = cron.schedule(config.syncCron, runSync, {
    timezone: config.timezone,
  });

  logger.info('✅ Worker started successfully');
  logger.info(`📅 Next sync: ${job.nextDate().toString()}`);

  // Run sync immediately on startup (optional - comment out to wait for schedule)
  if (config.runOnStartup) {
    logger.info('⚡ Running sync on startup');
    await runSync();
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('🛑 SIGTERM received, shutting down gracefully');
    job.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('🛑 SIGINT received, shutting down gracefully');
    job.stop();
    process.exit(0);
  });
}

// Start the worker
start().catch((error) => {
  logger.error({ error }, '💥 Fatal error during startup');
  process.exit(1);
});

