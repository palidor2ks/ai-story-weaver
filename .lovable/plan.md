## Update Welcome Screen Question Count Copy

Change the static text on the Onboarding welcome card from "Answer 24 Questions / 20 federal + 4 local" to **"Answer 16 Questions / 12 federal + 4 local"**.

### Files
- `src/pages/Onboarding.tsx` (lines 446–447):
  - Heading: `Answer 24 Questions` → `Answer 16 Questions`
  - Subtext: `20 federal questions + 4 local questions` → `12 federal questions + 4 local questions`

### Out of scope
- No changes to question selection logic, DB queries, or quiz flow — only the marketing copy on the welcome card.
