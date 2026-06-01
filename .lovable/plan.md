# Full Gamification & Badges System

Implements every badge family from `docs/gamification-badge-ideas.md` plus the activity/streak infrastructure needed to support them. All awarding is server-side and idempotent; the client only emits events and reads results.

## 1. Database schema (one migration)

### Tables

**`badge_definitions`** — catalog (seeded, admin-editable)
- `slug` (PK, text), `name`, `description`, `category` (enum: `onboarding | progress | topic | engagement | social | candidate`), `tier` (int, nullable — for ladders), `icon` (emoji/url), `points` (int, default 0), `is_repeatable` (bool — for per-topic and streak badges), `active` (bool), `criteria` (jsonb — machine-readable trigger config)

**`user_badges`** — awards
- `user_id`, `badge_slug`, `awarded_at`, `metadata` (jsonb: e.g. `{topic_id, percent, period_key}`), `event_id` (uuid → user_activity_events, nullable for backfilled)
- Unique: `(user_id, badge_slug)` when `is_repeatable=false`; `(user_id, badge_slug, metadata->>'scope_key')` when repeatable (enforced via partial unique indexes)

**`user_activity_events`** — append-only log driving streaks/retention
- `id`, `user_id`, `event_type` (text: `onboarding_completed`, `question_answered`, `poll_completed`, `share_completed`, `news_opened`, `identity_verified`, `voter_verified`, `address_added`, `avatar_uploaded`, `demographics_updated`, `match_viewed`, `election_viewed`, `donor_viewed`, `scoring_viewed`, `quiz_retaken`, `referral_signup`), `payload` (jsonb), `created_at`, `day_key` (date, generated — for streak windowing)
- Indexes: `(user_id, created_at desc)`, `(user_id, event_type, day_key)`

**`badge_progress`** (optional but useful for "next badge" cards)
- `user_id`, `badge_slug`, `current_value`, `target_value`, `updated_at` — recomputed by awarder

### Grants & RLS
- `badge_definitions`: GRANT SELECT to anon+authenticated (catalog is public); admin-only writes via service role.
- `user_badges`: GRANT SELECT to authenticated (own + public profiles via existing profile visibility), INSERT only via service role. Policy: `SELECT USING (user_id = auth.uid() OR EXISTS public profile)`.
- `user_activity_events`: GRANT SELECT to authenticated for own rows only; INSERT via RPC `log_user_event` (security definer, validates `auth.uid() = user_id`).
- `badge_progress`: same as `user_badges`.

### Seed data
All ~40 badges from the doc inserted with category, tier, criteria JSON, and icon. MVP six marked `priority=1`.

## 2. Server-side awarding engine

**`log_user_event(p_event_type text, p_payload jsonb)` RPC** (SECURITY DEFINER)
- Validates `auth.uid()`, inserts into `user_activity_events`, then calls `evaluate_badges(auth.uid(), event_type, payload)`.

**`evaluate_badges(user_id, event_type, payload)` function**
- Switch on event_type → call dedicated checker per badge family:
  - `check_onboarding_badges` — First Step, Onboarding Graduate, Priority Picker, Federal Foundations, Local Lens, Address Added, Profile Photo, Demographics Complete
  - `check_identity_badges` — Identity Verified, Registered Voter
  - `check_question_progress` — recomputes % answered against scope-appropriate denominator (federal vs local from `_candidate_office_class` analog for user; uses `user_topics.scope`); awards Curious Citizen → Full Ballot ladder
  - `check_topic_badges` — Topic Starter / Halfway / Specialist per topic_id in payload; awards Balanced Ballot when ≥5 starters, All-Issues Explorer when every in-scope topic has ≥1
  - `check_engagement_badges` — queries `user_activity_events` windows: Comeback Voter (gap ≥7d + new answer), Weekly Pulse (3 distinct day_keys in 7d), Civic Streak (7 consecutive day_keys), Monthly Check-In (event in new calendar month), Fresh Perspective (quiz_retaken with answer change), News Reader (≥3 news_opened in 24h)
  - `check_social_badges` — Conversation Starter, Match Messenger, Donor Detective, First Share, Civic Inviter, Community Builder
  - `check_engagement_misc` — First Match, Poll Participant, Election Ready, Money Trail, Score Explorer
  - `check_candidate_badges` — runs on candidate-profile events (Profile Claimed, Platform Builder, Platform Complete, Evidence Added, Finance Synced); uses claimed_user_id from `profile_claims`

