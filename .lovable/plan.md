## Lock Quiz Question Header on Scroll

The yellow-highlighted area (topic label + "Question X of Y" + progress bar + question text) should stay pinned at the top of the viewport while the user scrolls through the answer options.

### Current state
- **Onboarding federal quiz** (`src/pages/Onboarding.tsx` line 578) and **local quiz** (line 729) already wrap this header in `sticky top-0 z-20 ...`. The screenshot still shows the old "24" counter, so it likely predates the most recent changes — we'll verify sticky is actually pinning in the live preview and fix the wrapper if not (e.g., ensure no ancestor breaks sticky, tighten `-mx-4 px-4` padding, give it a solid background).
- **Standalone `/quiz` route** (`src/pages/Quiz.tsx` lines 314–327) does NOT have a sticky header — topic chip, counter, progress bar and question text all scroll away. This is the primary fix.

### Changes

**`src/pages/Quiz.tsx`** — wrap topic title + question header + question text in a sticky container, and tell `QuizQuestion` to hide its internal header/question text:

```
<div className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-4 bg-background/95 backdrop-blur
                supports-[backdrop-filter]:bg-background/80 border-b border-border">
  {currentTopic && (
    <div className="flex items-center justify-center gap-2 mb-3">
      <TopicIcon name={currentTopic.icon} />
      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {currentTopic.name}
      </span>
    </div>
  )}
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-medium text-muted-foreground">
      Question {currentQuestionIndex + 1} of {questions.length}
    </span>
    <div className="flex-1 mx-4 h-2 bg-secondary rounded-full overflow-hidden">
      <div className="h-full bg-gradient-hero transition-all duration-500"
           style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} />
    </div>
  </div>
  <h2 className="font-display text-lg md:text-xl font-semibold text-foreground
                 leading-snug text-center">
    {questions[currentQuestionIndex].text}
  </h2>
</div>

<div className="mt-6">
  <QuizQuestion ... hideHeader hideQuestionText />
</div>
```

- Derive `currentTopic` via `topics.find(t => t.id === questions[currentQuestionIndex].topicId)` (mirrors the `currentQuestionTopic` memo in Onboarding).
- Keep the existing "Full Quiz / Quick Quiz" title above the sticky bar (non-sticky) so the pinned area stays compact.

**`src/pages/Onboarding.tsx`** — verify the existing sticky bar (line 578 federal, line 729 local) actually pins in the preview. If it doesn't:
- Confirm no ancestor sets `overflow-hidden` / `transform` (containing block for sticky).
- If needed, lift the sticky wrapper out from `max-w-2xl mx-auto` or remove `-mx-4 px-4` in favor of a full-width pinned bar with inner `max-w-2xl` content.

### Out of scope
- No changes to question selection logic, scoring, or data flow.
- No restyle of the answer cards or footer nav.
