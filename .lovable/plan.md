## Evidence-Based Onboarding Question Selection (External Salience Data)

Pick the 2 highest-salience questions per topic by grounding selection in published voter-issue research, not editorial judgment.

### Research sources

Pull recent (2024–2026) salience data from:
- **Pew Research Center** — annual "Public's Policy Priorities" survey (covers economy, healthcare, immigration, climate, terrorism, education, etc.)
- **Gallup** — "Most Important Problem Facing the Country" monthly tracker
- **AP-NORC / KFF** — for healthcare, abortion, and welfare-specific salience
- **Pew local-government trust surveys & Brookings Metro** — for the 5 local topics (housing affordability, K-12, public safety, cost of living, public health), since national pollsters cover these less consistently

Within each topic, rank sub-issues by **% of public calling it a "top priority"**, then map the top 2 sub-issues to the closest existing question in our DB.

### Process

1. **Gather data** — use `websearch--web_search` (and optionally `firecrawl` for full-page extraction) to pull the latest Pew "Top Policy Priorities" report, Gallup MIP, and topic-specific surveys. Cache the source URLs and exact % figures.
2. **Map sub-issues → topics** — bucket each polled issue under one of our 11 topics:
   - economy-work, health-safety-net, environment-energy, national-security-borders, rights-justice, government-democracy
   - local-cost-of-living, local-education, local-housing, local-public-health, local-public-safety
3. **Pick top 2 sub-issues per topic** by salience %.
4. **Match to existing questions** — for each chosen sub-issue, find the closest-matching question in our DB (via keyword search against `questions.text`).
5. **Present a single ranked table** to you for approval — each row shows: topic, sub-issue, salience %, source, matched question ID + text. You approve / swap before anything is written.
6. **After approval**: update `set-onboarding` action in `supabase/functions/import-new-questions/index.ts` with the 22 chosen IDs, run the action, and update the Onboarding welcome copy from "16 Questions" → "22 Questions / 12 federal + 10 local".

### Deliverable from this round

A markdown table like:

```
| Topic                | Sub-issue (rank 1)    | Salience | Source | Matched Q ID  | Question text |
| economy-work         | Inflation/cost-of-liv.| 73% top  | Pew '25| economy-q??   | ...            |
| economy-work         | Strengthening econ.   | 68%      | Pew '25| economy-q??   | ...            |
| ...                  | ...                   | ...      | ...    | ...           | ...            |
```

You review and approve before any DB or code changes.

### Caveats

- National polls (Pew/Gallup) cover federal topics well but treat local topics thinly. For the 5 local topics I'll lean on Brookings/Pew local-government research plus Bipartisan Policy Center / National League of Cities reports. Where good data doesn't exist for a local sub-issue, I'll flag it and pick the most ideologically-discriminating question as a fallback (clearly labeled).
- "Salience" measures *how much voters care*, not *how divided they are*. For onboarding we want both — a highly salient + highly divisive question. I'll add a second column noting Pew's partisan-gap % where available so the final picks are both important AND discriminating.

### Out of scope (this round)

- No code or DB changes yet. Plan ends with you reviewing the ranked table.
- No new question authoring — selection from the existing ~200 questions only.
