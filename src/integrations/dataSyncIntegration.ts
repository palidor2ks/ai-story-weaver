/**
 * Data Sync Integration
 * 
 * Initializes and manages the data sync agent and scheduler.
 * This is the main entry point for the sync system.
 */

import DataSyncAgent from '@/workers/dataSyncAgent';
import SyncScheduler from '@/workers/syncScheduler';

let agent: DataSyncAgent | null = null;
let scheduler: SyncScheduler | null = null;

/**
 * Initialize the data sync system
 */
export function initializeDataSync(): void {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials for data sync');
    return;
  }

  // Create agent
  agent = new DataSyncAgent(supabaseUrl, supabaseKey);

  // Create scheduler with config from environment
  const scheduleConfig = {
    enabled: process.env.VITE_DATA_SYNC_ENABLED !== 'false',
    cronExpression: process.env.VITE_DATA_SYNC_CRON || '0 2 * * *', // 2 AM daily
    timezone: process.env.VITE_DATA_SYNC_TIMEZONE || 'UTC',
    maxDurationHours: parseInt(process.env.VITE_DATA_SYNC_MAX_HOURS || '23', 10),
    notifyOnCompletion: process.env.VITE_DATA_SYNC_NOTIFY_COMPLETION !== 'false',
    notifyOnError: process.env.VITE_DATA_SYNC_NOTIFY_ERROR !== 'false',
  };

  scheduler = new SyncScheduler(agent, scheduleConfig);

  // Start scheduler
  scheduler.start();

  console.log('✅ Data sync system initialized');
}

/**
 * Get the data sync agent
 */
export function getDataSyncAgent(): DataSyncAgent | null {
  return agent;
}

/**
 * Get the sync scheduler
 */
export function getSyncScheduler(): SyncScheduler | null {
  return scheduler;
}

/**
 * Manually trigger a sync (for testing or admin endpoints)
 */
export async function triggerManualSync(): Promise<void> {
  if (!agent) {
    throw new Error('Data sync not initialized');
  }

  if (agent.isActive()) {
    throw new Error('Sync already in progress');
  }

  await agent.runFullSync();
}

/**
 * Get sync status
 */
export function getSyncStatus() {
  return {
    agent: agent?.getStatus() || null,
    scheduler: scheduler?.getStatus() || null,
  };
}

/**
 * Shutdown the sync system
 */
export function shutdownDataSync(): void {
  if (scheduler) {
    scheduler.stop();
  }
  agent = null;
  scheduler = null;
  console.log('Data sync system shut down');
}

