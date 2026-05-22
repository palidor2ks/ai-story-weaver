## Plan: Vendor refund exclusion system

Hide media-buy / ad-vendor refunds (like Waterfront Strategies, GMMB, etc.) from donor lists, donor counts, and top-donor rankings.

### 1. Database migration

Create a new `vendor_refund_organizations` table (mirrors `conduit_organizations`):
- `id uuid pk`, `name text not null unique`, `category text` (media, consulting, fundraising, etc.), `notes text`, `is_active bool default true`, timestamps
- RLS: public read; admin manage; service role full access
- Seed with a starter list: Waterfront Strategies, GMMB, AL Media, Bully Pulpit Interactive, SKDK, Mission Control, Assemble The Agency, Canal Partners Media, Buying Time, Putnam Partners, Devine Mulvey Longabaugh, Screen Strategies Media, Trilogy Interactive, Mothership Strategies

Add `is_vendor_refund boolean default false` to `donors` table, indexed.

Backfill: set `is_vendor_refund = true` for `donors` where `type = 'Organization'`, `line_number IN ('15','17')`, and name matches any active vendor (case-insensitive, with %wildcards on punctuation variants).

### 2. Read paths — exclude tagged donors

Update these to filter out `is_vendor_refund = true`:
- `src/hooks/useDonorsPaginated.ts` (committee donor list on `/committee/:id`)
- Any donor list / top-donor query on donor profile and global donor pages
- Refresh `committee_finance_rollups.donor_count` so vendor refunds don't inflate counts (recompute via existing rollup function or a small SQL update in the migration)

### 3. Importer updates

- `supabase/functions/import-donors-csv` and FEC sync paths: after inserting donor rows, set `is_vendor_refund = true` for rows matching the active vendor list (same criteria as backfill). Cache the vendor list once per invocation.

### 4. Admin UI

New panel `src/components/admin/VendorRefundsPanel.tsx` (modeled on `DonorAliasesPanel`):
- List active vendors, add / edit / deactivate
- "Re-tag donors" button → calls a new edge function `retag-vendor-refunds` that re-runs the backfill against current donors
- Wire into `src/pages/Admin.tsx` under the Finance/Donors tab area

### 5. Technical notes

- Matching uses `ILIKE name pattern` with `%` wrapping for resilience to "INC", "LLC", "STRATEGIES, INC" variations
- We only tag `type = 'Organization'` + `line_number IN ('15','17')` so genuine PAC contributions from a similarly-named entity aren't accidentally hidden
- `is_vendor_refund` is reversible — flipping a vendor inactive and re-tagging restores rows
- No changes to `contributions` table (audit trail preserved); only `donors` aggregate gets flagged