- Each checker inserts into `user_badges` `ON CONFLICT DO NOTHING` (idempotent). Updates `badge_progress` rows.
- Emits a row to `pending_badge_notifications(user_id, badge_slug, created_at)` for the client to consume.

### Anti-gaming rules
- One-time badges enforced by unique `(user_id, badge_slug)`.
- Share badges keyed by `share_target_id` in metadata so each unique target counts once.
- Streaks count distinct `day_key`, not raw events.
- Question-progress recomputed only when `question_answered` event for a *new* `(user_id, question_id)` pair (uses existing `quiz_answers` unique constraint).

### Backfill
One-time SQL to award existing users badges they already qualify for: onboarding, federal/local quiz, ID.me, address, avatar, demographics, % ladder, topic specialists, profile_claims-derived candidate badges.

## 3. Client integration

### Event emission hooks (`src/lib/badges.ts`)
Small wrapper `logEvent(eventType, payload)` calling the RPC. Wire into:
- `Onboarding.tsx` — onboarding_completed, priority_picker (topic selection), address_added
- `Quiz.tsx` — question_answered (on every save_quiz_results call, pass topic_ids + total_answered); quiz_retaken when changing prior answer
- `Auth.tsx` / sign-up flow — first_step (via handle_new_user already; trigger awards on profile insert directly)
- `AvatarUpload.tsx` — avatar_uploaded
- `EditProfileDialog.tsx` / `DemographicsForm.tsx` — demographics_updated (checker computes completeness)
- ID.me + voter-verify callbacks — identity_verified, voter_verified
- `Share*Button.tsx` family — share_completed with `{target_type, target_id}`
- `Poll.tsx` submit — poll_completed
- `UpcomingElectionsCard.tsx` open — election_viewed
- `DonorProfile.tsx`, `CommitteeProfile.tsx`, `TopSpenders.tsx` mount — donor_viewed
- `HowScoringWorks.tsx` / AIExplanation open — scoring_viewed
- `CandidateCard` first personalized view → match_viewed
- `RelevantNewsFeed` article click → news_opened
- `PoliticianDashboard` (claimed candidate flows) → candidate-side events

### UI
- **`useBadges(userId)` hook** — fetches earned + progress.
- **`<BadgeShelf />`** on `UserProfile.tsx` and `PoliticianDashboard.tsx` (separate candidate family) — grid grouped by category, locked badges shown desaturated with progress bar.
- **`<NextBadgeCard />`** on profile + post-quiz screen — shows nearest unearned badge with progress.
- **`<BadgeAwardToast />`** — `BackgroundProcessingContext`-style global listener polls `pending_badge_notifications` (or realtime subscribe), shows celebratory toast/modal, then deletes the notification row.
- **`/badges/:slug`** public deep link — shareable badge page.
- New share template for badge awards (extends `src/components/share/templates/`).

## 4. Phased rollout

1. **Phase 1 (MVP, ~1 day):** Migration + seed + RPC + hooks for the 6 MVP badges + shelf + toast.
2. **Phase 2:** Topic-depth + question-progress ladder + engagement-misc (Poll Participant, First Match, Election Ready, Money Trail, Score Explorer).
3. **Phase 3:** Activity log + streak checkers (Comeback, Weekly Pulse, Civic Streak, Monthly, Fresh Perspective, News Reader).
4. **Phase 4:** Social/advocacy (share-target keyed) + referral plumbing (Community Builder requires referral_code on signup).
5. **Phase 5:** Candidate badges on `PoliticianDashboard`.
6. **Phase 6:** Backfill + analytics dashboard tab in `Admin.tsx` (award counts, funnel impact).

## Technical notes

- All checkers run inline in `log_user_event` for instant feedback; heavy ones (streaks, % recompute) protected with `pg_try_advisory_xact_lock(hashtext(user_id::text))` to avoid race double-awards.
- Question-progress denominator: counts `questions` rows joined to `topics` with `scope` matching user's scope (federal officials → 6 federal topics' questions; local-only users → 5 local topics). Cached in a small MV `question_totals_by_scope` refreshed when questions change.
- Candidate badges write to `user_badges` keyed to the *claimed* user_id (via `profile_claims`), not to candidate rows — avoids the politician-tampering trigger.
- All event logging is fire-and-forget from the client; failures never block the user action.
- Realtime: subscribe to `pending_badge_notifications` inserts filtered by `user_id = auth.uid()` so toasts feel instant.

## Out of scope (flagged for later)
- Leaderboards / points redemption (schema includes `points` but no UI).
- Seasonal/limited-time badges.
- Email notifications on award.
