## Goal

Condense the 12 federal topics into 6. Education folds into "Health, Education & Social Safety Net". Local topics (5) stay unchanged.

## Final federal taxonomy (6)

| # | Topic | Icon | Merges from |
|---|---|---|---|
| 1 | Economy & Work | 💼 | Economy & Jobs + Technology & Science |
| 2 | Health, Education & Social Safety Net | 🤝 | Healthcare + Education + Social Programs |
| 3 | Environment & Energy | 🌍 | (unchanged) |
| 4 | National Security & Borders | 🛡️ | Defense & Military + Immigration + Foreign Affairs |
| 5 | Rights & Justice | ⚖️ | Civil Rights & Justice + Judicial & Courts |
| 6 | Government & Democracy | 🏛️ | (unchanged) |

Local (unchanged): Cost of Living 💲, Education 🏫, Housing 🏠, Public Health 🩺, Public Safety 🚔.

## Old → new topic id mapping

```text
economy          -> economy-work
technology       -> economy-work
healthcare       -> health-safety-net
education        -> health-safety-net
social-programs  -> health-safety-net
environment      -> environment-energy
defense          -> national-security-borders
immigration      -> national-security-borders
foreign-affairs  -> national-security-borders
civil-rights     -> rights-justice
judicial         -> rights-justice
government       -> government-democracy
```

## Product impact

- Quiz: ~6 sections instead of 12. Existing questions keep their text; only their `topic_id` is remapped.
- Candidate / party profiles: 6 score bars instead of 12. Topic averages recompute from the same underlying answers.
- Comparison views: 6-axis radar.
- Bill / vote tagging: re-mapped via `policyAreaToTopicId` rewrite.
- Federal scope filter still returns only the 6 federal topics; governor-and-below still only see the 5 local topics.

## Technical scope

**Database migration (single migration):**
1. Insert 6 new federal `topics` rows with icons + display names. Keep `weight=1`.
2. Backfill via mapping above:
   - `questions.topic_id`
   - `bills.topic_id`
   - `committee_causes.quiz_topic_id`
   - audit any other FKs that reference topic ids
3. Delete the 12 old federal topic rows after backfill verifies zero references.
4. Refresh dependent materialized views (`bill_summary_stats`, any topic-scoped MVs).

**Frontend:**
- `src/data/mockData.ts`: rewrite `topics` array (6 entries) and `policyAreaToTopicId` map.
- `src/lib/topicDescriptions.ts`: replace 12 federal entries with 6; keep the 5 local entries.
- `src/components/TopicIcon.tsx`: confirm 6 emoji icons resolve (already emoji-passthrough).
- Audit hardcoded old ids across `src/hooks`, `src/pages`, `src/components`.

**Edge functions:**
- Audit `supabase/functions/**` for hardcoded topic id strings (research prompts, scoring, validation). Update so AI returns one of the 6 new ids.

**Memory updates:**
- Update Core rule in `mem://index.md`: "Topics: 6 federal + 5 local (11 total)".
- Update `mem://features/quiz/topic-architecture-and-iconography`.
- Update `mem://database/bill-summary-stats/v9-12-topic-and-congress-logic` → v10 6-topic logic.
- Update `mem://technical/bill-excel-import-v11-policy-mapping` with new mapping.

## Open questions

1. **Display name for #2** — "Health, Education & Social Safety Net" is long. Acceptable, or shorten to "Health, Education & Welfare"?
2. **Icon for #2** — keep 🤝, or switch to ❤️ / 🏥 / 🎓?
3. **Old ids** — hard-cut in this release, or keep as hidden aliases for one release so cached client state / external links don't break?
