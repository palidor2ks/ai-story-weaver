## Why the picture is missing

`candidates.image_url` for `P00009423` (Kamala D. Harris) is:

```
https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Kamala_Harris_Vice_Presidential_Portrait.jpg/600px-Kamala_Harris_Vice_Presidential_Portrait.jpg
```

That URL returns **HTTP 400** from Wikimedia (the thumbnail path is invalid — the source file was renamed/removed on Commons). The `<img>` `onError` handler in `OfficialAvatar` fires and the component falls back to the blue initials tile ("KH"). There is no `candidate_overrides.image_url` to mask it.

## Fix

Use the existing `enrich-official-photos` edge function (admin-only) which already:
1. Asks the AI gateway for a verified official portrait URL
2. Downloads + sniffs it
3. Uploads to the `official-photos` Supabase Storage bucket
4. Updates `candidates.image_url` to the rehosted public URL (cache-busted)

Steps:
1. Invoke `enrich-official-photos` with `{ candidateId: "P00009423" }` from an admin session (the existing Admin → Photos panel button, or a one-off invoke).
2. Verify the new `image_url` on `/candidate/P00009423` renders.

No code changes required — this is a data fix using the tool you already built. If the AI lookup fails to find a good portrait, fall back to manually setting a known-good URL (e.g. her Senate or White House official portrait) on the candidate row.

## Optional hardening (separate follow-up, not in this plan)

To prevent silent breakage when external image hosts go bad, we could:
- Add a nightly cron that calls `enrich-official-photos` with `mode: 'rehost-all'` so every candidate photo lives in our bucket.
- Or add a server-side validator that pings non-self-hosted `image_url`s and queues bad ones for re-enrichment.

Confirm if you want me to (a) just run the one-off re-enrichment for Kamala, or (b) also schedule the rehost-all sweep.
