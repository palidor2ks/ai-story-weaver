# Data Sync Worker - Complete Summary

## What You Got

A **production-ready background worker service** that syncs your Supabase database with external APIs 24/7.

### Files Created

**Worker Service** (14 files in `/worker`):
- `src/index.ts` - Main entry point with cron scheduling
- `src/lib/dataSyncAgent.ts` - Core sync engine
- `src/lib/config.ts` - Configuration management
- `src/lib/logger.ts` - Structured logging
- `src/lib/adapters/` - API adapters (FEC, Congress, Civic)
- `Dockerfile` - Container setup
- `railway.json` - Railway config
- `package.json` - Dependencies
- `README.md` - Worker documentation

**Documentation** (4 files):
- `QUICK_START.md` - 10-minute setup guide
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment
- `TESTING_GUIDE.md` - Comprehensive testing
- `DATA_SYNC_GUIDE.md` - Full system documentation

**Database** (1 file):
- `supabase/migrations/20260601_sync_status_table.sql` - Tracking tables

## Key Features

✅ **Runs 24/7 on Railway**
- Separate Node.js service
- Cron-based scheduling
- Graceful shutdown handling

✅ **Respects API Rate Limits**
- FEC.gov: 10 req/s, 120k/day
- Congress.gov: 1 req/s, 10k/day
- Google Civic: 10 req/s, 25k/day

✅ **Smart Sync Strategies**
- Upsert (insert new, update existing)
- Incremental (only insert new)
- Full replace (delete all, re-insert)

✅ **Production-Ready**
- Health check endpoint
- Structured logging (Pino)
- Automatic restart on failure
- Comprehensive error handling
- Sync history tracking

## How It Works

1. **Worker starts** → Validates config → Starts health check server
2. **Cron scheduler** → Waits for scheduled time (default: 2 AM daily)
3. **Sync runs** → For each table:
   - Gets last sync time from `sync_status`
   - Fetches new/updated data from API
   - Applies sync strategy
   - Updates `sync_status` with results
   - Logs to `sync_history`
4. **Repeats** → Next day at 2 AM

## Data Sources

### FEC.gov (Federal Election Commission)
- Candidates
- Candidate committees
- Contributions
- Donors

### Congress.gov
- Bills
- Bill sponsors
- Votes

### Google Civic API
- Federal officials
- State officials
- Local officials

## Deployment

### Quick Start (10 minutes)
1. Get 3 API keys (FEC, Congress, Google Civic)
2. Create new Railway service pointing to `/worker`
3. Set environment variables
4. Deploy and watch logs

See `QUICK_START.md` for detailed steps.

### Full Deployment
See `DEPLOYMENT_CHECKLIST.md` for:
- API key setup instructions
- Environment variable configuration
- Verification steps
- Troubleshooting

## Testing

### Option 1: Automatic (Recommended)
Set `RUN_ON_STARTUP=true` and watch logs as sync runs immediately.

### Option 2: Manual Trigger
```bash
curl -X POST https://your-worker.railway.app/sync
```

### Option 3: Local Testing
```bash
cd worker
npm install
npm run dev
```

See `TESTING_GUIDE.md` for comprehensive testing procedures.

## Monitoring

### Health Check
```bash
curl https://your-worker.railway.app/health
# {"status":"ok","timestamp":"..."}
```

### Sync History
```sql
SELECT * FROM sync_history 
ORDER BY sync_started_at DESC 
LIMIT 10;
```

### Sync Status
```sql
SELECT * FROM sync_status;
```

## Configuration

All configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_CRON` | `0 2 * * *` | Cron schedule |
| `SYNC_TIMEZONE` | `UTC` | Timezone |
| `SYNC_MAX_HOURS` | `23` | Max sync duration |
| `RUN_ON_STARTUP` | `false` | Run immediately on start |
| `LOG_LEVEL` | `info` | Logging level |

## Cron Examples

- `0 2 * * *` - Daily at 2 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday
- `*/5 * * * *` - Every 5 minutes (testing)

## Architecture

```
┌─────────────────────────────────────┐
│   Railway Worker Service            │
│  (Runs 24/7 independently)          │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  Cron Scheduler             │    │
│  │  (node-cron)                │    │
│  └──────────────┬──────────────┘    │
│                 │                    │
│  ┌──────────────▼──────────────┐    │
│  │  Data Sync Agent            │    │
│  │  - Discovers tables         │    │
│  │  - Fetches from APIs        │    │
│  │  - Applies sync strategies  │    │
│  │  - Logs results             │    │
│  └──────────────┬──────────────┘    │
│                 │                    │
│  ┌──────────────▼──────────────┐    │
│  │  API Adapters               │    │
│  │  - FEC.gov                  │    │
│  │  - Congress.gov             │    │
│  │  - Google Civic             │    │
│  └──────────────┬──────────────┘    │
│                 │                    │
└─────────────────┼────────────────────┘
                  │
        ┌─────────▼─────────┐
        │   Supabase        │
        │  ┌─────────────┐  │
        │  │ candidates  │  │
        │  │ bills       │  │
        │  │ officials   │  │
        │  │ sync_status │  │
        │  │ sync_history│  │
        │  └─────────────┘  │
        └───────────────────┘
```

## Files to Review

1. **Start here**: `QUICK_START.md` - 10-minute setup
2. **Then**: `DEPLOYMENT_CHECKLIST.md` - Detailed deployment
3. **For testing**: `TESTING_GUIDE.md` - Comprehensive testing
4. **For details**: `DATA_SYNC_GUIDE.md` - Full system guide
5. **Worker docs**: `worker/README.md` - Worker-specific info

## Next Steps

1. ✅ Review `QUICK_START.md`
2. ✅ Get API keys (FEC, Congress, Google Civic)
3. ✅ Create new Railway service for worker
4. ✅ Set environment variables
5. ✅ Deploy and test
6. ✅ Verify data in Supabase
7. ✅ Set `RUN_ON_STARTUP=false` for production
8. ✅ Monitor logs regularly

## Success Criteria

✅ Worker deploys successfully
✅ Health check returns 200
✅ Logs show sync running
✅ `sync_history` table populated
✅ `sync_status` table updated
✅ Data appears in tables
✅ No errors in logs
✅ Cron schedule works

## Support

For issues:
1. Check logs: Railway dashboard → Logs tab
2. Check database: Supabase → `sync_history` and `sync_status` tables
3. Test health: `curl /health`
4. Test manual sync: `curl -X POST /sync`
5. Review relevant guide (QUICK_START, DEPLOYMENT_CHECKLIST, TESTING_GUIDE)

## PR Information

**Branch**: `sandbox/86ad4096-d14b-45bb-9a9d--piqv`
**URL**: https://github.com/palidor2ks/ai-story-weaver/pull/new/sandbox/86ad4096-d14b-45bb-9a9d--piqv

**Commits**:
1. Add automated data sync agent for external APIs
2. Add background data sync worker service
3. Add manual sync trigger endpoint for testing
4. Add comprehensive testing guide
5. Add deployment checklist with API key setup
6. Add quick start guide for worker deployment

## Questions?

Refer to the appropriate guide:
- **"How do I set this up?"** → `QUICK_START.md`
- **"What are the exact steps?"** → `DEPLOYMENT_CHECKLIST.md`
- **"How do I test it?"** → `TESTING_GUIDE.md`
- **"How does it work?"** → `DATA_SYNC_GUIDE.md`
- **"Worker-specific info?"** → `worker/README.md`

