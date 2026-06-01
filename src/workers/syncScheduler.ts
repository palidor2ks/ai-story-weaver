/**
 * Sync Scheduler
 * 
 * Manages cron scheduling and execution of the data sync agent.
 * Runs daily at a configurable time.
 */

import DataSyncAgent from './dataSyncAgent';

interface ScheduleConfig {
  enabled: boolean;
  cronExpression: string; // e.g., "0 2 * * *" for 2 AM daily
  timezone: string; // e.g., "America/New_York"
  maxDurationHours: number;
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
}

class SyncScheduler {
  private agent: DataSyncAgent;
  private config: ScheduleConfig;
  private lastRunTime: Date | null = null;
  private nextRunTime: Date | null = null;
  private isScheduled = false;

  constructor(
    agent: DataSyncAgent,
    config: Partial<ScheduleConfig> = {}
  ) {
    this.agent = agent;
    this.config = {
      enabled: config.enabled ?? true,
      cronExpression: config.cronExpression ?? '0 2 * * *', // 2 AM daily
      timezone: config.timezone ?? 'UTC',
      maxDurationHours: config.maxDurationHours ?? 23,
      notifyOnCompletion: config.notifyOnCompletion ?? true,
      notifyOnError: config.notifyOnError ?? true,
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isScheduled) {
      console.warn('Scheduler already started');
      return;
    }

    if (!this.config.enabled) {
      console.log('Sync scheduler is disabled');
      return;
    }

    console.log('🕐 Starting sync scheduler');
    console.log(`   Cron: ${this.config.cronExpression}`);
    console.log(`   Timezone: ${this.config.timezone}`);

    // Calculate next run time
    this.calculateNextRunTime();

    // Set up interval to check if we should run
    setInterval(() => this.checkAndRun(), 60000); // Check every minute

    this.isScheduled = true;
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isScheduled = false;
    console.log('🛑 Sync scheduler stopped');
  }

  /**
   * Check if it's time to run and execute if needed
   */
  private async checkAndRun(): Promise<void> {
    if (!this.isScheduled || !this.nextRunTime) return;

    const now = new Date();

    // Check if we've passed the scheduled time
    if (now >= this.nextRunTime && !this.agent.isActive()) {
      console.log('⏰ Scheduled sync time reached, starting sync');
      await this.executeSync();
      this.calculateNextRunTime();
    }
  }

  /**
   * Execute the sync
   */
  private async executeSync(): Promise<void> {
    this.lastRunTime = new Date();

    try {
      console.log('🔄 Executing scheduled sync');
      await this.agent.runFullSync();
      console.log('✅ Scheduled sync completed successfully');

      if (this.config.notifyOnCompletion) {
        await this.notifyCompletion('success');
      }
    } catch (error) {
      console.error('❌ Scheduled sync failed:', error);

      if (this.config.notifyOnError) {
        await this.notifyCompletion('error', error);
      }
    }
  }

  /**
   * Calculate next run time based on cron expression
   */
  private calculateNextRunTime(): void {
    // Simple cron parser for common patterns
    // Format: "minute hour day month dayOfWeek"
    const parts = this.config.cronExpression.split(' ');

    if (parts.length !== 5) {
      console.error('Invalid cron expression:', this.config.cronExpression);
      return;
    }

    const [minute, hour, day, month, dayOfWeek] = parts;

    const now = new Date();
    let next = new Date(now);

    // Parse hour and minute
    const targetHour = parseInt(hour, 10);
    const targetMinute = parseInt(minute, 10);

    // Set to target time
    next.setHours(targetHour, targetMinute, 0, 0);

    // If that time has already passed today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    this.nextRunTime = next;

    const timeUntil = Math.round((next.getTime() - now.getTime()) / 1000 / 60);
    console.log(`📅 Next sync scheduled for ${next.toISOString()} (in ${timeUntil} minutes)`);
  }

  /**
   * Send notification about sync completion
   */
  private async notifyCompletion(status: 'success' | 'error', error?: any): Promise<void> {
    try {
      const message = {
        status,
        timestamp: new Date().toISOString(),
        lastRunTime: this.lastRunTime?.toISOString(),
        nextRunTime: this.nextRunTime?.toISOString(),
        error: error ? String(error) : undefined,
      };

      // Log to console (in production, send to monitoring service)
      console.log('📬 Sync notification:', message);

      // TODO: Integrate with your notification service
      // - Send email
      // - Send Slack message
      // - Log to monitoring dashboard
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isScheduled: this.isScheduled,
      isRunning: this.agent.isActive(),
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextRunTime,
      config: this.config,
    };
  }

  /**
   * Manually trigger a sync (useful for testing)
   */
  async triggerManualSync(): Promise<void> {
    if (this.agent.isActive()) {
      console.warn('Sync already in progress');
      return;
    }

    console.log('🚀 Manually triggering sync');
    await this.executeSync();
  }
}

export default SyncScheduler;

