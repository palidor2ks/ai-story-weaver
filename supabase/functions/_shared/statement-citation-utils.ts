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
  // Phrased as a research QUESTION, not a retrieval command, and with NO bail-out token:
  // the gate runs showed the You.com research model answers a "find the exact source, else
  // say NONE" command with an instant "NONE." for every row (while the caption pipeline's
  // question-shaped query works in prod). The strict accept/reject decision lives in the
  // verify_citation distiller, which can only pick from the citations research returns.
  return `What has ${who} publicly said on this, and where was it originally published? ` +
    `The recorded claim is: "${opts.description.slice(0, 600)}". ` +
    `This references ${artifact} — research that statement and list the sources where it ` +
    `appears: the original press release (congressional .gov newsroom or campaign site), the ` +
    `interview or transcript, the op-ed, or news coverage directly quoting it. Make sure the ` +
    `sources are about THIS person, not someone with a similar name.`;
}
