## Change

In `src/pages/CommitteeProfile.tsx`, the "Donor Details" table (around line 364) renders each donor name as plain text. Wrap it in a `<Link to={`/donor/${donor.id}`}>` matching the style already used in the top donors grid above (line 283), so clicking a donor row name navigates to that donor's profile page.

- Add hover styling (`hover:text-primary hover:underline`) for affordance.
- Keep the rest of the row (employer/occupation, location, amount, etc.) unchanged.
- No backend or data changes — `donor.id` is already available and `/donor/:id` route already exists.