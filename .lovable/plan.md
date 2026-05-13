# Shareable Polls Feature

## Goal
Let admins generate polls (with AI assist), share them on social media, drive traffic to a public poll page, capture anonymous answers, then prompt the respondent to create an account (carrying social profile data when possible).

## Poll Types
Admin can create any of three formats:
1. **Single multiple-choice** (Twitter-style, 2–5 options, no scoring impact)
2. **Single scored question** (-10..+10, snaps to discrete values, integrates with quiz scoring)
3. **Mini-quiz** (3–5 scored questions, results page at the end)

## User Flow
1. Admin opens new **Polls** tab in Admin → clicks "New Poll"
2. Picks poll type + topic (optional) → enters prompt → AI drafts question(s) + options → admin edits → publishes
3. System returns shareable URL (`/poll/:slug`) with auto-generated OG image (question + branding)
4. Admin clicks share buttons (X, Facebook, LinkedIn, Copy link) — uses existing `shareIntents.ts`
5. Visitor lands on `/poll/:slug` → answers question(s) anonymously (stored against an anon session id in localStorage)
6. After submit: results screen shows live tally + their score (for scored polls) → CTA "Create your political profile" with Google / Facebook / X / Email buttons
7. On signup, anonymous answers are merged into their account (and into `quiz_answers` for scored questions, so they count toward their profile)

## Quiz Library Integration
- Scored poll questions are saved to the questions table with a `source = 'poll'` flag and `include_in_politician_quiz = false`
- They appear in the Quiz Library so logged-in users can revisit them
- They are **excluded** from the bulk question list politicians/candidates need to answer

## Technical Section

### Database (new tables)
- `polls`: id, slug (unique), type ('mc' | 'scored' | 'mini_quiz'), title, description, topic_id (nullable), created_by, status ('draft'|'published'|'closed'), og_image_url, published_at, created_at
- `poll_questions`: id, poll_id, question_id (FK to existing `questions` for scored types) OR inline text+options for MC type, order_index
- `poll_responses`: id, poll_id, anon_session_id (nullable), user_id (nullable), submitted_at, source (utm/referrer)
- `poll_response_answers`: id, response_id, poll_question_id, selected_option_id, value
- Add to `questions`: `source TEXT DEFAULT 'standard'`, `include_in_politician_quiz BOOLEAN DEFAULT true` — backfill existing rows to `true`
- RLS: polls readable when `status='published'`; responses insertable by anyone (anon allowed); admins manage everything via `has_role`

### Edge Functions
- `generate-poll-questions` — calls Lovable AI Gateway (gemini-2.5-flash) with structured JSON output to draft question + options matching selected type/topic
- `generate-poll-og-image` — renders branded PNG via existing share-image infrastructure on first publish, stored in `poll-og` storage bucket
- `claim-anon-poll-responses` — on signup, takes anon_session_id, attaches user_id, copies scored answers into `quiz_answers`

### Frontend
- `src/pages/admin/tabs/PollsTab.tsx` — list, create, edit, publish, copy-link, view results
- `src/components/admin/PollEditor.tsx` — type picker, AI prompt box, editable question/options, preview
- `src/pages/Poll.tsx` (`/poll/:slug`) — public page, SEO meta + OG, renders poll, submits anonymously
- `src/pages/PollResults.tsx` — tally + signup CTA
- `src/components/poll/PollSignupPrompt.tsx` — Google/FB/X/Email auth buttons, passes anon_session_id

### Social Login
- Google enabled now via Supabase Auth (user must add OAuth credentials in Supabase dashboard)
- Facebook + X / Twitter listed as "Coming soon" buttons until user adds OAuth credentials in Supabase (each requires dev-console setup)
- On OAuth callback: pull `user_metadata.full_name`, `avatar_url`, `email` and prefill profile

### Anonymous → User Merge
- Anon session id = `crypto.randomUUID()` stored in `localStorage` on first poll visit
- On signup completion in `AuthContext`, if a pending anon_session_id exists, call `claim-anon-poll-responses`

## Out of Scope (this plan)
- Geographic targeting of polls
- Comment threads on poll results
- Embeddable poll widget for external sites
- Real-time updating tallies (will refresh on page load only)

## Confirmation Needed
After you approve, I'll also need you to:
1. Enable Google provider in Supabase Auth (dashboard) — I'll provide the redirect URL
2. Optionally set up Facebook + X OAuth apps later if you want those too
