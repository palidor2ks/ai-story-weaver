# card-renderer

A tiny headless-Chrome (Playwright) service that screenshots the **real**
`CandidateStatCard` for the automatic social-post pipeline, so auto-posted cards
are identical to the in-app share button (same React component, same data).

```
Supabase cron (auto-post-due)
        → render-social-card (edge fn)
                → POST /render { candidateId }   ← this service
                        → opens APP_BASE_URL/r/card/:candidateId in headless Chrome
                        → waits for window.__CARD_READY__
                        → returns a 1080×1080 PNG
                → edge fn uploads the PNG to Supabase storage + posts to X
```

## Endpoints

- `GET /health` → `ok`
- `POST /render` body `{ "candidateId": "<id>" }`, header `x-render-token: <SHARED_SECRET>` → `image/png` (1080×1080)

## Config (env vars)

| var | required | default | notes |
|---|---|---|---|
| `APP_BASE_URL` | yes | `https://www.polipulseapp.com` | origin of the deployed app (must serve `/r/card/:id`) |
| `SHARED_SECRET` | recommended | _(none)_ | if set, `POST /render` requires the same value in `x-render-token` |
| `PORT` | no | `8080` | listen port |
| `NAV_TIMEOUT_MS` | no | `35000` | per-render timeout |

## Run locally

```bash
cd services/card-renderer
npm install
npx playwright install --with-deps chromium   # only needed outside the Docker image
APP_BASE_URL=https://www.polipulseapp.com SHARED_SECRET=dev npm start
# then:
curl -s -X POST localhost:8080/render -H 'content-type: application/json' \
  -H 'x-render-token: dev' -d '{"candidateId":"<a-real-candidate-id>"}' -o card.png
```

## Deploy (pick one)

The repo includes a `Dockerfile`. Any container host works; set the env vars above.

### Google Cloud Run
```bash
cd services/card-renderer
gcloud run deploy card-renderer \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --concurrency 1 --timeout 60 \
  --set-env-vars APP_BASE_URL=https://www.polipulseapp.com,SHARED_SECRET=<your-secret>
```
Cloud Run gives you a URL like `https://card-renderer-xxxx.run.app`.

### Fly.io
```bash
cd services/card-renderer
fly launch --no-deploy           # creates fly.toml (internal_port = 8080)
fly secrets set APP_BASE_URL=https://www.polipulseapp.com SHARED_SECRET=<your-secret>
fly deploy
```

### Render.com
New → Web Service → from this repo, root `services/card-renderer`, Docker runtime.
Add env vars `APP_BASE_URL` and `SHARED_SECRET`.

> Memory: Chromium needs ~512MB–1GB. Use ≥1GB and concurrency 1 for reliability.

## Wire it to Supabase

After the service is live, set these **Supabase Edge Function secrets** so
`render-social-card` uses it (otherwise it falls back to the built-in simple card):

```
SCREENSHOT_SERVICE_URL   = https://<your-service-host>/render
SCREENSHOT_SERVICE_TOKEN = <the same SHARED_SECRET>
```
