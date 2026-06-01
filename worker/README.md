# Data Sync Worker

Background service that runs 24/7 to keep Supabase synchronized with external data sources.

## Features

- ✅ Runs continuously on Railway
- ✅ Configurable cron schedule (default: 2 AM daily)
- ✅ Respects API rate limits
- ✅ Handles long-running operations (max 23 hours)
- ✅ Comprehensive logging
- ✅ Health check endpoint

## Setup

### Environment Variables

```bash
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
FEC_API_KEY=your_fec_key
CONGRESS_API_KEY=your_congress_key
GOOGLE_CIVIC_API_KEY=your_civic_key
SYNC_CRON=0 2 * * *
SYNC_TIMEZONE=UTC
SYNC_MAX_HOURS=23
RUN_ON_STARTUP=false
LOG_LEVEL=info
```

### Deploy

```bash
railway up
```

## Monitoring

- Health check: `GET /health` on port 3000
- Logs: Railway dashboard
- Sync history: `sync_history` table in Supabase
- Sync status: `sync_status` table in Supabase

## Local Development

```bash
npm install
npm run dev
```

