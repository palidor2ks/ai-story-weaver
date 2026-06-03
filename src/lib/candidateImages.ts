const BIOGUIDE_ID_PATTERN = /^[A-Z][0-9]{6}$/;

export const firstNonBlank = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

export const bioguideImageUrl = (bioguideId: string | null | undefined): string | undefined => {
  const id = bioguideId?.trim();
  if (!id || !BIOGUIDE_ID_PATTERN.test(id)) return undefined;
  return `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
};

interface CandidateImageSources {
  overrideUrl?: string | null;
  candidateUrl?: string | null;
  apiUrl?: string | null;
  candidateId?: string | null;
  personId?: string | null;
  bioguideId?: string | null;
}

export const resolveCandidateImageUrl = ({
  overrideUrl,
  candidateUrl,
  apiUrl,
  candidateId,
  personId,
  bioguideId,
}: CandidateImageSources): string | undefined =>
  firstNonBlank(
    overrideUrl,
    candidateUrl,
    apiUrl,
    bioguideImageUrl(bioguideId),
    bioguideImageUrl(candidateId),
    bioguideImageUrl(personId),
  );
