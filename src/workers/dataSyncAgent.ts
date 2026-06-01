/**
 * Data Sync Agent
 * 
 * Automatically discovers and syncs all tables in Supabase with their external data sources.
 * - Respects API rate limits
 * - Handles long-running operations with checkpointing
 * - Logs progress and errors
 * - Runs daily via cron
 */

import { createClient } from '@supabase/supabase-js';

interface SyncConfig {
  table: string;
  source: 'fec' | 'congress' | 'civic' | 'manual' | 'unknown';
  apiEndpoint?: string;
  rateLimit?: {
    requestsPerSecond: number;
    requestsPerDay: number;
  };
  lastSyncKey?: string; // Column to track last sync
  primaryKey: string;
  syncStrategy: 'insert' | 'upsert' | 'full_replace' | 'incremental';
}

interface SyncJob {
  id: string;
  table: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startedAt: Date;
  completedAt?: Date;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsDeleted: number;
  error?: string;
  nextCheckpoint?: any;
}

interface RateLimitTracker {
  table: string;
  requestsToday: number;
  requestsThisSecond: number;
  lastRequestTime: number;
  dailyResetTime: Date;
}

class DataSyncAgent {
  private supabase: ReturnType<typeof createClient>;
  private syncConfigs: Map<string, SyncConfig> = new Map();
  private rateLimiters: Map<string, RateLimitTracker> = new Map();
  private currentJob: SyncJob | null = null;
  private isRunning = false;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.initializeSyncConfigs();
  }

  /**
   * Initialize sync configurations for known tables
   */
  private initializeSyncConfigs() {
    // FEC.gov data sources
    this.syncConfigs.set('candidates', {
      table: 'candidates',
      source: 'fec',
      apiEndpoint: 'https://api.open.fec.gov/v1/candidates',
      rateLimit: { requestsPerSecond: 10, requestsPerDay: 120000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    });

    this.syncConfigs.set('candidate_committees', {
      table: 'candidate_committees',
      source: 'fec',
      apiEndpoint: 'https://api.open.fec.gov/v1/committees',
      rateLimit: { requestsPerSecond: 10, requestsPerDay: 120000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    });

    this.syncConfigs.set('contributions', {
      table: 'contributions',
      source: 'fec',
      apiEndpoint: 'https://api.open.fec.gov/v1/schedules/schedule_a',
      rateLimit: { requestsPerSecond: 5, requestsPerDay: 50000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'incremental',
    });

    this.syncConfigs.set('donors', {
      table: 'donors',
      source: 'fec',
      apiEndpoint: 'https://api.open.fec.gov/v1/schedules/schedule_a',
      rateLimit: { requestsPerSecond: 5, requestsPerDay: 50000 },
      lastSyncKey: 'last_receipt_date',
      primaryKey: 'id',
      syncStrategy: 'incremental',
    });

    this.syncConfigs.set('bills', {
      table: 'bills',
      source: 'congress',
      apiEndpoint: 'https://api.congress.gov/v3/bill',
      rateLimit: { requestsPerSecond: 1, requestsPerDay: 10000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    });

    this.syncConfigs.set('bill_sponsors', {
      table: 'bill_sponsors',
      source: 'congress',
      apiEndpoint: 'https://api.congress.gov/v3/bill',
      rateLimit: { requestsPerSecond: 1, requestsPerDay: 10000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    });

    this.syncConfigs.set('votes', {
      table: 'votes',
      source: 'congress',
      apiEndpoint: 'https://api.congress.gov/v3/vote',
      rateLimit: { requestsPerSecond: 1, requestsPerDay: 10000 },
      lastSyncKey: 'date',
      primaryKey: 'id',
      syncStrategy: 'incremental',
    });

    this.syncConfigs.set('static_officials', {
      table: 'static_officials',
      source: 'civic',
      apiEndpoint: 'https://www.googleapis.com/civicinfo/v2/representatives',
      rateLimit: { requestsPerSecond: 10, requestsPerDay: 25000 },
      lastSyncKey: 'last_updated',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    });
  }

  /**
   * Main entry point: run full sync cycle
   */
  async runFullSync(): Promise<void> {
    if (this.isRunning) {
      console.warn('Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Starting full data sync cycle');
      
      // Discover all tables
      const tables = await this.discoverTables();
      console.log(`📊 Discovered ${tables.length} tables`);

      // Process each table
      for (const table of tables) {
        if (this.shouldSkipTable(table)) continue;

        const config = this.syncConfigs.get(table) || this.createDefaultConfig(table);
        await this.syncTable(config);

        // Check if we should pause due to time/resource constraints
        if (this.shouldPause(startTime)) {
          console.log('⏸️  Pausing sync due to time/resource constraints');
          break;
        }
      }

      console.log('✅ Full sync cycle completed');
    } catch (error) {
      console.error('❌ Sync cycle failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Discover all tables in the database
   */
  private async discoverTables(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (error) throw error;
      return (data || []).map((row: any) => row.table_name);
    } catch (error) {
      console.error('Failed to discover tables:', error);
      // Fallback to known tables
      return Array.from(this.syncConfigs.keys());
    }
  }

  /**
   * Sync a single table
   */
  private async syncTable(config: SyncConfig): Promise<void> {
    const job: SyncJob = {
      id: `${config.table}-${Date.now()}`,
      table: config.table,
      status: 'running',
      startedAt: new Date(),
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
    };

    this.currentJob = job;

    try {
      console.log(`\n📥 Syncing table: ${config.table}`);
      console.log(`   Source: ${config.source}`);
      console.log(`   Strategy: ${config.syncStrategy}`);

      // Get last sync time
      const lastSync = await this.getLastSyncTime(config.table);
      console.log(`   Last sync: ${lastSync || 'Never'}`);

      // Fetch data from source
      const sourceData = await this.fetchFromSource(config, lastSync);
      console.log(`   Fetched ${sourceData.length} records from source`);

      // Apply sync strategy
      switch (config.syncStrategy) {
        case 'upsert':
          await this.upsertRecords(config, sourceData, job);
          break;
        case 'incremental':
          await this.incrementalSync(config, sourceData, job);
          break;
        case 'insert':
          await this.insertNewRecords(config, sourceData, job);
          break;
        case 'full_replace':
          await this.fullReplace(config, sourceData, job);
          break;
      }

      // Update sync timestamp
      await this.updateSyncTime(config.table);

      job.status = 'completed';
      job.completedAt = new Date();

      console.log(`   ✅ Completed: +${job.recordsInserted} inserted, +${job.recordsUpdated} updated, -${job.recordsDeleted} deleted`);
    } catch (error) {
      job.status = 'failed';
      job.error = String(error);
      console.error(`   ❌ Failed: ${error}`);
    } finally {
      this.currentJob = null;
    }
  }

  /**
   * Fetch data from external source
   */
  private async fetchFromSource(config: SyncConfig, lastSync: Date | null): Promise<any[]> {
    if (!config.apiEndpoint) {
      console.warn(`   ⚠️  No API endpoint configured for ${config.table}`);
      return [];
    }

    const results: any[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        // Respect rate limits
        await this.respectRateLimit(config);

        // Build query parameters
        const params = new URLSearchParams({
          per_page: String(pageSize),
          page: String(page),
          api_key: process.env.FEC_API_KEY || '',
        });

        // Add date filter if available
        if (lastSync && config.lastSyncKey) {
          params.append('min_date', lastSync.toISOString().split('T')[0]);
        }

        const url = `${config.apiEndpoint}?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited, wait and retry
            console.warn(`   ⚠️  Rate limited, waiting 60s before retry`);
            await this.sleep(60000);
            continue;
          }
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const records = data.results || data.data || [];

        if (records.length === 0) {
          hasMore = false;
        } else {
          results.push(...records);
          page++;

          // Safety: don't fetch more than 10k records per table per sync
          if (results.length >= 10000) {
            console.warn(`   ⚠️  Reached 10k record limit for ${config.table}`);
            hasMore = false;
          }
        }
      } catch (error) {
        console.error(`   ❌ Fetch error on page ${page}:`, error);
        hasMore = false;
      }
    }

    return results;
  }

  /**
   * Upsert records into table
   */
  private async upsertRecords(config: SyncConfig, records: any[], job: SyncJob): Promise<void> {
    if (records.length === 0) return;

    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        const { error } = await this.supabase
          .from(config.table)
          .upsert(batch, { onConflict: config.primaryKey });

        if (error) throw error;

        job.recordsProcessed += batch.length;
        job.recordsUpdated += batch.length;

        console.log(`   ✓ Upserted ${job.recordsProcessed}/${records.length} records`);
      } catch (error) {
        console.error(`   ❌ Upsert batch failed:`, error);
        throw error;
      }
    }
  }

  /**
   * Incremental sync: only insert new records
   */
  private async incrementalSync(config: SyncConfig, records: any[], job: SyncJob): Promise<void> {
    if (records.length === 0) return;

    // Get existing IDs
    const { data: existing } = await this.supabase
      .from(config.table)
      .select(config.primaryKey);

    const existingIds = new Set((existing || []).map((r: any) => r[config.primaryKey]));

    // Filter to new records only
    const newRecords = records.filter(
      (r) => !existingIds.has(r[config.primaryKey])
    );

    if (newRecords.length === 0) {
      console.log(`   ℹ️  No new records to insert`);
      return;
    }

    const batchSize = 100;
    for (let i = 0; i < newRecords.length; i += batchSize) {
      const batch = newRecords.slice(i, i + batchSize);

      try {
        const { error } = await this.supabase
          .from(config.table)
          .insert(batch);

        if (error) throw error;

        job.recordsProcessed += batch.length;
        job.recordsInserted += batch.length;

        console.log(`   ✓ Inserted ${job.recordsInserted}/${newRecords.length} new records`);
      } catch (error) {
        console.error(`   ❌ Insert batch failed:`, error);
        throw error;
      }
    }
  }

  /**
   * Insert only new records
   */
  private async insertNewRecords(config: SyncConfig, records: any[], job: SyncJob): Promise<void> {
    await this.incrementalSync(config, records, job);
  }

  /**
   * Full replace: delete all and re-insert
   */
  private async fullReplace(config: SyncConfig, records: any[], job: SyncJob): Promise<void> {
    try {
      // Delete all existing
      const { count: deleted } = await this.supabase
        .from(config.table)
        .delete()
        .neq(config.primaryKey, '');

      job.recordsDeleted = deleted || 0;

      // Insert new
      await this.insertNewRecords(config, records, job);
    } catch (error) {
      console.error(`   ❌ Full replace failed:`, error);
      throw error;
    }
  }

  /**
   * Respect API rate limits
   */
  private async respectRateLimit(config: SyncConfig): Promise<void> {
    if (!config.rateLimit) return;

    let tracker = this.rateLimiters.get(config.table);
    if (!tracker) {
      tracker = {
        table: config.table,
        requestsToday: 0,
        requestsThisSecond: 0,
        lastRequestTime: 0,
        dailyResetTime: new Date(),
      };
      this.rateLimiters.set(config.table, tracker);
    }

    // Check daily limit
    if (tracker.requestsToday >= config.rateLimit.requestsPerDay) {
      throw new Error(
        `Daily rate limit exceeded for ${config.table} (${config.rateLimit.requestsPerDay}/day)`
      );
    }

    // Check per-second limit
    const now = Date.now();
    const timeSinceLastRequest = now - tracker.lastRequestTime;

    if (timeSinceLastRequest < 1000) {
      if (tracker.requestsThisSecond >= config.rateLimit.requestsPerSecond) {
        const waitTime = 1000 - timeSinceLastRequest;
        await this.sleep(waitTime);
      }
    } else {
      tracker.requestsThisSecond = 0;
    }

    tracker.requestsThisSecond++;
    tracker.requestsToday++;
    tracker.lastRequestTime = now;
  }

  /**
   * Get last sync time for a table
   */
  private async getLastSyncTime(table: string): Promise<Date | null> {
    try {
      const { data } = await this.supabase
        .from('sync_status')
        .select('last_sync_at')
        .eq('table_name', table)
        .single();

      return data?.last_sync_at ? new Date(data.last_sync_at) : null;
    } catch {
      return null;
    }
  }

  /**
   * Update sync timestamp
   */
  private async updateSyncTime(table: string): Promise<void> {
    try {
      await this.supabase
        .from('sync_status')
        .upsert(
          {
            table_name: table,
            last_sync_at: new Date().toISOString(),
          },
          { onConflict: 'table_name' }
        );
    } catch (error) {
      console.warn(`Failed to update sync time for ${table}:`, error);
    }
  }

  /**
   * Check if table should be skipped
   */
  private shouldSkipTable(table: string): boolean {
    const skipTables = [
      'information_schema',
      'pg_',
      'sync_status',
      'user_',
      'auth',
      'profiles',
      'quiz_',
      'badge_',
    ];
    return skipTables.some((skip) => table.startsWith(skip));
  }

  /**
   * Check if sync should pause
   */
  private shouldPause(startTime: number): boolean {
    const elapsed = Date.now() - startTime;
    const maxDuration = 23 * 60 * 60 * 1000; // 23 hours
    return elapsed > maxDuration;
  }

  /**
   * Create default config for unknown table
   */
  private createDefaultConfig(table: string): SyncConfig {
    return {
      table,
      source: 'unknown',
      primaryKey: 'id',
      syncStrategy: 'upsert',
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current job status
   */
  getStatus(): SyncJob | null {
    return this.currentJob;
  }

  /**
   * Check if sync is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export default DataSyncAgent;

