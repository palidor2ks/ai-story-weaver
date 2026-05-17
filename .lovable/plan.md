## Goal
On donor profiles where the donor type is `Individual` (e.g., Jeffrey Yass), hide the entire "Contribution History" section. Keep it visible for PACs and Organizations where it still adds value.

## Change
**File:** `src/pages/DonorProfile.tsx`

Wrap the entire `Contribution History` section (lines ~809–end of that `<section>`) in a conditional:

```tsx
{donor.type !== 'Individual' && (
  <section>
    {/* Contribution History header, filters, table, etc. */}
  </section>
)}
```

Also skip the related contribution data fetch and computations when the section is hidden — keep it simple by just not rendering; the `contributions` query already runs but the output is unused for individuals. (No perf concern worth a refactor here.)

## Out of scope
- No changes to Top Recipients, Top Contributors, header stats, or PAC profiles.
- No data model / backend changes.
