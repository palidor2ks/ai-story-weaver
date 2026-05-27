Revert the donor-filter change in `src/hooks/useCommittees.ts`:

1. Remove the `NON_DONOR_LINE_NUMBERS` constant.
2. Remove the `.or('line_number.is.null,line_number.not.in.(...)')` filter from the contributions query so all rows are pulled again.
3. Remove `line_number` from the `ContributionRow` type (added in the prior change).

No other files affected. Vendor refunds (line 15) and memo aggregates (11AI) will once again appear in committee donor lists, as they did before.