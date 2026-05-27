The strange Top Spenders are back because the exclusion rows still exist, but public queries can no longer see/use them.

I checked the shown IDs:
- `C00944025` APPLE INC. DJIA/ SP/DOW USA — already marked excluded as `Junk`
- `C00946087` WARREN BUFFET APPLE INC. — already marked excluded as `Junk`
- `C00945709` SHAWN BETTIS — already marked excluded as `Junk`
- `C00875427` THE COURT OF DIVINE JUSTICE — already marked excluded as `Junk`

## Why they came back
A prior security hardening made `ie_excluded_committees` admin-only, then exposed `ie_excluded_committees_public` as a `security_invoker` view. That protects the base table, but it also means anonymous/public users see an empty exclusion list. Since the Top Spenders rollup view also relies on that exclusion table, public visitors get rollups as if no exclusions exist, so the junk FEC filings reappear.

## Plan
1. **Fix the database exclusion mechanism**
   - Add a safe `SECURITY DEFINER` helper function that checks whether a committee ID is excluded without exposing admin-only columns.
   - Recreate the independent-expenditure rollup views to filter with that helper, so exclusions apply for public users too.
   - Recreate the public exclusion view/RPC so the frontend can fetch only safe fields: committee ID, reason, excluded date.

2. **Seed any missing junk IDs**
   - Keep the four already-excluded junk IDs.
   - Add `C00669259` / `FF PAC` only if you want it excluded too; it appears in the screenshot but has real-looking aggregate volume, so I won’t remove it unless you confirm it is also junk.

3. **No line-number donor filtering changes**
   - This fix is only for Top Outside Spenders / independent expenditures.
   - It won’t reintroduce the prior donor line filters you asked to undo.

4. **Validate after migration**
   - Query the public rollup view for the junk IDs and confirm the four excluded IDs no longer appear.
   - Confirm `/top-spenders` uses the corrected rollup/filter path.