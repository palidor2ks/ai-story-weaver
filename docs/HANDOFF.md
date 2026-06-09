# HANDOFF.md

> The **baton**. Reverse-chronological session log — the **TOP entry is "where we left off."**
> **Read it first** at the start of a session. **Write it last:** before ending ANY session in
> which you changed code, config, or docs, append a new entry to the TOP using the template below.
> The SessionStart hook auto-prints the top entry, so keep it accurate.

## Entry template (copy this, fill it in, put it at the TOP)

```
## YYYY-MM-DD — <session or branch name>

**What happened & why**
<The story, not a file list. WHY did this work happen and what was the intent?
A future reader can diff the files; they can't recover your reasoning.>

**State** (verified)
<What is actually true right now and how you know — e.g. "lint passes, build succeeds,
manual check of X". Say what is NOT verified, too.>

**Next**
<ONE concrete next step — the very next action someone should take.>

**Deferred**
<Parked items / things intentionally not done, so they aren't silently forgotten.>
```

---

## 2026-06-08 — claude/session-continuity-setup-3sNGk

**What happened & why**
Installed a session-continuity system so any future session (human or AI) can resume without
losing context. Added three durable docs — `HANDOFF.md` (this baton), `PROJECT-FACTS.md`
(easy-to-assume-wrong facts + guardrails), `ROADMAP.md` (priorities, ranked) — plus a root
`CLAUDE.md` entry point and a SessionStart hook that auto-prints this top entry. Done because
this is a multi-contributor repo (human + Claude + Lovable bot) where cross-session context
loss and schema drift are already real, recurring problems.

**State** (verified)
Docs created and self-consistent. SessionStart hook merged into `.claude/settings.json`
alongside the existing DB-readiness probe (existing hook preserved) and prints this entry.
Not verified: no automated tests exist in this repo, so "verified" here means files reviewed +
hook output checked by hand, not a passing test suite.

**Next**
On the next real work session, follow the loop: `git fetch origin`, read this entry +
`PROJECT-FACTS.md` + `ROADMAP.md`, then start on Roadmap priority #1 — verifying FEC/finance
data accuracy.

**Deferred**
Decide whether to add a test runner (currently none). Record the production/deployment URL in
`PROJECT-FACTS.md` (still a TODO).
