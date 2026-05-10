## Goal

When a user enters an address during onboarding in a state that admins have hidden (not yet supported), show a friendly notice — but let them complete onboarding and use the rest of the app normally (national executives, local candidate flow, quiz, etc.).

## Behavior

1. In the demographics step of onboarding, after the user picks/validates an address:
   - Extract the state code from `AddressAutocomplete`'s validation result (it already returns `state`).
   - Compare against `useHiddenStates().isHidden(state)`.
   - If hidden, render an inline informational banner under the address field:
     > "{StateName} isn't fully supported yet. You can still complete the quiz, see national candidates (President, etc.), and your local candidate requests will be saved for when we launch in your state."
   - The banner is non-blocking — the form remains submittable and onboarding proceeds normally.

2. No changes to Feed/Candidates filters. They already filter on `isHidden(c.state)`, which naturally:
   - Hides hidden-state officials/candidates from the lists.
   - Leaves national executives (President, with state `US`/null) visible.
   - Leaves the local candidate request/upcoming-elections process working as-is.

3. No gating added anywhere. The user retains full access to onboarding quiz, national content, parties, and local candidate workflows.

## Technical Notes

- Files to touch:
  - `src/components/DemographicsForm.tsx` — accept the validated address state code from `AddressAutocomplete.onAddressSelect` (already passed via `details`), store it in local component state, and render the banner using `useHiddenStates`.
  - Optionally lift state code into the submitted payload only if needed; for now this is purely a UI notice (no schema change).
- Use existing `useHiddenStates` hook; no new queries.
- Style: use a `bg-muted/50 border border-border` rounded card with an `Info` icon from lucide-react, semantic tokens only (no hardcoded colors).
- No backend or business-logic changes.

## Out of Scope

- Persisting a "supported state" flag on the profile.
- Changing how Feed/Candidates filter hidden states.
- Email capture / waitlist for unsupported states (can be a follow-up).
