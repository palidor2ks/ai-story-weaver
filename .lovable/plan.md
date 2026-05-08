## Issue

The badge tooltips (incumbent star, tier shield, confidence icon) on `CandidateCard` get clipped because the card root has `overflow-hidden` (line 83 of `src/components/CandidateCard.tsx`). Radix tooltips render via portal but only escape if no ancestor clips them — `overflow-hidden` here blocks the top edge.

## Fix

In `src/components/CandidateCard.tsx`, remove `overflow-hidden` from the Card's className. The card uses `rounded-2xl` which already visually contains content; the only thing previously clipped were hover effects, which still render correctly without it.

If any hover/scale effect actually needs clipping, wrap the inner content area (not the whole card) in an `overflow-hidden` div instead, so the tooltip portal layer remains free.

No other files need changes.
