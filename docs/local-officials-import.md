# Local officials import

Bulk-load municipal council members (and mayors) into `static_officials` so the
civic lookup can attribute and **ward-filter** them. Admin only.

UI: **Admin → Officials → "Import Local Officials"**. Paste CSV or JSON, preview
with **Dry run**, then **Import**.

## Columns / fields

| field        | required | example                              | notes |
| ------------ | -------- | ------------------------------------ | ----- |
| `state`      | yes      | `NJ`                                 | 2-letter USPS code |
| `city`       | yes      | `Piscataway`                         | municipality name (as it geocodes) |
| `name`       | yes      | `Frank Uhrin`                        | |
| `seat`       | yes      | `Ward 1` / `District 9` / `At-Large` / `Mayor` | drives office + district |
| `party`      | no       | `Democrat`                           | D/R/I/other; defaults to Other |
| `office`     | no       | `Council Member, Piscataway (Ward 1)`| overrides the auto-generated office label |
| `websiteUrl` | no       | `https://…`                          | |
| `imageUrl`   | no       | `https://…/photo.jpg`                | direct headshot URL |

### How `seat` maps

- `Ward N`  → `district = "Ward N"` (ward-filtered to that ward)
- `District N` → `district = "District N"` (filtered to that council district)
- `At-Large` → `district = "At-Large"` (always shown city-wide)
- `Mayor`   → `district = null`, office `Mayor of {city}` (always shown)

Matching to a user is by the **integer** in the seat, so the number here must
match what the city's boundary layer reports.

## CSV example

```csv
state,city,name,seat,party
NJ,Piscataway,Frank Uhrin,Ward 1,Democrat
NJ,Piscataway,Dennis Espinosa,Ward 2,Democrat
NJ,Piscataway,Sharon Carmichael,Ward 3,Democrat
NJ,Piscataway,Michele Lombardi,Ward 4,Democrat
NJ,Piscataway,Gabrielle Cahill,At-Large,Democrat
NJ,Piscataway,Brian Wahler,Mayor,Democrat
```

## JSON example

```json
{ "rows": [
  { "state": "TX", "city": "Austin", "name": "Ryan Alter", "seat": "District 5", "party": "Democrat" }
] }
```

## IDs (deterministic — re-importing updates in place)

- council member: `local_<state>_<city>_council_member_<name>`
- mayor: `mayor_<state>_<city>`

## Boundary pre-seeding

After import, for each new city the importer searches for an authoritative
ward/council-district boundary service:

- **Government / trusted-owner source** → stored in `district_boundary_overrides`
  (authoritative, high confidence) so resolution is exact.
- **Community source** → parked in `district_boundary_sources` (low confidence,
  `approved = null`) for an admin to review and promote.

Trust the owner of an ArcGIS source by adding its username or org id to
`trusted_gis_owners`. Force-trust or block a cached source via
`district_boundary_sources.approved` (`true` / `false`).
