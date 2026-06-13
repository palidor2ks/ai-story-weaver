// Earmark-program rollup ↔ donor-row matching for "by or through" display.
//
// The earmark rollup RPC (get_candidate_earmark_rollups) groups raw FEC
// contributor names per cycle, while donor lists consolidate alias spellings
// (display_name + name_variations). To merge the two, try every known
// spelling of a donor against the rollup index; a matched donor row is
// replaced by the org's ONE combined "by or through" entry (direct dollars +
// member earmarks) so nothing is double-listed. Routed dollars are a labeled
// display lens — never add them into category/list totals.
//
// The RPC now groups by donor_aliases.canonical_name when an active alias
// exists, so multiple raw FEC spellings of the same org (e.g. "AIPAC" vs
// "AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE PAC") consolidate into one row.

export interface EarmarkRollupLike {
  org_label: string;
  cycle: string;
}

export interface RollupMatchableDonor {
  name: string;
  cycle: string;
  display_name?: string | null;
  name_variations?: string[] | null;
}

export const normalizeOrgKey = (name: string) =>
  name.replace(/\s+/g, ' ').trim().toUpperCase();

export const earmarkRollupKey = (orgLabel: string, cycle: string) =>
  `${normalizeOrgKey(orgLabel)}|${cycle}`;

export const buildEarmarkRollupIndex = <T extends EarmarkRollupLike>(
  rollups: T[],
): Map<string, T> =>
  new Map(rollups.map((r) => [earmarkRollupKey(r.org_label, r.cycle), r]));

export const matchEarmarkRollupKey = (
  donor: RollupMatchableDonor,
  index: ReadonlyMap<string, unknown>,
): string | null => {
  for (const spelling of [donor.name, donor.display_name, ...(donor.name_variations ?? [])]) {
    if (!spelling) continue;
    const key = `${normalizeOrgKey(spelling)}|${donor.cycle}`;
    if (index.has(key)) return key;
  }
  return null;
};
