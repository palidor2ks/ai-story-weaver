// Conduit (pass-through payment processor) detection for donor display.
//
// Conduits like ActBlue/WinRed process earmarked donations on behalf of
// individual donors; they are not donors themselves. Donor rows under these
// names carry $0 (the importers zero them) and are excluded from candidate
// donor lists — the individuals behind the money are listed instead, and no
// aggregated conduit amount is shown (product decision, 2026-06-12).
//
// Keep the list in sync with supabase/functions/_shared/conduits.ts (edge
// runtime copy — Vite and Deno cannot share a module).

export const CONDUIT_NAMES = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];

export interface ConduitCheckable {
  name?: string | null;
  display_name?: string | null;
  is_conduit_org?: boolean | null;
}

export const isConduitName = (name: string | null | undefined): boolean => {
  if (!name) return false;
  const upper = name.toUpperCase();
  return CONDUIT_NAMES.some((c) => upper.includes(c));
};

// DB flag first (authoritative once backfilled), name match as the fallback
// for rows written before the importers set the flag.
export const isConduitDonor = (d: ConduitCheckable): boolean =>
  Boolean(d.is_conduit_org) || isConduitName(d.display_name || d.name);
