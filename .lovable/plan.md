# Add quick definitions to each topic

Topics live in the `topics` table but have no description column. The set is fixed (12 federal + 5 local). Hardcode short one-line definitions client-side keyed by topic id — no migration needed, no extra fetch.

## Changes

1. **New file `src/lib/topicDescriptions.ts`** — map of `topicId → string` with a one-line plain-English definition for all 17 topics (12 federal: civil-rights, defense, economy, education, environment, foreign-affairs, government, healthcare, immigration, judicial, social-programs, technology; 5 local: local-cost-of-living, local-education, local-housing, local-public-health, local-public-safety). Export a helper `getTopicDescription(id)` returning the string or `''`.

2. **Update `src/components/TopicSelector.tsx`** — render the description below the topic name in smaller muted text (`text-[10px] text-muted-foreground`, 2-line clamp), so users see what each topic covers while selecting.

That's it — no DB changes, no other components touched.
