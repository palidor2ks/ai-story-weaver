## Fix "Working for Working Americans" donor analysis (both approaches)

Apply both fixes so this donor — and others like it — get a clean, well-grounded AI analysis.

### A. Merge the two donor name variants under one alias

Create a donor alias canonicalized as **"Working for Working Americans"** (FEC C00490847, LIUNA-affiliated PAC, Las Vegas NV) with two members:

- `WORKING FOR WORKING AMERICANS - FEDERAL` (Organization / PAC)
- `WORKING FOR WORKING AMERICANS` (Organization / PAC)

Steps (data migration, single insert call):
1. Insert one row into `donor_aliases` with `canonical_name = 'Working for Working Americans'`, `is_active = true`.
2. Insert both `(donor_name, donor_type)` pairs into `donor_alias_members`, idempotent on conflict.
3. Update `donors.display_name = 'Working for Working Americans'` for every row whose `(name, type)` is in the alias's members.
4. Ask the user to trigger a refresh of `private.donor_consolidated_mv` from the admin Donor Aliases panel (same flow as ActBlue) so the two cards collapse into one.

Result: one donor card with the combined ~$17M+ total instead of two split cards.

### B. Enrich the AI analysis prompt with FEC committee context

Today `ai-recipient-analysis` (and the donor-side equivalent the recipient analysis function shares logic with) only has the literal `display_name` to feed Perplexity. When the donor IS a registered FEC committee, we should look up its `fec_committee_id` and canonical name and inject them into the prompt as an anchor.

Changes in `supabase/functions/ai-donor-analysis/index.ts` (the donor analyzer — same pattern as `ai-recipient-analysis`):

1. Before building the search prompt, try to match the donor to an FEC committee:
   - Query `committees` (or `candidate_committees` if that's where canonical names live) by:
     - exact match on `display_name`
     - exact match on each member `name` from `donor_alias_members` for this alias
     - fuzzy match using `ilike` with the donor name stripped of trailing tokens like `- FEDERAL`, `PAC`, `INC`
   - If exactly one committee matches (or all matches share the same `fec_committee_id`), capture `{ fec_committee_id, committee_name, state, city, zip, treasurer_name }`.
2. Inject the anchor into the search prompt:
   - `Anchor: FEC committee {fec_committee_id} ("{committee_name}"), based in {city}, {state} {zip}. Confirm same entity by FEC ID before answering.`
3. Update the system prompt rule:
   - "If a search result contradicts the FEC anchor (different ID, different city, different treasurer), set `insufficient_information=true`. If results confirm the FEC anchor, proceed with full confidence even if the literal donor name string differs from the FEC canonical name."
4. Return the resolved `fec_committee_id` and `committee_name` in the response payload so the UI can display "Identified as FEC C00490847 — Working for Working Americans" above the analysis.
5. No change to the deterministic confidence formula; the anchor only affects whether the model flags `insufficient_information`.

### Verification

- After (A) runs, `/donors` shows a single "Working for Working Americans" card aggregating both variants.
- Re-run AI analysis on that card: expect `provider = "perplexity"`, `insufficient_information = false`, `confidence ≥ 60`, FEC ID surfaced, and positions/goals populated (LIUNA construction-trades agenda).
- Re-run on a donor with no FEC committee match (e.g. an individual): behavior unchanged, no anchor injected, same outcome as today.

### Out of scope

- Option C (loosening disambiguation without an FEC anchor). With (B) in place we don't need it.
- Backfilling FEC IDs onto the `donors` table itself — the lookup at analysis time is enough.
