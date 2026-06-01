# Data Sync Worker - Testing Guide

This guide walks you through testing the data sync worker before deploying to production.

## Quick Start (5 minutes)

### Option 1: Test with RUN_ON_STARTUP=true

**Fastest way to test:**

1. **Deploy worker to Railway**
   - Create new service in Railway
   - Point to `/worker` directory
   - Set `RUN_ON_STARTUP=true`
   - Deploy

2. **Check logs**
   - Go to Railway dashboard
   - Watch logs as sync runs immediately
   - Should see: `🚀 Starting scheduled data sync`

3. **Verify results**
   - Check Supabase `sync_history` table
   - Check Supabase `sync_status` table
   - Verify records were inserted/updated

### Option 2: Test with Manual Trigger Endpoint

**If you want to test without RUN_ON_STARTUP:**

1. **Deploy worker to Railway**
   - Create new service
   - Point to `/worker` directory
   - Set `RUN_ON_STARTUP=false`
   - Deploy

2. **Trigger sync manually**
   ```bash
   curl -X POST https://your-worker.railway.app/sync
   ```

3. **Check logs and results** (same as Option 1)

## Full Testing Checklist

### Pre-Deployment

- [ ] Clone repo locally
- [ ] Copy `worker/.env.example` to `worker/.env.local`
- [ ] Fill in Supabase credentials
- [ ] Fill in API keys (FEC, Congress, Google Civic)

### Local Testing

```bash
cd worker
npm install
npm run dev
```

You should see:
```
🎯 Initializing Data Sync Worker
   Supabase URL: https://...
   Sync Schedule: 0 2 * * *
🏥 Health check server listening on port 3000
✅ Worker started successfully
📅 Next sync: ...
```

**Test health check:**
```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2026-06-01T14:30:00.000Z"}
```

**Test manual sync:**
```bash
curl -X POST http://localhost:3000/sync
# {"message":"Sync triggered","status":"running"}
```

Then check logs for sync progress.

### Railway Deployment Testing

**1. Create new service**
- Railway Dashboard → New Service → GitHub Repo
- Select: `palidor2ks/ai-story-weaver`
- Root Directory: `worker/`
- Build: Dockerfile

**2. Set environment variables**
```
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
FEC_API_KEY=your_fec_key
CONGRESS_API_KEY=your_congress_key
GOOGLE_CIVIC_API_KEY=your_civic_key
SYNC_CRON=0 2 * * *
SYNC_TIMEZONE=UTC
SYNC_MAX_HOURS=23
RUN_ON_STARTUP=true
LOG_LEVEL=info
```

**3. Deploy**
- Railway auto-deploys
- Watch logs in dashboard

**4. Verify**
- [ ] Service shows "Running" status
- [ ] Health check returns 200
- [ ] Logs show sync starting
- [ ] `sync_history` table has new entries
- [ ] `sync_status` table updated

### Testing Each Data Source

#### FEC.gov (Candidates)

**Check logs for:**
```
Syncing table: candidates
Fetched records from source
✓ Synced candidates
```

**Verify in Supabase:**
```sql
SELECT COUNT(*) FROM candidates;
SELECT * FROM sync_status WHERE table_name = 'candidates';
```

#### Congress.gov (Bills)

**Check logs for:**
```
Syncing table: bills
Fetched records from source
✓ Synced bills
```

**Verify in Supabase:**
```sql
SELECT COUNT(*) FROM bills;
SELECT * FROM sync_status WHERE table_name = 'bills';
```

#### Google Civic (Officials)

**Check logs for:**
```
Syncing table: static_officials
Fetched records from source
✓ Synced static_officials
```

**Verify in Supabase:**
```sql
SELECT COUNT(*) FROM static_officials;
SELECT * FROM sync_status WHERE table_name = 'static_officials';
```

### Testing Error Handling

**Test missing API key:**
1. Set `FEC_API_KEY=` (empty)
2. Trigger sync
3. Should see: `FEC_API_KEY not set, skipping FEC sync`
4. Other tables should still sync

