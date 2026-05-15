# Fix Attach Donors errors and click delay

## What's happening

When you click **Attach**, the browser shows `Failed to send a request to the Edge Function` and a long delay before the toast appears.

Looking at the edge function logs, the function **boots but never logs any execution** — meaning the request is dying before reaching the handler. Combined with the delay, the root cause is:

1. **Sequential per-donor UPDATEs**: the function loops through every selected donor and runs a separate `UPDATE donors` query. With many raw name variations selected (e.g. all "ADELSON, MIRIAM ..." rows), this easily exceeds the Edge Function's request timeout, so the connection drops before a response is sent. The browser surfaces this as `FunctionsFetchError: Load failed`.
2. **No client-side feedback during the wait**: the button just sits "pending" until the fetch finally fails, so it feels like nothing is happening.

## Fix plan

### 1. Edge function: `attach-donors-to-alias`
- Insert all `donor_alias_members` rows in a single `upsert` (already done) — keep.
- Replace the per-donor UPDATE loop with **one bulk update** using `.in('name', names)` scoped per `type`. One query per donor type (max 4: Individual / PAC / Organization / Unknown) instead of N queries.
- Wrap the MV refresh in `EdgeRuntime.waitUntil(...)` so the response returns immediately and the refresh completes in the background.
- Return `200` with a clear summary as soon as the writes finish.

### 2. Client: `DonorAliasesPanel.tsx` + `useDonorAliases.ts`
- In `useAttachDonors`, send the donor list in **chunks of 100** if more than 100 are selected, awaiting each chunk and aggregating counts. This keeps each request well under the timeout regardless of selection size.
- Show a clearer pending state on the Attach button: spinner + "Attaching N donors…" label while `attachMutation.isPending`.
- Keep the dialog open on error (already done) so the toast is visible.

### 3. Validation
- Test attaching a small selection (1–3) and a large selection (50+) of "ADELSON, MIRIAM ..." variants.
- Confirm the function logs show the bulk UPDATE completing and the response returns in <2s.
- Confirm the Attach button shows the spinner + count during the request.

## Technical details

- Bulk update shape:
  ```ts
  for (const type of uniqueTypes) {
    const names = donors.filter(d => d.type === type).map(d => d.name);
    await admin.from('donors')
      .update({ display_name: alias.canonical_name })
      .in('name', names)
      .eq('type', type);
  }
  ```
- Client chunking lives inside the mutation function, not the component, so callers don't change.
- No DB schema changes required.