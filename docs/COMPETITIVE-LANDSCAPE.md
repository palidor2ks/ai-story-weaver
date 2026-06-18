# Competitive Landscape

> Who we compete with, where we're strong, and where we're vulnerable.
> Updated: 2026-06-17

## The biggest competitor: iSideWith

**iSideWith** dominates the alignment-quiz space. Founded 2008, millions of users, high brand
recognition. Their core product (match yourself to candidates on a 2D political spectrum) is the
de facto standard for "take the alignment quiz."

### iSideWith's strengths
- **Historical corpus.** They've collected thousands of candidate responses over 16 years. New
  candidates auto-match against this archive; users see *responsive* results even for races where
  candidates haven't answered questions.
- **Network effects.** They're the "default" quiz everyone takes. This creates a feedback loop:
  more users → more incentive for campaigns to participate → more questions answered → better
  results → more users.
- **Breadth of coverage.** International (US, EU, Canada, others). Federal + state + local races.
- **Brand & UX.** Slick interface. Recognized name. Mobile app.
- **Campaign integration.** Candidates know to answer; campaigns use their quiz in outreach.

### iSideWith's weaknesses
- **Data accuracy not a selling point.** They're cavalier about candidate positioning. Answers can
  be years old, AI-inferred, or absent entirely — users don't know which. Their FAQ doesn't
  emphasize accuracy; it emphasizes "fun" and "fast."
- **Not transparent about data quality.** No audit trail. No "this answer is X months old" or
  "this is from a press release, not an interview." Stale or wrong data sits silently.
- **Stuck in Web 1.0 UX in places.** Mobile experience lags. Some features feel like they
  haven't been updated in 10 years.

## Secondary competitors

### Vote411.org
**League of Women Voters.** Nonpartisan, authoritative, trusted. Focus is voter guidance, not
entertainment. They provide questionnaires to candidates and publish side-by-side comparisons.

- **Strengths:** deep credibility, official non-profit status, no-nonsense tone, verified candidate
  responses (LWV follows up if candidates don't answer).
- **Weaknesses:** boring UI, tedious to navigate, not designed for engagement, limited to general
  election cycle only.

### Ballotpedia
**Candidate information + voting records.** Not primarily an alignment tool, but owns the space
for "look up what a candidate actually voted on." Strong on state legislature + local races.

- **Strengths:** hyper-accurate voting records, comprehensive candidate profiles, obsessive detail.
- **Weaknesses:** designed for research, not matching; no interactive quiz; steep learning curve
  for casual users.

### State-specific voter guides
Various state & local organizations (League of Women Voters chapters, state election offices,
local civic tech startups). High trust in their region, low visibility outside it.

## PoliPulse's position

### Our differentiation: data integrity as a product feature
**This is our only defensible moat against iSideWith.** We will win if we make users trust
*how we know* candidates' positions, not just *what they are*.

**Concrete signal:** every position shows its source (voting record link, official statement URL,
press coverage). Users can audit us. iSideWith can't say "here's the link" for half their data
because they don't have it.

### Where we're strong
1. **Verified data as competitive advantage.** We ground alignment in:
   - **Voting records** (Congress.gov, official state databases) — fact-checkable.
   - **FEC finance data** — public record, reconcilable.
   - **Official statements** (RSS feeds from member websites, Vault-stored) — primary source.
   - **Sourced candidate answers** (URL-required, not just description) — auditable.

2. **Local + federal.** Not trapped in presidential/House races. We can match voters to their
   state/local candidates too.

3. **Modern tech stack.** Supabase + React + edge functions = fast iteration, fresh UX, mobile-friendly
   by design.

4. **Small & focused.** We're not trying to be "the quiz for everything"; we're building "the
   quiz you can trust."

### Where we're vulnerable
1. **Network effects.** iSideWith has 16 years of users taking the quiz. We have months. Their
   brand is synonymous with alignment quizzes; ours isn't yet.

2. **Coverage depth.** iSideWith has thousands of answered questions per candidate. We're starting
   from ~30–100 per candidate. Breadth comes later.

3. **Campaign participation.** Campaigns know to answer iSideWith's questionnaire. We're not on
   their radar yet. This is solvable (better outreach) but not solved.

4. **Data coverage vs. accuracy trade-off.** We prioritize accuracy over breadth. This means we
   ship fewer candidates verified than iSideWith shows. This is **correct** (better to match 20
   verified candidates than 200 semi-guessed ones), but it feels like a loss to users until we
   explain it.

## Strategic implications

### What we should NOT do
- **Try to out-iSideWith iSideWith.** We can't win on breadth, network effects, or brand in the
  short term. Trying to copy their model loses our only edge.
- **Compete on speed.** Our competitive advantage requires diligence (verification, sourcing,
  auditing). This means slower, not faster, than iSideWith.

### What we SHOULD do
1. **Make data integrity visible.** Every candidate position shows "Verified from voting record
   (Congress.gov, 2025-11-15)" or "From official statement (house.gov RSS, 2026-06-10)." Auditable,
   dated, sourced.

2. **Focus on high-trust use cases first.** Not "be the default quiz for everyone," but "be the
   quiz that primary voters / local-race voters / informed voters trust." Build depth in one
   vertical before expanding.

3. **Build the campaign loop.** Campaigns should know: "PoliPulse is where voters can verify your
   real positions. You control the narrative here; iSideWith guesses."

4. **Own "accuracy" messaging.** In a world of AI and misinformation, "this data is verified and
   auditable" is a *feature*, not a limitation.

## Monitoring

Track these metrics to stay aware of competitive threats:
- **iSideWith activity:** Do they add a sourcing/dating feature? Do they start linking to voting
  records? (Signal: they're copying our moat.)
- **Media coverage:** Who are journalists sending voters to for alignment? Is it still just
  iSideWith? (Opportunity to pitch PoliPulse as the "trustworthy alternative.")
- **Campaign adoption:** Do campaigns start mentioning PoliPulse or linking to us? (Signal we're
  becoming real.)
- **User feedback:** What do users say they can't find? Are they comparing us to iSideWith? How?
  (What features matter vs. what's just habit.)
