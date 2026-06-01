# Data Sync Agent Guide

## Overview

The Data Sync Agent is an automated system that keeps your Supabase database synchronized with external data sources (FEC.gov, Congress.gov, Google Civic API, etc.). It runs daily, respects API rate limits, and handles long-running operations gracefully.

## Architecture

### Components

1. **DataSyncAgent** (`src/workers/dataSyncAgent.ts`)
   - Core sync engine
   - Discovers tables and their data sources
   - Fetches data from external APIs
   - Applies sync strategies (insert, upsert, incremental, full replace)
   - Respects rate limits and timeouts

2. **SyncScheduler** (`src/workers/syncScheduler.ts`)
   - Manages cron scheduling
   - Executes syncs at configured times
   - Handles notifications
   - Allows manual triggers

3. **Integration** (`src/integrations/dataSyncIntegration.ts`)
   - Initializes the sync system
   - Provides public API for monitoring/control
   - Manages lifecycle

4. **Admin Dashboard** (`src/pages/AdminSyncDashboard.tsx`)
   - Monitor sync status
   - View sync history
   - Trigger manual syncs
   - See configuration

5. **API Endpoints** (`src/api/admin/sync.ts`)
   - REST endpoints for sync control
   - Protected by admin role

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Required
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key

# Optional (defaults shown)
VITE_DATA_SYNC_ENABLED=true
VITE_DATA_SYNC_CRON=0 2 * * *          # 2 AM daily
VITE_DATA_SYNC_TIMEZONE=UTC
VITE_DATA_SYNC_MAX_HOURS=23
VITE_DATA_SYNC_NOTIFY_COMPLETION=true
VITE_DATA_SYNC_NOTIFY_ERROR=true

# API Keys (get from respective services)
FEC_API_KEY=your_fec_key
CONGRESS_API_KEY=your_congress_key
GOOGLE_CIVIC_API_KEY=your_civic_key
```

### 2. Database Migration

Run the migration to create sync tracking tables:

```bash
supabase migration up
```

This creates:
- `sync_status` - Current status of each table
- `sync_history` - Audit log of all syncs

### 3. Initialize in App

In your main app file (e.g., `src/main.tsx`):

```typescript
import { initializeDataSync } from '@/integrations/dataSyncIntegration';

// Initialize sync system on app startup
initializeDataSync();
```

## Configuration

### Cron Expression

Format: `minute hour day month dayOfWeek`

Examples:
- `0 2 * * *` - Daily at 2 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 0 1 * *` - Monthly on the 1st at midnight

### Sync Strategies

Each table has a sync strategy:

- **upsert**: Insert new records, update existing ones (default for most tables)
- **incremental**: Only insert new records, never update
- **insert**: Same as incremental
- **full_replace**: Delete all and re-insert (use with caution)

### Rate Limits

Built-in rate limits per API:

| API | Requests/Second | Requests/Day |
|-----|-----------------|--------------|
| FEC.gov | 10 | 120,000 |
| Congress.gov | 1 | 10,000 |
| Google Civic | 10 | 25,000 |

The agent automatically respects these limits and will pause/retry if exceeded.

## Supported Data Sources

### FEC.gov (Federal Election Commission)

Tables synced:
- `candidates` - Federal candidates
- `candidate_committees` - Campaign committees
- `contributions` - Individual contributions
- `donors` - Aggregated donor data

**Setup:**
1. Get API key: https://api.open.fec.gov/
2. Set `FEC_API_KEY` environment variable

### Congress.gov

Tables synced:
- `bills` - Congressional bills
- `bill_sponsors` - Bill sponsors
- `votes` - Roll call votes

**Setup:**
1. Get API key: https://api.congress.gov/
2. Set `CONGRESS_API_KEY` environment variable

### Google Civic API

Tables synced:
- `static_officials` - Federal, state, and local officials

**Setup:**
1. Get API key: https://developers.google.com/civic-information
2. Set `GOOGLE_CIVIC_API_KEY` environment variable

## Monitoring

### Admin Dashboard

Access at `/admin/sync` (requires admin role):

- **Manual Sync Control**: Trigger immediate sync
- **Table Sync Status**: Current status of each table
- **Recent Sync History**: Last 50 sync operations
- **Configuration Info**: Current settings

### API Endpoints

