# Answers enrichment part 2 — voting-record citations (plan)

> **Status: planning — not yet started**
> Owner decision needed at §Decision before implementation begins.

## Why this (the part-1b lesson)

The evidence-index approach (press releases → distiller) tops out at ~5% citation rate
because quiz questions ask for *positions* ("Should the minimum wage be raised?") while
press releases record *actions* ("Rep. X voted for the Raise the Wage Act"). The distiller
correctly rejects the mismatch.

A roll call vote IS the position — 100% precision by construction, no distiller needed.
For any question that has a corresponding floor vote, this gives a verifiable, linkable
citation with no ambiguity.

## Target state

`candidate_answers` rows for sitting members whose quiz question maps to a bill vote:
```
source_type = 'public_statement'
source_url  = 'https://clerk.house.gov/evs/2021/roll369.xml'  (or propublica equivalent)
evidence_type = 'vote_record'   ← new enum value
```

Coverage estimate:
- ~583 incumbents in system, ~40–50% of questions mappable to specific bills
- Expected: 40–60% of sitting-member answers covered at high precision

## The plan

### Phase 1 — question_bill_map table (one-time research)

**Schema:**
```sql
question_bill_map (
  question_id          text   references questions(id),
  congress             int,          -- e.g. 117
  bill_type            text,         -- HR, S, HRES, SRES, HJRES, SJRES
  bill_number          int,          -- e.g. 5376
  bill_title           text,         -- human-readable label
  roll_call_number     int,          -- House clerk or Senate roll call number
  chamber              text,         -- 'house' | 'senate'
  yea_is_conservative  boolean,      -- TRUE = YES vote = right-leaning on -10..+10 scale
  notes                text          -- why this bill maps to this question
)
```

**Priority bill→question mappings to build first:**

| Bills | Questions covered |
|---|---|
| H.R.5376 (IRA 2022) | renewable energy, oil/gas drilling, methane limits, corporate tax, high-income taxes |
| H.R.3684 (IIJA 2021) | infrastructure spending (x2), broadband access |
| H.R.4346 (CHIPS Act 2022) | semiconductor manufacturing funding |
| H.R.842 117th (PRO Act) | ease unionization |
| H.R.603 117th (Raise the Wage Act) | minimum wage |
| H.R.1319 (ARP 2021) | automatic stabilizers, infrastructure stimulus |
| S.2155 115th (Economic Growth/Dodd-Frank rollback) | bank oversight, commercial/investment separation |
| H.R.1 115th (TCJA 2017) | corporate tax rate, high-income taxes |
| NDAA (annual) | defense spending, military cooperation, foreign telecom (Huawei/ZTE provisions) |
| H.R.6346 119th (KOSA 2024 Senate vote) | children online protections |
| Dream Act / DACA votes | immigration pathway |
| ACA repeal votes 2017 (AHCA) | ACA/health insurance |
| H.R.3076 (Postal Service Reform) | government reform |

This is an ~afternoon research task: for each bill, look up the ProPublica roll call ID,
verify the `yea_is_conservative` direction, and record it. Aim for 60–80 mappings covering
~30 questions initially.

### Phase 2 — member_votes cache table + fetch function

**Schema:**
```sql
member_votes (
  candidate_id   text    not null,  -- = bioguide_id (confirmed: candidates.id = bioguide for incumbents)
  congress       int     not null,
  chamber        text    not null,
  session        int,
  roll_call      int     not null,
  bill_id        text,              -- e.g. 'HR5376-117'
  position       text    not null,  -- 'Yes' | 'No' | 'Not Voting' | 'Present'
  propublica_url text,              -- source link for citation
  fetched_at     timestamptz default now(),
  primary key (candidate_id, congress, chamber, roll_call)
)
```

**Fetch function** (`fetch-member-votes` edge function):
- Input: `{ candidate_id, congress }` or bulk mode
- Call ProPublica Congress API:
  `GET /members/{bioguide_id}/votes/{congress}/{session}.json`
- Upsert into `member_votes`
- Rate limit: 5 req/s (ProPublica is generous; 583 members × 2 sessions = ~1200 calls)
- Needs `PROPUBLICA_API_KEY` secret (free registration at propublica.org/datastore)

