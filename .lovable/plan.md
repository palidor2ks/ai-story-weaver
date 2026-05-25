## Rename Topic #2 to "Health, Education & Welfare"

Update the display label for federal topic `health-safety-net` from "Health, Education & Social Safety Net" to **"Health, Education & Welfare"**. Topic ID, icon (🤝), and scope remain unchanged — label-only change.

### Database
- Migration to update `topics.label` (or `name`) where `id = 'health-safety-net'` to `'Health, Education & Welfare'`.

### Frontend
- `src/data/mockData.ts` — update the `topics` array entry label.
- `src/lib/topicDescriptions.ts` — update the display name in `TOPIC_DESCRIPTIONS`.
- Grep `src/` and `supabase/functions/` for any remaining hardcoded "Social Safety Net" / "Health, Education & Social Safety Net" strings and update them.

### Memory
- Update `mem://features/quiz/topic-architecture-and-iconography` to reflect the new label.
- Core rule in `mem://index.md` already references only the ID (`health-safety-net`), so no change needed there.

### Out of scope
- No change to topic IDs, scoring, question mappings, bill mappings, or the 5 local topics.
