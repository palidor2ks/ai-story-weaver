/**
 * Configuration management
 */

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  fecApiKey: string;
  congressApiKey: string;
  googleCivicApiKey: string;
  syncCron: string;
  timezone: string;
  maxDurationHours: number;
  runOnStartup: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function validateEnvironment(): WorkerConfig {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    fecApiKey: process.env.FEC_API_KEY || '',
    congressApiKey: process.env.CONGRESS_API_KEY || '',
    googleCivicApiKey: process.env.GOOGLE_CIVIC_API_KEY || '',
    syncCron: process.env.SYNC_CRON || '0 2 * * *', // 2 AM daily
    timezone: process.env.SYNC_TIMEZONE || 'UTC',
    maxDurationHours: parseInt(process.env.SYNC_MAX_HOURS || '23', 10),
    runOnStartup: process.env.RUN_ON_STARTUP === 'true',
    logLevel: (process.env.LOG_LEVEL || 'info') as any,
  };
}