**Alternative (no API key)**: congress.gov bulk XML downloads — but ProPublica is cleaner.

### Phase 3 — evidence application

After `member_votes` is populated for sitting members:

```sql
-- Preview (run before applying)
SELECT
  ca.id,
  c.name,
  q.text as question,
  mv.position,
  qbm.yea_is_conservative,
  -- position aligns with answer_value direction?
  case
    when mv.position = 'Yes'  and     qbm.yea_is_conservative and ca.answer_value > 0 then 'match'
    when mv.position = 'Yes'  and not qbm.yea_is_conservative and ca.answer_value < 0 then 'match'
    when mv.position = 'No'   and     qbm.yea_is_conservative and ca.answer_value < 0 then 'match'
    when mv.position = 'No'   and not qbm.yea_is_conservative and ca.answer_value > 0 then 'match'
    else 'mismatch'
  end as alignment,
  mv.propublica_url
FROM candidate_answers ca
JOIN candidates c       on c.id = ca.candidate_id
JOIN questions q        on q.id = ca.question_id
JOIN question_bill_map qbm on qbm.question_id = ca.question_id
JOIN member_votes mv
  on mv.candidate_id = ca.candidate_id
  and mv.congress    = qbm.congress
  and mv.chamber     = qbm.chamber
  and mv.roll_call   = qbm.roll_call_number
WHERE ca.source_url is null
  and ca.source_type = 'public_statement'
  and mv.position in ('Yes', 'No')
LIMIT 100;

-- Apply (after eyeball passes)
UPDATE candidate_answers ca
SET
  source_url    = mv.propublica_url,
  evidence_type = 'vote_record',
  updated_at    = now()
FROM question_bill_map qbm
JOIN member_votes mv
  on mv.candidate_id = ca.candidate_id
  and mv.congress    = qbm.congress
  and mv.chamber     = qbm.chamber
  and mv.roll_call   = qbm.roll_call_number
WHERE qbm.question_id = ca.question_id
  and ca.source_url   is null
  and ca.source_type  = 'public_statement'
  and mv.position in ('Yes', 'No')
  -- direction must match
  and (
    (mv.position = 'Yes' and     qbm.yea_is_conservative and ca.answer_value > 0) or
    (mv.position = 'Yes' and not qbm.yea_is_conservative and ca.answer_value < 0) or
    (mv.position = 'No'  and     qbm.yea_is_conservative and ca.answer_value < 0) or
    (mv.position = 'No'  and not qbm.yea_is_conservative and ca.answer_value > 0)
  );
```

**New enum value needed:** add `'vote_record'` to the `evidence_type` enum (migration).

### Phase 4 — what's left uncovered

After voting records:
- ~50% of questions with no bill mapping (AI regulation, social media, abstract questions)
- Challengers / non-incumbents (no voting record)
- Members who missed the vote (`Not Voting` / `Present`)

For these: the press-release evidence-index approach (part-1b, ~5% rate) remains the
second-tier layer. Run it in parallel — different `evidence_type`, doesn't conflict.

## §Decision needed before starting

1. **ProPublica API key** — free registration, takes ~1 day. Owner to register at
   `https://www.propublica.org/datastore/api/propublica-congress-api` and store key in
   Supabase vault as `propublica_api_key`.

2. **Bill mapping scope** — start with the ~15 high-coverage bills above (covering ~30
   questions), or do a comprehensive pass of all 11 topics first? Recommendation: start
   narrow, apply, verify precision, then widen.

3. **evidence_type enum** — `'vote_record'` needs to be added to the DB. Is there an
   existing enum or a text column? Confirm before migration.

## What this does NOT cover

- `answer_value` accuracy — voting records prove a vote happened, not that the recorded
  answer_value is correctly signed. The sign (yea_is_conservative) in question_bill_map
  must be manually verified per bill. This is the critical human gate.
- Misses / abstentions — a member who didn't vote doesn't get a citation; their answer_value
  may still be wrong. Voting records only cover members who voted.
- Challengers — need a different evidence approach (campaign websites, questionnaires).

## Timeline estimate

- Phase 1 (bill mapping table + data): ~1 session
- Phase 2 (fetch function + cache): ~1 session
- Phase 3 (apply + migration): ~half session
- Total: ~2.5 sessions after API key is available
