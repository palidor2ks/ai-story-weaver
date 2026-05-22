## Goal

Allow external/independent committees (PACs, SuperPACs, party committees, leadership PACs — anything that isn't a candidate's own principal/authorized committee) to be tagged with one primary topic plus optional secondary topics. AI classifies automatically; admins can override. Topic badges appear on the committee profile, in the Committees list, and inside IE sections.

## Data model

New table `committee_topics`:

- `fec_committee_id` (text, PK) — one row per committee
- `primary_topic_id` (text, FK → topics.id) — required
- `secondary_topic_ids` (text[]) — optional, defaults to `{}`
- `assigned_by` (`'ai' | 'admin'`)
- `ai_confidence` (`'low' | 'medium' | 'high'`, nullable)
- `ai_reasoning` (text, nullable) — short explanation shown in admin
- `admin_overridden` (boolean) — true once an admin edits it; AI re-runs skip these rows
- `created_at`, `updated_at`

RLS: public SELECT, admin/service-role write.

We intentionally exclude candidate principal/authorized committees (`candidate_committees.designation IN ('P','A')`) from classification — those inherit the candidate's topics.

## AI classification

New edge function `classify-committee-topic`:

- Input: `fec_committee_id` (or batch array)
- Pulls committee name, designation, recent IE purposes/descriptions, top recipient candidates
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool-calling to return `{ primary_topic_id, secondary_topic_ids[], confidence, reasoning }` constrained to the 12 federal topic IDs
- Upserts into `committee_topics` only when `admin_overridden = false`

Companion `classify-committees-batch` admin trigger processes all uncovered external committees using `EdgeRuntime.waitUntil()` in chunks.

## Admin UI

New `CommitteeTopicsPanel.tsx` in `src/components/admin/`, mounted as a tab in `Admin.tsx`:

- Lists external committees with current topic, AI confidence, "AI" or "Admin" badge
- Filter by topic / unassigned / low-confidence
- Inline dropdown to change primary topic + multi-select secondaries → sets `admin_overridden = true`
- Bulk action: "Run AI classification on unassigned"

## Display

1. **`/committee/:id`** (`CommitteeProfile.tsx`) — primary topic badge in the header next to the committee name; secondaries shown as smaller chips below.
2. **`/committees`** (`Committees.tsx`) — topic chip column + a topic filter dropdown.
3. **IE sections** (`IndependentExpenditureSections.tsx`, `IESummaryInline.tsx`) — topic chip next to the spending committee name on each row.

Badge uses the existing `TopicIcon` + topic display name; styles via existing semantic tokens (no new colors).

## Technical notes

- New hook `useCommitteeTopics(fecCommitteeIds: string[])` returns a `Map<fec_committee_id, { primary, secondaries }>` for batched lookup on list pages.
- Single-committee hook `useCommitteeTopic(fecCommitteeId)` for the profile page.
- Topic IDs validated against the existing 12 federal-scope topics (governor/local scope topics excluded — these committees are federal).
- Reclassification: editing a committee name or new IE data → next batch run picks it up unless `admin_overridden`.

## Out of scope

- Tagging candidate principal/authorized committees (they inherit candidate topics).
- Topic-based scoring impact on candidates — this is purely a categorization/filter layer for now.
