## Issue

Edge function still reports `IDME_CLIENT_ID secret is not set` even though you just added it. Edge functions read env vars at boot — the running instance was started before the secret existed, so it doesn't see it yet.

## Fix

Redeploy `verify-identity-idme` to force a cold start that picks up `IDME_CLIENT_ID` and `IDME_CLIENT_SECRET`. No code change needed.

Then retry the ID.me button from `/profile`. If it still errors, I'll pull the function logs and diagnose (most likely culprits at that point: scope mismatch, redirect URI not registered in ID.me dashboard, or sandbox-vs-prod base URL).
