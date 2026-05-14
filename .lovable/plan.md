## Goal

On the donor profile page, the small "AI" button on each Top Recipient card is currently broken (not clickable) and only shows a stripped-down summary. Make it work exactly like the "AI Analysis" dialog on the donor cards (Donors list page).

## Why it's broken

Each recipient card on `DonorProfile` is wrapped in a React Router `<Link>` (renders an `<a>`). The AI `<Button>` lives inside that `<a>`, plus a `<Dialog>` is also nested inside the link. Browsers treat nested interactive elements oddly — the click frequently bubbles to navigation instead of opening the dialog, and the trigger doesn't reliably register.

## Plan

1. **Extract a shared `DonorAIAnalysisDialog` component** from `DonorCard.tsx`
   - Accepts props: `id`, `name`, `type`, `cycle`, plus a `trigger` render slot (so DonorCard can show the full "AI Analysis" pill button and the recipient cards can show the small "✨ AI" inline button).
   - Owns all fetch/retry/error/loading state and renders the full structured output (summary, party support bars, causes, motivations, deeper analysis, sources, retry, disclaimer).

2. **Refactor `DonorCard.tsx`** to use the new shared component (no behavior change).

3. **Fix the recipient card layout in `DonorProfile.tsx`**
   - Stop wrapping the whole card in `<Link>`. Instead, make the card a `<div>` and put the `<Link>` only around the recipient name/title area (or use `useNavigate` on a click handler on the card body, with the AI button explicitly stopping propagation).
   - Replace the inline mini Dialog with `<DonorAIAnalysisDialog>` using the small "✨ AI" trigger style. Pass the recipient name + cycle; type stays `Organization`.

4. **Remove now-unused state** in `DonorProfile.tsx`: `recipientAnalysis`, `recipientLoadingKey`, `activeRecipientKey`, `fetchRecipientAnalysis`.

## Result

- The AI button on each recipient card opens the dialog reliably (no more swallowed clicks / accidental navigation).
- The dialog shows the same rich content as the donor card AI analysis: party support, causes, motivations, deeper analysis, sources, retry on error.
- Clicking the rest of the card still navigates to the candidate profile.

## Files touched

- `src/components/DonorAIAnalysisDialog.tsx` (new)
- `src/components/DonorCard.tsx` (use shared dialog)
- `src/pages/DonorProfile.tsx` (un-nest button from Link, use shared dialog, drop dead state)
