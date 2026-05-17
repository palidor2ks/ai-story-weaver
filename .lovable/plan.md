## Multi-committee FEC anchor for donor aliases

Today `donor_aliases.fec_committee_id` holds a single FEC ID. The AI donor analysis injects only that one ID as the "FEC ANCHOR," so aliases like "Meta/Facebook" that legitimately span multiple committees (Meta PAC C00502906, plus any Meta-affiliated corporate/SuperPAC/LLC committees) get narrated as just the one anchored PAC.

### What to change

**1. Schema (`donor_aliases`)**
- Add `fec_committee_ids text[]` (nullable, default `'{}'`).
- Backfill: `UPDATE donor_aliases SET fec_committee_ids = ARRAY[fec_committee_id] WHERE fec_committee_id IS NOT NULL AND (fec_committee_ids IS NULL OR array_length(fec_committee_ids,1) IS NULL);`
- Keep the scalar `fec_committee_id` column for backwards compatibility; treat it as the "primary" anchor and `fec_committee_ids` as the full set.

**2. Admin UI — `DonorAliasesPanel.tsx`**
- Replace the single FEC ID input with a chip/tag input (comma-separated or add-on-Enter) bound to `fec_committee_ids`.
- On save, write the array; also set scalar `fec_committee_id` to `fec_committee_ids[0]` so legacy code keeps working.
- Show all IDs as badges in the alias list row.

**3. `useDonorAliases.ts` hook**
- Update the alias type, create/update mutations, and the unapply flow to pass through `fec_committee_ids` (in addition to the existing scalar).

**4. AI analysis — `supabase/functions/ai-donor-analysis/index.ts`**
- In the alias lookup, capture `fec_committee_ids` (fall back to `[fec_committee_id]`).
- Build a multi-ID anchor block, e.g.:
  > FEC ANCHOR: This donor represents a parent entity filing under multiple FEC committees: C00502906, C00xxxxxx, C00yyyyyy (canonical name: "Meta/Facebook"). Analyze the parent organization across all of these committees; do not narrow the analysis to a single PAC.
- Update the anchor-confirmation rule: a match on **any** of the listed IDs (or canonical name + treasurer + city) counts as confirmation; contradictions only when results describe an entity outside the full set.
- Update the search prompt's "top recipients / cycle activity" sentence to say "across these committees."
- Continue to send the array back in the response (`fec_committee_ids`) alongside the existing scalar field for the UI.

**5. `unapply-donor-alias` / `apply-donor-alias` edge functions**
- No behavioral change needed; they key off canonical_name + patterns, not the FEC ID. Just make sure any payload typing tolerates the new field.

### Out of scope
- No change to donor aggregation, finance rollups, or the contributions table.
- No change to how Top Recipients / Contribution History are computed — those already aggregate by `display_name`.
- Individual donor profile layout unchanged.

### Rollout
1. Migration: add column + backfill from scalar.
2. Edge function update (reads array, falls back to scalar).
3. Admin UI update.
4. Open the Meta/Facebook alias in admin, add the additional FEC committee IDs, regenerate the AI analysis to verify the "Deeper analysis" now covers all anchored committees.

### Technical notes
- `fec_committee_ids` stays nullable so existing aliases without any FEC anchor keep working.
- The scalar column is kept and mirrored to `fec_committee_ids[0]` to avoid a wide refactor of any other consumer that still reads `fec_committee_id`.
- The AI prompt rule for "cap confidence at 20 on contradiction" stays; just the definition of "match" becomes "matches any committee in the anchored set."