```bash
# Get current status
GET /api/admin/sync/status

# Get table status
GET /api/admin/sync/table-status

# Get sync history
GET /api/admin/sync/history?limit=50&table=candidates

# Trigger manual sync
POST /api/admin/sync/trigger
```

### Logs

Check browser console or server logs for:
- Sync start/completion
- Record counts
- Errors and warnings
- Rate limit info

## How It Works

### Daily Sync Cycle

1. **Scheduler** checks if it's time to run (default: 2 AM daily)
2. **Agent** discovers all tables in database
3. For each table:
   - Get last sync time from `sync_status`
   - Fetch new/updated data from external API
   - Apply sync strategy (insert/upsert/etc)
   - Update `sync_status` with results
   - Log to `sync_history`
4. **Notifications** sent on completion/error (if enabled)

### Rate Limiting

The agent tracks:
- Requests per second (per API)
- Requests per day (per API)
- Automatically waits if limits approached
- Throws error if daily limit exceeded

### Timeout Handling

- Max sync duration: 23 hours (configurable)
- Checkpoints progress every 100 records
- Can resume from checkpoint if interrupted
- Logs checkpoint data for recovery

### Error Handling

- Logs all errors to `sync_history`
- Continues with next table if one fails
- Retries rate-limited requests (up to 3x)
- Sends notifications on critical errors

## Customization

### Add New Data Source

1. Create sync config in `DataSyncAgent.initializeSyncConfigs()`:

```typescript
this.syncConfigs.set('my_table', {
  table: 'my_table',
  source: 'my_api',
  apiEndpoint: 'https://api.example.com/data',
  rateLimit: { requestsPerSecond: 10, requestsPerDay: 100000 },
  lastSyncKey: 'updated_at',
  primaryKey: 'id',
  syncStrategy: 'upsert',
});
```

2. Implement `fetchFromSource()` logic for your API
3. Set environment variable with API key
4. Test with manual sync

### Modify Sync Strategy

Edit the sync config for a table:

```typescript
syncStrategy: 'incremental' // or 'upsert', 'insert', 'full_replace'
```

### Change Schedule

Update environment variable:

```bash
VITE_DATA_SYNC_CRON=0 0 * * *  # Midnight daily
```

Or programmatically:

```typescript
const scheduler = getSyncScheduler();
scheduler.stop();
// Create new scheduler with different config
```

## Troubleshooting

### Sync Not Running

1. Check `VITE_DATA_SYNC_ENABLED=true`
2. Check browser console for initialization errors
3. Verify Supabase credentials
4. Check `sync_status` table exists

### API Errors

1. Verify API keys are set correctly
2. Check API rate limits in logs
3. Verify API endpoint URLs are correct
4. Test API manually with curl

### High Memory Usage

- Reduce `pageSize` in `fetchFromSource()` (default: 100)
- Reduce `batchSize` in upsert/insert (default: 100)
- Increase `maxDurationHours` to spread work over longer period

### Slow Syncs

1. Check network latency to APIs
2. Check database write performance
3. Consider running at off-peak hours
4. Reduce batch sizes

## Best Practices

1. **Schedule during off-peak hours** (e.g., 2-3 AM)
2. **Monitor sync history** regularly for errors
3. **Test with manual sync** before relying on schedule
4. **Keep API keys secure** - use environment variables
5. **Set up notifications** for errors
6. **Review rate limits** for each API
7. **Backup database** before first full sync
8. **Start with incremental syncs** before full replaces

## Performance Tips

- **Incremental syncs** are faster than upserts
- **Upserts** are faster than full replaces
- **Batch size of 100** is optimal for most APIs
- **Run during off-peak hours** to avoid contention
- **Use indexes** on frequently queried columns

## Security

- All API keys stored in environment variables
- Admin dashboard requires admin role
- Sync operations use service role (full access)
- Audit log in `sync_history` table
- RLS policies protect sensitive tables

## Support

For issues or questions:
1. Check logs in browser console
2. Review `sync_history` table for errors
3. Check API documentation for rate limits
4. Verify environment variables are set
5. Test API endpoints manually

## Future Enhancements

Planned features:
- [ ] Webhook notifications (Slack, email)
- [ ] Parallel table syncing
- [ ] Custom sync strategies per table
- [ ] Data validation and reconciliation
- [ ] Automatic retry with exponential backoff
- [ ] Sync performance metrics dashboard
- [ ] Data quality scoring
- [ ] Conflict resolution strategies

