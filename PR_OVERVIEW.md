# Data Sync Worker - PR Overview

## What's Included

This PR adds a **complete background data sync system** that keeps your Supabase database synchronized with external APIs (FEC.gov, Congress.gov, Google Civic) 24/7.

## PR Details

**Branch**: `sandbox/86ad4096-d14b-45bb-9a9d--piqv`
**Base**: `main`
**Status**: Ready to merge

## What Changed

### New Files (20 total)

**Worker Service** (`/worker` directory):
```
worker/
├── src/
│   ├── index.ts                    # Main entry point
│   └── lib/
│       ├── dataSyncAgent.ts        # Core sync engine
│       ├── config.ts               # Configuration
│       ├── logger.ts               # Logging setup
│       └── adapters/
│           ├── fecAdapter.ts       # FEC.gov API
│           ├── congressAdapter.ts  # Congress.gov API
│           └── civicAdapter.ts     # Google Civic API
├── Dockerfile                      # Container setup
├── railway.json                    # Railway config
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── .dockerignore                   # Docker ignore
├── .env.example                    # Environment template
└── README.md                       # Worker documentation
```

**Documentation**:
```
├── QUICK_START.md                  # 10-minute setup guide
├── DEPLOYMENT_CHECKLIST.md         # Step-by-step deployment
├── TESTING_GUIDE.md                # Comprehensive testing
├── WORKER_SUMMARY.md               # Complete summary
├── DATA_SYNC_GUIDE.md              # Full system guide
└── PR_OVERVIEW.md                  # This file
```

**Database**:
```
supabase/migrations/
└── 20260601_sync_status_table.sql  # Tracking tables
```

## Key Features

✅ **24/7 Operation**
- Runs independently on Railway
- Cron-based scheduling (default: 2 AM daily)
- Graceful shutdown handling

✅ **API Rate Limiting**
- FEC.gov: 10 req/s, 120k/day
- Congress.gov: 1 req/s, 10k/day
- Google Civic: 10 req/s, 25k/day
- Auto-pauses/retries if limits hit

✅ **Smart Sync Strategies**
- Upsert (insert new, update existing)
- Incremental (only insert new)
- Full replace (delete all, re-insert)

✅ **Production-Ready**
- Health check endpoint (`GET /health`)
- Structured logging (Pino)
- Automatic restart on failure
- Comprehensive error handling
- Sync history tracking in database

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

## How to Deploy

### Quick Start (10 minutes)

1. **Get API keys**
   - FEC.gov: https://api.open.fec.gov/developers/
   - Congress.gov: https://api.congress.gov/
   - Google Civic: https://console.cloud.google.com/

2. **Create new Railway service**
   - New Service → GitHub Repo
   - Select: `palidor2ks/ai-story-weaver`
   - Root Directory: `worker/`

3. **Set environment variables**
   ```
   SUPABASE_URL=<your_url>
   SUPABASE_SERVICE_ROLE_KEY=<your_key>
   FEC_API_KEY=<your_key>
   CONGRESS_API_KEY=<your_key>
   GOOGLE_CIVIC_API_KEY=<your_key>
   RUN_ON_STARTUP=true
   ```

4. **Deploy and test**
   - Click Deploy
   - Watch logs
   - Verify data in Supabase

See `QUICK_START.md` for detailed steps.

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

## Commits in This PR

1. **Add automated data sync agent for external APIs**
   - Browser-based sync system (in main app)
   - Admin dashboard for monitoring
   - API endpoints for control

2. **Add background data sync worker service**
   - Separate Node.js service
   - Cron scheduling
   - API adapters (FEC, Congress, Civic)
   - Docker setup

3. **Add manual sync trigger endpoint for testing**
   - `/sync` endpoint for manual triggers
   - Health check endpoint

4. **Add comprehensive testing guide**
   - Local testing instructions
   - Railway deployment testing
   - Error handling tests
   - Performance monitoring

5. **Add deployment checklist with API key setup**
   - Step-by-step deployment
   - API key acquisition
   - Verification steps

6. **Add quick start guide for worker deployment**
   - 10-minute setup
   - TL;DR version

## Documentation

Start with these in order:

1. **`QUICK_START.md`** - 10-minute setup guide
2. **`DEPLOYMENT_CHECKLIST.md`** - Detailed deployment steps
3. **`TESTING_GUIDE.md`** - Comprehensive testing procedures
4. **`WORKER_SUMMARY.md`** - Complete system overview
5. **`DATA_SYNC_GUIDE.md`** - Full system documentation
6. **`worker/README.md`** - Worker-specific information

## Success Criteria

✅ Worker deploys successfully
✅ Health check returns 200
✅ Logs show sync running
✅ `sync_history` table populated
✅ `sync_status` table updated
✅ Data appears in tables
✅ No errors in logs
✅ Cron schedule works

## Next Steps

1. Review this PR
2. Merge to `main`
3. Follow `QUICK_START.md` to deploy
4. Get API keys
5. Create new Railway service
6. Set environment variables
7. Deploy and test
8. Monitor logs and database

## Questions?

Refer to the appropriate guide:
- **"How do I set this up?"** → `QUICK_START.md`
- **"What are the exact steps?"** → `DEPLOYMENT_CHECKLIST.md`
- **"How do I test it?"** → `TESTING_GUIDE.md`
- **"How does it work?"** → `DATA_SYNC_GUIDE.md`
- **"Worker-specific info?"** → `worker/README.md`

## Support

For issues:
1. Check logs in Railway dashboard
2. Check `sync_history` and `sync_status` tables in Supabase
3. Test health endpoint: `curl /health`
4. Test manual sync: `curl -X POST /sync`
5. Review relevant documentation

---

**Ready to merge and deploy!** 🚀

