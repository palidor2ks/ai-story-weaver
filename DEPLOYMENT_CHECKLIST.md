# Data Sync Worker - Deployment Checklist

Quick checklist to deploy and test the worker.

## Step 1: Get API Keys (5 minutes)

### FEC.gov API Key
1. Go to: https://api.open.fec.gov/developers/
2. Click "Sign up for an API key"
3. Fill in your email
4. Check your email for the API key
5. Copy the key

**Test it:**
```bash
curl "https://api.open.fec.gov/v1/candidates?api_key=YOUR_KEY&per_page=1"
```

### Congress.gov API Key
1. Go to: https://api.congress.gov/
2. Click "Get an API Key"
3. Fill in your email
4. Check your email for the API key
5. Copy the key

**Test it:**
```bash
curl "https://api.congress.gov/v3/bill?api_key=YOUR_KEY&limit=1&format=json"
```

### Google Civic API Key
1. Go to: https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable "Civic Information API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the key

**Test it:**
```bash
curl "https://www.googleapis.com/civicinfo/v2/representatives?key=YOUR_KEY&levels=federal"
```

## Step 2: Get Supabase Credentials

From your existing `ai-story-weaver` service in Railway:

1. Go to Railway dashboard
2. Click on `ai-story-weaver` service
3. Go to "Variables" tab
4. Copy these values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Step 3: Create New Railway Service

1. Go to Railway dashboard
2. Click "New Service" → "GitHub Repo"
3. Select: `palidor2ks/ai-story-weaver`
4. Set **Root Directory**: `worker/`
5. Click "Deploy"

## Step 4: Set Environment Variables

In the new worker service, go to "Variables" and add:

```
SUPABASE_URL=<paste from step 2>
SUPABASE_SERVICE_ROLE_KEY=<paste from step 2>
FEC_API_KEY=<paste from step 1>
CONGRESS_API_KEY=<paste from step 1>
GOOGLE_CIVIC_API_KEY=<paste from step 1>
SYNC_CRON=0 2 * * *
SYNC_TIMEZONE=UTC
SYNC_MAX_HOURS=23
RUN_ON_STARTUP=true
LOG_LEVEL=info
PORT=3000
```

## Step 5: Deploy

1. Click "Deploy" button
2. Wait for build to complete
3. Check "Logs" tab

You should see:
```
🎯 Initializing Data Sync Worker
✅ Worker started successfully
⚡ Running sync on startup
🚀 Starting scheduled data sync
```

## Step 6: Verify Results

### Check Health
```bash
curl https://your-worker-url.railway.app/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Check Logs
In Railway dashboard, go to "Logs" tab and look for:
- `Syncing table: candidates`
- `Syncing table: bills`
- `Syncing table: static_officials`
- `✅ Sync cycle completed`

### Check Database
In Supabase, run:
```sql
-- Check sync history
SELECT table_name, status, records_inserted, duration_seconds
FROM sync_history 
ORDER BY sync_started_at DESC 
LIMIT 10;

-- Check sync status
SELECT table_name, last_sync_at, status
FROM sync_status
ORDER BY table_name;

-- Check data was inserted
SELECT COUNT(*) as candidates FROM candidates;
SELECT COUNT(*) as bills FROM bills;
SELECT COUNT(*) as officials FROM static_officials;
```

## Step 7: Configure for Production

Once testing passes:

1. Set `RUN_ON_STARTUP=false` (so it only runs on schedule)
2. Adjust `SYNC_CRON` if needed:
   - `0 2 * * *` = Daily at 2 AM
   - `0 */6 * * *` = Every 6 hours
   - `0 0 * * 0` = Weekly on Sunday
3. Set `LOG_LEVEL=warn` (less verbose)

## Troubleshooting

### Worker won't start
- Check all environment variables are set
- Check Supabase credentials are correct
- Check logs for error messages

### Sync not running
- Check `RUN_ON_STARTUP=true` for testing
- Check health endpoint: `curl /health`
- Check logs for errors

### API errors
- Verify API keys are correct
- Test API manually with curl
- Check rate limits not exceeded

### Database errors
- Verify Supabase credentials
- Check `sync_status` table exists
- Check RLS policies allow writes

## Success Criteria

✅ Worker deploys successfully
✅ Health check returns 200
✅ Logs show sync running
✅ `sync_history` table populated
✅ `sync_status` table updated
✅ Data appears in tables
✅ No errors in logs

## Next Steps

1. Monitor first few syncs
2. Adjust schedule if needed
3. Set up alerts/notifications
4. Document any customizations
5. Train team on monitoring

## Support

For detailed help, see:
- `TESTING_GUIDE.md` - Comprehensive testing guide
- `worker/README.md` - Worker documentation
- `DATA_SYNC_GUIDE.md` - Full sync system guide

