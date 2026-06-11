// Pure helpers for answers-enrichment part 1b phase 1 (docs/answers-enrichment-part1b-plan.md):
// finding the ORIGINAL source artifact behind a public_statement answer whose description
// already names one ("in a 2019 press release…", "in an interview with…"). Dependency-free
// so bun can unit-test them (same convention as news-research-utils.ts).

export interface ArtifactHint {
  label: string; // human phrasing used in the research query
  re: RegExp;
}

// Mirrors the phase-1 pool definition used to enqueue staging rows — keep in sync with
// the SQL in the enqueue step / plan doc.
export const ARTIFACT_HINTS: ArtifactHint[] = [
  { label: 'press release', re: /press release/i },
  { label: 'interview', re: /(in an interview|interview with)/i },
  { label: 'op-ed', re: /(op-ed|opinion piece)/i },
  { label: 'speech, remarks, testimony, town hall, or debate', re: /(floor speech|in a speech|remarks at|testimony|town hall|debate)/i },
];

export function detectArtifactHint(description: string | null | undefined): string | null {
  const d = description ?? '';
  for (const h of ARTIFACT_HINTS) if (h.re.test(d)) return h.label;
  return null;
}

// The axis convention is load-bearing: answer_value is left/right per src/lib/scoring.ts
// (negative = progressive/left position, positive = conservative/right position). The
// distiller needs it spelled out to verify the found source supports the RECORDED stance.
export function stanceLine(questionText: string, answerValue: number): string {
  const side = answerValue < 0 ? 'progressive/left' : 'conservative/right';
  return `On the question "${questionText}" this answer records the ${side} position ` +
    `(value ${answerValue} on a -10..+10 scale where negative = left, positive = right).`;
}

export function buildFindSourceQuery(opts: {
  name: string;
  office?: string | null;
  state?: string | null;
  description: string;
  artifactHint?: string | null;
}): string {
  const who = [opts.name, opts.office, opts.state ? `of ${opts.state}` : '']
    .map((p) => (p ?? '').trim()).filter(Boolean).join(', ');
  const artifact = opts.artifactHint ? `a specific ${opts.artifactHint}` : 'a specific public statement';
  return `Find the original source for this claim about ${who}: ` +
    `"${opts.description.slice(0, 600)}". ` +
    `The claim references ${artifact}. Search thoroughly — their congressional .gov newsroom or ` +
    `campaign site, the named outlet, transcripts, and news coverage — for the artifact itself ` +
    `OR an article that directly reports that specific statement. It must be about THIS person, ` +
    `not someone with a similar name. Do NOT give up after one search; only if a thorough search ` +
    `finds no source matching BOTH this person AND this specific claim, answer exactly: NONE.`;
}
