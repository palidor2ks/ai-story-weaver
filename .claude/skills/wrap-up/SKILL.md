---
name: wrap-up
description: Run the PoliPulse end-of-session close-out ritual — append a new HANDOFF entry and prep focused commits. Use when the user is wrapping up, says "let's close out", "wrap up", "end the session", or after finishing a chunk of work that changed code/config/docs.
---

# /wrap-up

The close-out ritual from `CLAUDE.md`. Skipping it is what makes the next session start blind, so
do it whenever this session changed code, config, or docs.

## Steps
1. **Summarize what changed and why** from this session — the *why* matters more than a file
   list. Run `git status` / `git diff --stat` to ground it.
2. **Draft a new entry at the TOP of `docs/HANDOFF.md`** using that file's template:
   - `## YYYY-MM-DD — <session/branch>`
   - **What happened & why**
   - **State** — what's *actually verified* (lint/build/test status; say what you didn't verify)
   - **Next** — exactly ONE concrete next step
   - **Deferred** — parked items so they aren't silently forgotten
   Show the draft and let the user edit before finalizing.
3. **Commit in focused commits** — one logical change each, messages that say *why*. Suggest
   running `/preflight` first if code changed and it hasn't run.
4. If the roadmap shifted, remind to flip a marker / add a dated note in `docs/ROADMAP.md`
   (don't silently rewrite it).

## Rules
- "State" must reflect reality — if tests weren't run, say so; don't claim verification you
  don't have.
- Don't push or open a PR unless the user asks (or the environment requires it).
