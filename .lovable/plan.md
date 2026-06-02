# Add Profile Section Tabs

Port PR #158 from the `ai-story-weaver` repo into this project's `src/pages/UserProfile.tsx`.

## Change

Wrap the six profile subsections that currently render stacked below the **Overall Score** card in a `Tabs` component, so users can switch between them via a compact tab bar.

### Tabs (in order)
1. `ai-analysis` — AI Political Analysis card (lines ~540–605)
2. `party-alignment` — Party Alignment card (~607–666)
3. `representatives` — Your Representatives card (~668–919)
4. `elections` — `<UpcomingElectionsCard />` (~922)
5. `badges` — `<BadgeShelf />` (~925)
6. `topics` — Your Priority Topics card (~927–955)

### Implementation
- Import `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`.
- Place a single `<Tabs defaultValue="ai-analysis">` immediately after the Overall Score card.
- Scrollable `TabsList` (horizontal overflow on mobile) with the six triggers.
- Move each existing block, unchanged, into its matching `<TabsContent value="…">`. Internal refresh buttons, AI cards, and state remain identical.
- Leave the profile header card, action buttons (View & Share, Answer More Questions, Retake Full Quiz, Reset Onboarding), and avatar/edit controls outside the tabs.

### Out of scope
No design system or copy changes; no logic changes inside any of the moved sections.
