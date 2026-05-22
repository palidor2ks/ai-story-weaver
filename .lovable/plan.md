
# Committee Causes (Pro-X / Anti-X) — Revised Plan

Replace the previous "committee topics = 17 quiz topics" model with a dedicated **causes** taxonomy (e.g. *Pro-Israel*, *Pro-gun*, *Pro-choice*, *Anti-tax*). Each cause maps to one of the 17 quiz topics so we can later show "this committee influences your X score."

## Taxonomy

New table **`committee_causes`** (the controlled vocabulary):
- `id` (slug, e.g. `pro-israel`)
- `label` (display, e.g. `Pro-Israel`)
- `stance` (`pro` | `anti` | `neutral`)
- `issue` (short, e.g. `Israel`, `Gun rights`)
- `quiz_topic_id` (FK → existing topics; required)
- `description`, `aliases` (text[])
- `status` (`active` | `pending` | `rejected`) — AI suggestions land as `pending`
- `created_by` (`seed` | `ai` | `admin`), `approved_by`, timestamps

Seed ~40 well-known causes across the 17 topics. Examples:
- Pro-Israel, Pro-Palestine → Foreign Policy
- Pro-gun, Pro-gun-control → Gun Policy
- Pro-choice, Pro-life → Abortion
- Pro-union/Labor, Anti-union → Labor
- Pro-crypto, Anti-crypto → Tech & Innovation
- Pro-fossil-fuel, Pro-climate-action → Environment
- Anti-tax, Pro-progressive-tax → Taxes
- Pro-immigration, Anti-immigration → Immigration
- Pro-Medicare-for-all, Anti-ACA → Healthcare
- Pro-Trump, Anti-Trump, Conservative, Progressive → Government (general-purpose buckets)

## Committee → Cause mapping

Rework existing **`committee_topics`** table → rename conceptually to causes:
- `fec_committee_id` (PK)
- `primary_cause_id` (FK → `committee_causes.id`, required)
- `secondary_cause_ids` (text[])
- `assigned_by` (`ai` | `admin`), `ai_confidence`, `ai_reasoning`, `admin_overridden`

Drop the columns referencing `topics.id`; primary becomes a cause id. Quiz-topic linkage is derived via `committee_causes.quiz_topic_id`.

## AI classification (revised edge function)

`classify-committee-topic` → repurpose to `classify-committee-cause`:
- Input context: committee name, designation, IE purposes, top targets, top donor employers.
- Tool-call output constrained to **active causes only**, plus an optional `suggested_new_cause` object (label, stance, issue, suggested_quiz_topic_id, reasoning).
- Suggested new causes are inserted into `committee_causes` as `status='pending'` and NOT applied to the committee until an admin approves them (committee gets the closest active cause or remains unassigned with a note).

## Admin UI

Two panels in `Admin → Committee Topics` tab (renamed **Committee Causes**):

1. **Causes library** — list/search active + pending causes, edit label/stance/issue/quiz_topic mapping, approve or reject AI suggestions, merge duplicates (move all committee assignments from cause A → B).
2. **Committee assignments** — existing panel, but the dropdown now picks from active causes (grouped by issue). Shows the derived quiz topic next to each cause for clarity.

## Display changes

`CommitteeTopicBadge` → `CommitteeCauseBadge`:
- Primary cause as a colored chip ("Pro-Israel") with the stance color (pro = neutral/blue, anti = red, neutral = gray).
- Tooltip shows: cause description, mapped quiz topic, AI reasoning, assigned-by.
- Secondary causes render as smaller chips.

Used in the same three places already wired: committee profile header, committees list cards, IE sections next to spending committee.

## Out of scope

- Auto-recomputing candidate quiz scores from committee causes (foundation only — derived `quiz_topic_id` makes that future feature possible).
- Candidate principal/authorized committees (still excluded).

## Migration impact

- Existing `committee_topics` rows (already seeded from the prior plan against quiz-topic IDs) will be wiped — those topic ids are not valid causes. Admins re-run "AI classify unassigned" after the new taxonomy is seeded.
- Frontend renames: `useCommitteeTopics` → `useCommitteeCauses`, `CommitteeTopicBadge` → `CommitteeCauseBadge`. Edge function renamed + redeployed.

## Technical summary

- **Migrations:** create `committee_causes`; alter `committee_topics` (drop topic FKs, switch primary/secondary to cause ids, clear rows); seed ~40 causes.
- **Edge fn:** `classify-committee-cause` (Lovable AI Gateway, `google/gemini-3-flash-preview`, tool-calling).
- **Frontend:** rename hooks/components, update Admin panel to two-tab layout (Library + Assignments), update three display surfaces.
