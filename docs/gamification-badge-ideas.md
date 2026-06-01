# Gamification Badge Ideas

This document outlines badge opportunities for gamifying the app around profile completion, civic learning, identity trust, and ongoing engagement.

## Badge design principles

- **Reward useful actions, not vanity clicks.** Badges should increase profile quality, match accuracy, verified trust, or civic participation.
- **Use milestone ladders where progress is naturally numeric.** Question completion, topic coverage, profile fields, and sharing/referral actions work well as tiered achievements.
- **Separate one-time achievements from repeatable streaks.** One-time badges recognize setup milestones; streaks and seasonal badges encourage return visits.
- **Avoid partisan language.** Badge names should feel civic, neutral, and encouraging.
- **Make each trigger auditable.** Store the event, trigger payload, awarded timestamp, and source surface so support can explain why a user earned a badge.

## Core badge opportunities

| Badge | Trigger | Why it matters |
| --- | --- | --- |
| First Step | User completes account creation and reaches the authenticated app. | Introduces the achievement system immediately. |
| Onboarding Graduate | User completes the onboarding flow. | Confirms they reached the app's core value loop. |
| Priority Picker | User selects their initial priority topics. | Reinforces topic-based personalization. |
| Federal Foundations | User completes the federal onboarding quiz. | Matches the existing federal quiz step. |
| Local Lens | User selects local topics and answers local onboarding questions. | Encourages location-aware matching and local civic learning. |
| Identity Verified | User completes ID.me identity verification. | Makes trust and authenticity visible. |
| Registered Voter | User completes voter verification. | Rewards high-signal civic verification. |
| Demographics Complete | User fills every demographic/profile field that the product considers optional-but-useful. | Improves aggregate insights while letting users see completion progress. |
| Address Added | User saves a usable address/location. | Unlocks local officials, elections, and voter verification paths. |
| Profile Photo | User uploads an avatar. | Increases profile personalization and completion. |
| First Match | User views their first personalized candidate/representative match after answering questions. | Rewards the first moment of app payoff. |
| First Share | User shares their profile, quiz results, candidate card, or donor card. | Encourages distribution without requiring users to invite contacts directly. |
| Poll Participant | User completes a poll. | Rewards lightweight civic participation outside the quiz loop. |
| Election Ready | User views upcoming elections or election details for their address. | Nudges users toward actionable civic awareness. |
| Money Trail | User views donor, committee, or top-spender details. | Encourages exploration of campaign-finance transparency features. |
| Score Explorer | User opens a scoring explanation or “how scoring works” surface. | Rewards understanding how matches are calculated. |

## Question-progress badges

Award these from the total number of canonical questions answered, excluding skip-only answers if the product wants to measure substantive completion.

| Badge | Trigger |
| --- | --- |
| Curious Citizen | 10% of available questions answered. |
| Issue Scout | 25% of available questions answered. |
| Halfway Heard | 50% of available questions answered. |
| Policy Regular | 75% of available questions answered. |
| Full Ballot | 100% of available questions answered. |

## Topic-depth badges

These should be awarded per topic, so a user can collect multiple versions of the same achievement.

| Badge | Trigger |
| --- | --- |
| Topic Starter | User answers the first question in a topic. |
| Topic Halfway | User answers at least 50% of a topic's questions. |
| Topic Specialist | User answers every available question in a topic. |
| Balanced Ballot | User earns Topic Starter in at least five topics. |
| All-Issues Explorer | User answers at least one question in every active policy topic. |

## Engagement and retention badges

| Badge | Trigger |
| --- | --- |
| Comeback Voter | User returns after 7+ days and answers another question. |
| Weekly Pulse | User answers questions or polls on three different days in one week. |
| Civic Streak | User completes an eligible action 7 days in a row. |
| Monthly Check-In | User updates answers, demographics, or verification status in a new month. |
| Fresh Perspective | User retakes a topic quiz and changes at least one answer. |
| News Reader | User opens multiple relevant-news stories from a representative or candidate page. |

## Social and advocacy badges

| Badge | Trigger |
| --- | --- |
| Conversation Starter | User shares any generated card or result. |
| Match Messenger | User shares a candidate or representative match. |
| Donor Detective | User shares donor or committee information. |
| Civic Inviter | User sends an invite/referral link. |
| Community Builder | A referred user signs up and completes onboarding. |

## Candidate and official account badges

If candidates or public officials can claim profiles, use a separate badge family so public-account achievements do not mix with voter achievements.

| Badge | Trigger |
| --- | --- |
| Profile Claimed | Candidate/official claim is approved. |
| Platform Builder | Candidate answers their first policy question. |
| Platform Complete | Candidate reaches 100% answer coverage for active questions. |
| Evidence Added | Candidate/admin attaches evidence or source context to an answer. |
| Finance Synced | Candidate profile has refreshed FEC/finance data. |

## Implementation notes

- Start with a `badge_definitions` table for metadata and a `user_badges` table for awards. Include `slug`, `name`, `description`, `category`, `tier`, `icon`, `points`, `is_repeatable`, and `active` on definitions.
- Use a small badge-awarding service or Supabase function that accepts product events such as `onboarding_completed`, `question_answered`, `profile_updated`, `identity_verified`, `poll_completed`, and `share_completed`.
- Recompute percentage badges whenever question totals change, because adding new canonical questions can change completion percentages.
- Show badges in three places: a profile “badge shelf,” inline celebratory toasts/modals immediately after award, and progress cards that preview the next badge.
- Keep badge copy short in the UI, but maintain longer internal descriptions for analytics and support.

## Suggested MVP

1. **Onboarding Graduate** for completing onboarding.
2. **Federal Foundations** for completing the onboarding quiz.
3. **Identity Verified** for ID.me success.
4. **Demographics Complete** for fully filled demographic/profile data.
5. **Question-progress ladder** at 10%, 25%, 50%, 75%, and 100% answered.
6. **Topic Specialist** for completing all questions in any single topic.
7. **First Share** for sharing profile/results content.
8. **Poll Participant** for completing a poll.