**Test rate limiting:**
1. Manually call API multiple times
2. Should see: `rate limited, waiting 60s`
3. Should retry after 60s

**Test network error:**
1. Disconnect internet (or use invalid URL)
2. Should see error in logs
3. Should continue with next table

### Testing Cron Schedule

**Test with different schedules:**

```bash
# Every minute (for testing)
SYNC_CRON=* * * * *

# Every 5 minutes
SYNC_CRON=*/5 * * * *

# Every hour
SYNC_CRON=0 * * * *

# Daily at 2 AM
SYNC_CRON=0 2 * * *
```

**Verify next sync time:**
```bash
curl https://your-worker.railway.app/health
# Check logs for "Next sync: ..."
```

### Testing Graceful Shutdown

**In Railway:**
1. Restart service
2. Should see: `SIGTERM received, shutting down gracefully`
3. Should complete current sync before stopping
4. Should restart automatically

### Performance Testing

**Monitor resource usage:**
- CPU usage during sync
- Memory usage during sync
- Network bandwidth
- Database connection count

**Check in Railway:**
- Metrics tab
- CPU, Memory, Network graphs

**Expected:**
- CPU: 10-50% during sync
- Memory: 100-300 MB
- Network: Varies by data size

### Monitoring in Production

**Daily checks:**
```sql
-- Check last sync time
SELECT table_name, last_sync_at, status 
FROM sync_status 
ORDER BY last_sync_at DESC;

-- Check for errors
SELECT * FROM sync_history 
WHERE status = 'failed' 
ORDER BY sync_started_at DESC;

-- Check sync duration
SELECT table_name, duration_seconds 
FROM sync_history 
WHERE sync_started_at > NOW() - INTERVAL '7 days'
ORDER BY sync_started_at DESC;
```

**Weekly checks:**
- Review sync history for patterns
- Check for API rate limit issues
- Verify data accuracy
- Monitor resource usage trends

## Troubleshooting

### Worker won't start

**Check:**
1. Environment variables set correctly
2. Supabase credentials valid
3. `sync_status` table exists
4. Logs for error messages

**Fix:**
```bash
# Check logs
railway logs

# Verify env vars
railway env

# Restart
railway restart
```

### Sync not running

**Check:**
1. `RUN_ON_STARTUP=true` or cron time correct
2. Worker is running (check status)
3. Health check returns 200
4. Logs for errors

**Fix:**
```bash
# Trigger manually
curl -X POST https://your-worker.railway.app/sync

# Check logs
railway logs --follow
```

### API errors

**Check:**
1. API keys are correct
2. API endpoints are accessible
3. Rate limits not exceeded
4. Network connectivity

**Fix:**
```bash
# Test API manually
curl "https://api.open.fec.gov/v1/candidates?api_key=YOUR_KEY&per_page=1"

# Check logs for specific error
railway logs | grep "error"
```

### Database errors

**Check:**
1. Supabase credentials correct
2. Tables exist
3. RLS policies allow writes
4. Database not full

**Fix:**
```sql
-- Check table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'candidates';

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'candidates';

-- Check row count
SELECT COUNT(*) FROM candidates;
```

## Success Criteria

✅ Worker deploys successfully
✅ Health check returns 200
✅ Sync runs without errors
✅ `sync_history` table populated
✅ `sync_status` table updated
✅ Data appears in tables
✅ Cron schedule works
✅ Manual trigger works
✅ Error handling works
✅ Graceful shutdown works

## Next Steps

Once testing passes:
1. Set `RUN_ON_STARTUP=false` for production
2. Adjust `SYNC_CRON` to desired schedule
3. Set up monitoring/alerts
4. Document any customizations
5. Train team on monitoring

## Support

For issues:
1. Check logs: `railway logs --follow`
2. Check Supabase tables: `sync_history`, `sync_status`
3. Test health endpoint: `curl /health`
4. Test manual sync: `curl -X POST /sync`
5. Review this guide

