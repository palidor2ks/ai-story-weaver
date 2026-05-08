Root cause found: the live database record being used is `public.candidates`, not `static_officials`. That row still has a Wikimedia thumbnail URL, and that URL is currently returning HTTP 429, so the avatar falls back to “DT”.

Plan:
1. Update `public.candidates.image_url` for `P80001571` to the verified White House portrait URL that returns HTTP 200.
2. Keep the existing `fetch-representatives` White House URL fix so future representative refreshes do not reintroduce the broken image.
3. Update `OfficialAvatar` so if an image URL changes after a failed load, it resets the error state and tries the new URL instead of staying stuck on initials.
4. Verify the candidate profile uses the new image URL and the portrait renders on `/candidate/P80001571`.