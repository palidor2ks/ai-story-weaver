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

function hasUrl(a: VoteLabelFields): boolean {
  return Boolean(a.source_url) || (a.source_urls?.length ?? 0) > 0;
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
