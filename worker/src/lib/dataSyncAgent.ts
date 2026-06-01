/**
 * Data Sync Agent
 * 
 * Core sync engine that discovers tables and syncs with external APIs
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from 'pino';
import { WorkerConfig } from './config';
import { FecSyncAdapter } from './adapters/fecAdapter';
import { CongressSyncAdapter } from './adapters/congressAdapter';
import { CivicSyncAdapter } from './adapters/civicAdapter';

interface SyncConfig {
  table: string;
  adapter: SyncAdapter;
  strategy: 'upsert' | 'incremental' | 'full_replace';
  primaryKey: string;
  batchSize: number;
}

interface SyncAdapter {
  fetchData(lastSync: Date | null): Promise<any[]>;
  transformRecord(record: any): any;
}

interface SyncResult {
  table: string;
  inserted: number;
  updated: number;
  deleted: number;
  duration: number;
  error?: string;
}

export class DataSyncAgent {
  private supabase: SupabaseClient;
  private config: WorkerConfig;
  private logger: Logger;
  private syncConfigs: Map<string, SyncConfig> = new Map();
  private isRunning = false;

  constructor(supabase: SupabaseClient, config: WorkerConfig, logger: Logger) {
    this.supabase = supabase;
    this.config = config;
    this.logger = logger;
    this.initializeSyncConfigs();
  }

  /**
   * Initialize sync configurations for each table
   */
  private initializeSyncConfigs(): void {
    const fecAdapter = new FecSyncAdapter(this.config.fecApiKey, this.logger);
    const congressAdapter = new CongressSyncAdapter(this.config.congressApiKey, this.logger);
    const civicAdapter = new CivicSyncAdapter(this.config.googleCivicApiKey, this.logger);

    // FEC data sources
    this.syncConfigs.set('candidates', {
      table: 'candidates',
      adapter: fecAdapter,
      strategy: 'upsert',
      primaryKey: 'id',
      batchSize: 100,
    });

    this.syncConfigs.set('candidate_committees', {
      table: 'candidate_committees',
      adapter: fecAdapter,
      strategy: 'upsert',
      primaryKey: 'id',
      batchSize: 100,
    });

    this.syncConfigs.set('contributions', {
      table: 'contributions',
      adapter: fecAdapter,
      strategy: 'incremental',
      primaryKey: 'id',
      batchSize: 100,
    });

    this.syncConfigs.set('donors', {
      table: 'donors',
      adapter: fecAdapter,
      strategy: 'incremental',
      primaryKey: 'id',
      batchSize: 100,
    });

    // Congress data sources
    this.syncConfigs.set('bills', {
      table: 'bills',
      adapter: congressAdapter,
      strategy: 'upsert',
      primaryKey: 'id',
      batchSize: 50,
    });

    this.syncConfigs.set('bill_sponsors', {
      table: 'bill_sponsors',
      adapter: congressAdapter,
      strategy: 'upsert',
      primaryKey: 'id',
      batchSize: 50,
    });

    this.syncConfigs.set('votes', {
      table: 'votes',
      adapter: congressAdapter,
      strategy: 'incremental',
      primaryKey: 'id',
      batchSize: 50,
    });

    // Civic data sources
    this.syncConfigs.set('static_officials', {
      table: 'static_officials',
      adapter: civicAdapter,
      strategy: 'upsert',
      primaryKey: 'id',
      batchSize: 100,
    });
  }

  /**
   * Run full sync cycle
   */
  async runFullSync(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      this.logger.info('Starting full sync cycle');

      for (const [tableName, syncConfig] of this.syncConfigs) {
        if (this.shouldPause(startTime)) {
          this.logger.warn(`Pausing sync due to time constraints (${this.config.maxDurationHours}h limit)`);
          break;
        }

        try {
          const result = await this.syncTable(syncConfig);
          results.push(result);
        } catch (error) {
          this.logger.error({ error, table: tableName }, `Failed to sync table: ${tableName}`);
          results.push({
            table: tableName,
            inserted: 0,
            updated: 0,
            deleted: 0,
            duration: 0,
            error: String(error),
          });
        }
      }

      // Log summary
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
      const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
      const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

      this.logger.info(
        {
          duration: totalDuration,
          inserted: totalInserted,
          updated: totalUpdated,
          deleted: totalDeleted,
          tables: results.length,
        },
        '✅ Sync cycle completed'
      );

      // Save sync history
      await this.saveSyncHistory(results, totalDuration);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single table
   */
  private async syncTable(config: SyncConfig): Promise<SyncResult> {
    const startTime = Date.now();
    this.logger.info(`Syncing table: ${config.table}`);

    try {
      // Get last sync time
      const lastSync = await this.getLastSyncTime(config.table);

      // Fetch data from source
      const sourceData = await config.adapter.fetchData(lastSync);
      this.logger.debug({ table: config.table, count: sourceData.length }, 'Fetched records from source');

      if (sourceData.length === 0) {
        this.logger.info(`No new data for ${config.table}`);
        return {
          table: config.table,
          inserted: 0,
          updated: 0,
          deleted: 0,
          duration: Math.round((Date.now() - startTime) / 1000),
        };
      }

      // Transform records
      const transformedData = sourceData.map((record) => config.adapter.transformRecord(record));

      // Apply sync strategy
      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      switch (config.strategy) {
        case 'upsert':
          ({ inserted, updated } = await this.upsertRecords(config, transformedData));
          break;
        case 'incremental':
          inserted = await this.insertNewRecords(config, transformedData);
          break;
        case 'full_replace':
          deleted = await this.fullReplace(config, transformedData);
          inserted = transformedData.length;
          break;
      }

      // Update sync time
      await this.updateSyncTime(config.table);

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.info(
        { table: config.table, inserted, updated, deleted, duration },
        `✓ Synced ${config.table}`
      );

      return { table: config.table, inserted, updated, deleted, duration };
    } catch (error) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      throw error;
    }
  }

  /**
   * Upsert records
   */
  private async upsertRecords(
    config: SyncConfig,
    records: any[]
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i += config.batchSize) {
      const batch = records.slice(i, i + config.batchSize);

      const { error, data } = await this.supabase
        .from(config.table)
        .upsert(batch, { onConflict: config.primaryKey })
        .select();

      if (error) throw error;

      // Rough estimate: assume all are updates if table had data
      updated += batch.length;
    }

    return { inserted, updated };
  }

  /**
   * Insert only new records
   */
  private async insertNewRecords(config: SyncConfig, records: any[]): Promise<number> {
    // Get existing IDs
    const { data: existing } = await this.supabase
      .from(config.table)
      .select(config.primaryKey);

    const existingIds = new Set((existing || []).map((r: any) => r[config.primaryKey]));

    // Filter to new records
    const newRecords = records.filter((r) => !existingIds.has(r[config.primaryKey]));

    if (newRecords.length === 0) return 0;

    let inserted = 0;
    for (let i = 0; i < newRecords.length; i += config.batchSize) {
      const batch = newRecords.slice(i, i + config.batchSize);

      const { error } = await this.supabase.from(config.table).insert(batch);

      if (error) throw error;
      inserted += batch.length;
    }

    return inserted;
  }

  /**
   * Full replace: delete all and re-insert
   */
  private async fullReplace(config: SyncConfig, records: any[]): Promise<number> {
    // Delete all
    const { error: deleteError } = await this.supabase
      .from(config.table)
      .delete()
      .neq(config.primaryKey, '');

    if (deleteError) throw deleteError;

    // Insert new
    let inserted = 0;
    for (let i = 0; i < records.length; i += config.batchSize) {
      const batch = records.slice(i, i + config.batchSize);

      const { error } = await this.supabase.from(config.table).insert(batch);

      if (error) throw error;
      inserted += batch.length;
    }

    return inserted;
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
   * Update sync time
   */
  private async updateSyncTime(table: string): Promise<void> {
    await this.supabase
      .from('sync_status')
      .upsert(
        {
          table_name: table,
          last_sync_at: new Date().toISOString(),
          status: 'completed',
        },
        { onConflict: 'table_name' }
      );
  }

  /**
   * Save sync history
   */
  private async saveSyncHistory(results: SyncResult[], totalDuration: number): Promise<void> {
    const histories = results.map((result) => ({
      table_name: result.table,
      sync_started_at: new Date(Date.now() - totalDuration * 1000).toISOString(),
      sync_completed_at: new Date().toISOString(),
      duration_seconds: result.duration,
      records_processed: result.inserted + result.updated + result.deleted,
      records_inserted: result.inserted,
      records_updated: result.updated,
      records_deleted: result.deleted,
      status: result.error ? 'failed' : 'completed',
      error_message: result.error || null,
    }));

    const { error } = await this.supabase.from('sync_history').insert(histories);

    if (error) {
      this.logger.error({ error }, 'Failed to save sync history');
    }
  }

  /**
   * Check if sync should pause
   */
  private shouldPause(startTime: number): boolean {
    const elapsed = Date.now() - startTime;
    const maxMs = this.config.maxDurationHours * 60 * 60 * 1000;
    return elapsed > maxMs;
  }
}

