import type { UpcomingCandidate, UpcomingElection } from '@/hooks/useUpcomingElections';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDistrict(value: string | null | undefined): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/(?:district|dist|cd)?\s*0*(\d{1,3})\b/);
  return match ? String(Number(match[1])) : raw;
}

function normalizeState(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  return raw ? raw.toUpperCase() : null;
}

function stateFromOffice(office: string | null | undefined): string | null {
  const raw = office ?? '';
  const parenthetical = raw.match(/\(([A-Z]{2})\)/i)?.[1];
  if (parenthetical) return parenthetical.toUpperCase();

  const housePrefix = raw.match(/\b([A-Z]{2})\s*[-–—]\s*0*(\d{1,3})\b/i)?.[1];
  return housePrefix ? housePrefix.toUpperCase() : null;
}

function districtFromOffice(office: string | null | undefined): string | null {
  const raw = office ?? '';
  const housePrefix = raw.match(/\b[A-Z]{2}\s*[-–—]\s*0*(\d{1,3})\b/i)?.[1];
  if (housePrefix) return String(Number(housePrefix));

  return normalizeDistrict(raw.match(/\bdistrict\s*0*(\d{1,3})\b/i)?.[1] ?? null);
}

function canonicalOffice(office: string | null | undefined): string {
  const raw = office ?? '';
  const normalized = normalizeText(raw);

  if (normalized.includes('president')) return 'President of the United States';

  if (
    normalized.includes('u s senate') ||
    normalized.includes('us senate') ||
    normalized.includes('u s senator') ||
    normalized.includes('us senator') ||
    normalized === 'senator'
  ) {
    return 'U.S. Senate';
  }

  if (
    normalized.includes('u s house') ||
    normalized.includes('us house') ||
    normalized.includes('representative') ||
    normalized.includes('congress')
  ) {
    return 'U.S. House';
  }

  return raw.trim() || 'Race';
}

export function canonicalElectionSeat(candidate: UpcomingCandidate, election?: UpcomingElection) {
  const office = canonicalOffice(candidate.office);
  const state = normalizeState(candidate.state) ?? normalizeState(election?.state) ?? stateFromOffice(candidate.office);
  const district = normalizeDistrict(candidate.district) ?? districtFromOffice(candidate.office);
  const jurisdiction = (election?.jurisdiction ?? '').trim() || null;

  return { office, state, district, jurisdiction };
}

export function electionSeatKey(candidate: UpcomingCandidate, election?: UpcomingElection): string {
  const seat = canonicalElectionSeat(candidate, election);
  const officeKey = normalizeText(seat.office);
  const stateKey = normalizeText(seat.state);
  const districtKey = normalizeText(seat.district);
  const jurisdictionKey = normalizeText(seat.jurisdiction);
  const isFederalSeat = officeKey === 'u s senate' || officeKey === 'u s house' || officeKey === 'president of the united states';

  return [
    officeKey,
    stateKey,
    districtKey,
    !isFederalSeat && jurisdictionKey && !['us', stateKey].includes(jurisdictionKey) ? jurisdictionKey : '',
  ].join('|');
}

export function electionSeatLabel(candidate: UpcomingCandidate, election?: UpcomingElection): string {
  const seat = canonicalElectionSeat(candidate, election);
  const parts = [seat.office];

  if (seat.district && seat.office.toLowerCase().includes('house')) {
    parts.push(`${seat.state ? `${seat.state}-` : 'District '}${seat.district}`);
  } else if (seat.district) {
    parts.push(`District ${seat.district}`);
  } else if (seat.state && seat.office !== 'President of the United States') {
    parts.push(seat.state);
  }

  if (seat.jurisdiction) {
    const normalizedJurisdiction = normalizeText(seat.jurisdiction);
    const alreadyShown = parts.some(part => normalizeText(part) === normalizedJurisdiction);
    if (!alreadyShown && normalizedJurisdiction !== normalizeText(seat.state)) {
      parts.push(seat.jurisdiction);
    }
  }

  return parts.join(' · ');
}
