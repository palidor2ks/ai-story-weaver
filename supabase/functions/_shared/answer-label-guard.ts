// Guard against unverifiable "voting_record" labels — the root cause of the 47k-answer
// relabel on 2026-06-11 (HANDOFF; integrity finding #2). The AI generator labels an answer
// `voting_record` from research prose ("his record in the state legislature indicates…",
// party-affiliation inferences) even when we hold ZERO `candidate_votes` rows for that
// candidate, which (a) lies on the evidence badge and (b) parks the answer in the
// vote-citation enrichment pool it can never be cited from.
//
// Rule: an uncited vote claim for a candidate with no vote data is an inference — demote
// it at write time. A vote claim WITH a source URL is kept: the citation makes it
// checkable even when our (federal-only) vote table can't corroborate it (state votes).

export interface VoteLabelFields {
  evidence_type?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  source_urls?: string[] | null;
}

// A citation only counts if it's a real, non-blank URL string — mirrors isTrustedForScoring
// in src/lib/scoring.ts (a whitespace-only source_url is not provenance).
function hasUrl(a: VoteLabelFields): boolean {
  if (typeof a.source_url === 'string' && a.source_url.trim() !== '') return true;
  return Array.isArray(a.source_urls)
    && a.source_urls.some((u) => typeof u === 'string' && u.trim() !== '');
}

/** Returns new answer objects; never mutates the input. */
export function demoteUnverifiableVoteClaims<T extends VoteLabelFields>(
  answers: T[],
  candidateHasVoteData: boolean,
): T[] {
  if (candidateHasVoteData) return answers;
  return answers.map((a) => {
    const claimsVotes = a.evidence_type === 'voting_record' || a.source_type === 'voting_record';
    if (!claimsVotes || hasUrl(a)) return a;
    return { ...a, evidence_type: 'inferred', source_type: 'other' };
  });
}

// Guard against answers whose stated stance contradicts their numeric value — the root cause
// of the 2026-06-20 inverted-score bug. The research LLM (generate-legislator-answers) returned
// answers whose evidence prose clearly described SUPPORT for a position ("co-sponsored the bill",
// "strong support for…") while emitting a strongly NEGATIVE answer_value (oppose). Those rows
// carried real bill URLs and confidence:high, so they passed isTrustedForScoring and flipped the
// candidate's persisted overall_score to the wrong side of the spectrum (e.g. a Republican shown
// far-left). We can't know which of the two the model actually meant, so an internally
// contradictory answer is untrustworthy — drop it rather than guess a sign.
//
// Rule: stance "support" requires answer_value > 0; "oppose" requires answer_value < 0. A value
// of 0, a "neutral"/"mixed"/absent stance, or an unrecognized stance is NOT a hard sign
// contradiction and is kept (this guard only targets the demonstrated sign-flip failure mode).

export interface StanceFields {
  answer_value?: number | null;
  stance?: string | null;
}

function stanceContradictsValue(a: StanceFields): boolean {
  const v = typeof a.answer_value === 'number' ? a.answer_value : null;
  if (v === null || v === 0) return false;
  const stance = typeof a.stance === 'string' ? a.stance.trim().toLowerCase() : '';
  if (stance === 'support' || stance === 'supports') return v < 0;
  if (stance === 'oppose' || stance === 'opposes') return v > 0;
  return false;
}

/**
 * Split answers into the ones to keep and the internally-contradictory ones to drop, where the
 * model's stated `stance` disagrees with the sign of `answer_value`. Returns new arrays; never
 * mutates the input.
 */
export function dropStanceInconsistent<T extends StanceFields>(answers: T[]): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const a of answers) {
    if (stanceContradictsValue(a)) dropped.push(a);
    else kept.push(a);
  }
  return { kept, dropped };
}

// Guard against `web_research` labels with no actual citation. The generator maps
// `organization_scorecard`/`mixed` evidence (and any unmapped type) to source_type
// 'web_research', but when the research call returns no usable citation the row is still
// saved as 'web_research' with a null source_url — a provenance badge with nothing behind
// it (integrity finding #3). A web-research claim is only honest if it carries a URL;
// without one it's an inference. The DB CHECK constraint chk_web_research_has_url enforces
// the same invariant at write time for every code path.
//
/** Returns new answer objects; never mutates the input. */
export function demoteUncitedWebResearch<T extends VoteLabelFields>(answers: T[]): T[] {
  return answers.map((a) => {
    if (a.source_type !== 'web_research' || hasUrl(a)) return a;
    return { ...a, evidence_type: 'inferred', source_type: 'other' };
  });
}
