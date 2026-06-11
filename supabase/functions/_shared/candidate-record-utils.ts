// Pure, dependency-free helpers for the candidate "positions & goals" record block.
// Kept separate from candidate-record.ts so they're unit-testable without dragging in
// the supabase-js / ai-cache runtime imports that bun can't resolve in the test env.

export interface AnalysisPayload {
  summary?: string;
  positions?: { topic: string; stance: string }[];
  goals?: string[];
  insufficient_information?: boolean;
}

// Build a compact "positions & goals" text block from a cached analysis payload, or
// null when there's nothing usable. Prefers the structured positions/goals (what the
// AI-analysis dialog renders); falls back to the prose summary only if those are empty.
export function recordBlockFromAnalysis(p: AnalysisPayload | null | undefined): string | null {
  if (!p || p.insufficient_information) return null;
  const parts: string[] = [];
  const positions = (p.positions ?? [])
    .filter((x) => x && typeof x.topic === 'string' && typeof x.stance === 'string' && x.topic.trim() && x.stance.trim())
    .map((x) => `${x.topic.trim()}: ${x.stance.trim()}`);
  if (positions.length) parts.push(`Positions — ${positions.join('; ')}.`);
  const goals = (p.goals ?? []).map((g) => String(g).trim()).filter(Boolean);
  if (goals.length) parts.push(`Goals — ${goals.join('; ')}.`);
  if (parts.length) return parts.join(' ');
  const summary = (p.summary ?? '').trim();
  return summary || null;
}
