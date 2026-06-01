# Data Sync Worker - Quick Start

Get the worker running in 10 minutes.

## 🚀 TL;DR

1. Get 3 API keys (5 min)
2. Create Railway service (2 min)
3. Set environment variables (2 min)
4. Deploy and watch logs (1 min)

## Step 1: Get API Keys

### FEC.gov
- Go to: https://api.open.fec.gov/developers/
- Sign up for API key
- Check email for key

### Congress.gov
- Go to: https://api.congress.gov/
- Get API key
- Check email for key

### Google Civic
- Go to: https://console.cloud.google.com/
- Create project
- Enable "Civic Information API"
- Create API key in Credentials

## Step 2: Get Supabase Credentials

From Railway dashboard:
1. Click `ai-story-weaver` service
2. Go to "Variables" tab
3. Copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Step 3: Create Worker Service

In Railway:
1. Click "New Service" → "GitHub Repo"
2. Select: `palidor2ks/ai-story-weaver`
3. Root Directory: `worker/`
4. Click "Deploy"

## Step 4: Set Variables

In the new worker service, add these variables:

```
SUPABASE_URL=<your_url>
SUPABASE_SERVICE_ROLE_KEY=<your_key>
FEC_API_KEY=<your_fec_key>
CONGRESS_API_KEY=<your_congress_key>
GOOGLE_CIVIC_API_KEY=<your_civic_key>
RUN_ON_STARTUP=true
LOG_LEVEL=info
```

## Step 5: Deploy

Click "Deploy" and watch logs.

You should see:
```
🎯 Initializing Data Sync Worker
✅ Worker started successfully
⚡ Running sync on startup
🚀 Starting scheduled data sync
Syncing table: candidates
Syncing table: bills
Syncing table: static_officials
✅ Sync cycle completed
```

## Step 6: Verify

### Health Check
```bash
curl https://your-worker.railway.app/health
```

### Check Database
In Supabase:
```sql
SELECT * FROM sync_history ORDER BY sync_started_at DESC LIMIT 5;
SELECT * FROM sync_status;
```

## Done! 🎉

Your data sync worker is running 24/7.

## Next Steps

- Set `RUN_ON_STARTUP=false` for production
- Adjust `SYNC_CRON` if needed
- Monitor logs regularly
- See `TESTING_GUIDE.md` for detailed testing
- See `DEPLOYMENT_CHECKLIST.md` for full setup

## Troubleshooting

**Worker won't start?**
- Check all env vars are set
- Check Supabase credentials
- Check logs for errors

**Sync not running?**
- Check `RUN_ON_STARTUP=true`
- Check health: `curl /health`
- Check logs

**API errors?**
- Verify API keys are correct
- Test API manually
- Check rate limits

## Support

- `TESTING_GUIDE.md` - Full testing guide
- `DEPLOYMENT_CHECKLIST.md` - Detailed checklist
- `worker/README.md` - Worker docs
- `DATA_SYNC_GUIDE.md` - Full system guide

