// Tests for the write-time vote-label guard (see answer-label-guard.ts). The data-side
// relabel (2026-06-11) cleaned 47,066 historical rows; this guard is what keeps the pool
// from regrowing, so the invariants here are the contract.
import { expect, test } from 'bun:test';
import { demoteUnverifiableVoteClaims, demoteUncitedWebResearch, dropStanceInconsistent } from './answer-label-guard.ts';

const voteClaim = {
  evidence_type: 'voting_record',
  source_type: 'voting_record',
  source_url: null as string | null,
  source_urls: null as string[] | null,
};

test('demotes an uncited vote claim when the candidate has no vote data', () => {
  const [out] = demoteUnverifiableVoteClaims([{ ...voteClaim }], false);
  expect(out.evidence_type).toBe('inferred');
  expect(out.source_type).toBe('other');
});

test('keeps a vote claim when the candidate has vote data', () => {
  const [out] = demoteUnverifiableVoteClaims([{ ...voteClaim }], true);
  expect(out.evidence_type).toBe('voting_record');
  expect(out.source_type).toBe('voting_record');
});

test('keeps a CITED vote claim even without vote data (URL makes it checkable)', () => {
  const cited = { ...voteClaim, source_url: 'https://example.com/roll-call' };
  const [out] = demoteUnverifiableVoteClaims([cited], false);
  expect(out.evidence_type).toBe('voting_record');

  const citedViaArray = { ...voteClaim, source_urls: ['https://example.com/roll-call'] };
  const [out2] = demoteUnverifiableVoteClaims([citedViaArray], false);
  expect(out2.evidence_type).toBe('voting_record');
});

test('leaves non-vote labels untouched and does not mutate inputs', () => {
  const statement = {
    evidence_type: 'public_statement',
    source_type: 'public_statement',
    source_url: null,
    source_urls: null,
  };
  const input = { ...voteClaim };
  const out = demoteUnverifiableVoteClaims([statement, input], false);
  expect(out[0]).toEqual(statement);
  expect(input.evidence_type).toBe('voting_record'); // original object unchanged
});

test('demotes when only one of the two label columns claims votes', () => {
  const mixedLabels = { ...voteClaim, evidence_type: 'mixed' }; // source_type still voting_record
  const [out] = demoteUnverifiableVoteClaims([mixedLabels], false);
  expect(out.source_type).toBe('other');
  expect(out.evidence_type).toBe('inferred');
});

test('treats a whitespace-only source_url as no citation', () => {
  // blank URL should not rescue an uncited vote claim from demotion
  const blankUrl = { ...voteClaim, source_url: '   ' };
  const [out] = demoteUnverifiableVoteClaims([blankUrl], false);
  expect(out.evidence_type).toBe('inferred');
});

const webResearch = {
  evidence_type: 'organization_scorecard',
  source_type: 'web_research',
  source_url: null as string | null,
  source_urls: null as string[] | null,
};

test('demotes a web_research label with no URL to inferred/other', () => {
  const [out] = demoteUncitedWebResearch([{ ...webResearch }]);
  expect(out.source_type).toBe('other');
  expect(out.evidence_type).toBe('inferred');
});

test('keeps a web_research label that carries a real URL', () => {
  const cited = { ...webResearch, source_url: 'https://example.org/scorecard' };
  const [out] = demoteUncitedWebResearch([cited]);
  expect(out.source_type).toBe('web_research');

  const citedArray = { ...webResearch, source_urls: ['https://example.org/scorecard'] };
  const [out2] = demoteUncitedWebResearch([citedArray]);
  expect(out2.source_type).toBe('web_research');
});

test('web_research guard leaves other source types and inputs untouched', () => {
  const statement = { evidence_type: 'public_statement', source_type: 'public_statement', source_url: null, source_urls: null };
  const input = { ...webResearch };
  const out = demoteUncitedWebResearch([statement, input]);
  expect(out[0]).toEqual(statement);
  expect(input.source_type).toBe('web_research'); // original object unchanged
  expect(out[1].source_type).toBe('other');
});

// ── dropStanceInconsistent (2026-06-20 inverted-score guard) ────────────────────

test('drops a "support" answer with a negative value (the Branson inversion)', () => {
  // Evidence said he co-sponsored/supported the bill, yet answer_value was -10.
  const { kept, dropped } = dropStanceInconsistent([{ stance: 'support', answer_value: -10 }]);
  expect(kept).toHaveLength(0);
  expect(dropped).toHaveLength(1);
});

test('drops an "oppose" answer with a positive value', () => {
  const { kept, dropped } = dropStanceInconsistent([{ stance: 'oppose', answer_value: 7 }]);
  expect(kept).toHaveLength(0);
  expect(dropped).toHaveLength(1);
});

test('keeps consistent answers (support/positive, oppose/negative)', () => {
  const { kept, dropped } = dropStanceInconsistent([
    { stance: 'support', answer_value: 10 },
    { stance: 'oppose', answer_value: -5 },
    { stance: 'Supports', answer_value: 3 }, // case-insensitive + synonym
  ]);
  expect(kept).toHaveLength(3);
  expect(dropped).toHaveLength(0);
});

test('keeps neutral/zero/absent/unknown stances (only hard sign flips are dropped)', () => {
  const { kept, dropped } = dropStanceInconsistent([
    { stance: 'neutral', answer_value: 5 },
    { stance: 'support', answer_value: 0 },
    { stance: 'mixed', answer_value: -7 },
    { answer_value: -10 },              // no stance
    { stance: 'support', answer_value: null }, // no value
  ]);
  expect(kept).toHaveLength(5);
  expect(dropped).toHaveLength(0);
});

test('does not mutate inputs and partitions a mixed batch', () => {
  const good = { stance: 'support', answer_value: 5 };
  const bad = { stance: 'support', answer_value: -5 };
  const { kept, dropped } = dropStanceInconsistent([good, bad]);
  expect(kept).toEqual([good]);
  expect(dropped).toEqual([bad]);
  expect(bad.answer_value).toBe(-5); // unchanged
});
