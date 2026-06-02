export function officeBucket(office: string): string {
  const value = (office || '').toLowerCase();
  if (/president|white house/.test(value)) return 'president';
  if (/governor/.test(value)) return 'governor';
  if (/state\s+senate|state senator/.test(value)) return 'state-senate';
  if (/state\s+(assembly|house|representative|delegate|legislature)/.test(value)) return 'state-house';
  if (/u\.?s\.?\s+senate|us senate|senator/.test(value)) return 'senate';
  if (/u\.?s\.?\s+house|us house|congress|representative/.test(value)) return 'house';
  if (/mayor/.test(value)) return 'mayor';
  if (/council|alder|select(wo)?man|commissioner|freeholder/.test(value)) return 'local-council';
  return value.replace(/\s+/g, ' ').trim() || 'other';
}

export function normalizeNameKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token && !['jr', 'sr', 'ii', 'iii', 'iv', 'mr', 'mrs', 'ms', 'dr'].includes(token))
    .sort()
    .join(' ');
}

export function normalizeDistrictKey(district: string | null | undefined): string {
  return String(district || '').replace(/^0+/, '').toLowerCase();
}

export function candidateKey(candidate: {
  name: string;
  state: string;
  office: string;
  district: string | null;
}): string {
  return [
    normalizeNameKey(candidate.name),
    (candidate.state || '').toLowerCase(),
    officeBucket(candidate.office),
    normalizeDistrictKey(candidate.district),
  ].join('|');
}

export function chooseCandidate<T extends {
  image_url: string | null;
  is_pending_research: boolean;
  overall_score: number | null;
}>(current: T, next: T): T {
  const rank = (c: T) =>
    Number(Boolean(c.image_url)) +
    Number(!c.is_pending_research) * 2 +
    Number(c.overall_score !== null) * 4;
  return rank(next) > rank(current) ? next : current;
}
