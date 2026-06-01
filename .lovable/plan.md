## Why is Jane Q. Challenger still showing?

She's a placeholder row that was inserted directly into the database (not via a repo migration). The DB currently has 4 `seed_*` candidate rows linked to two municipal elections:

| election | candidate_id | name | party |
|---|---|---|---|
| Piscataway Mayor 2026 | seed_piscataway_mayor_1 | Brian C. Wahler | Democrat (real incumbent) |
| Piscataway Mayor 2026 | seed_piscataway_mayor_2 | **Jane Q. Challenger** | Republican (fake placeholder) |
| Newark Mayor 2026 | seed_newark_mayor_1 | Ras J. Baraka | Democrat (real, though now governor-elect) |
| Newark Mayor 2026 | seed_newark_mayor_2 | **Maria L. Cortez** | Independent (fake placeholder) |

The `UpcomingElectionsCard` is rendering exactly what's in the DB — the "Researching…" state just means the placeholder has no AI answers yet. Nothing in the code is generating her; she's a real DB row from earlier seeding.

## Plan

Write a migration that removes the fake "challenger" seed rows (and their `election_candidates` links) while keeping the real incumbents:

1. `DELETE FROM election_candidates WHERE candidate_id IN ('seed_piscataway_mayor_2','seed_newark_mayor_2');`
2. `DELETE FROM candidates WHERE id IN ('seed_piscataway_mayor_2','seed_newark_mayor_2');`

After this, the Piscataway race will show only Brian C. Wahler until a real opponent is added (manually or via the future scrape/import flow). No frontend changes required.

### Open question

Do you also want me to drop the real incumbents (`seed_piscataway_mayor_1` Wahler, `seed_newark_mayor_1` Baraka)? They're real people but were inserted as throwaway `seed_*` rows — long term they should probably be replaced with proper candidate records from your normal ingestion path. I'd recommend leaving them for now so the card isn't empty.