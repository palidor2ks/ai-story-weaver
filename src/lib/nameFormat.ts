const SUFFIXES = new Set([
  'jr',
  'sr',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'phd',
  'ph.d',
  'md',
  'm.d',
  'dds',
  'd.d.s',
  'esq',
]);

const LOWERCASE_PARTICLES = new Set([
  'de',
  'del',
  'de la',
  'da',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
]);

const normalizePunctuation = (value: string) =>
  value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const cleanToken = (value: string) => value.replace(/^\.+|\.+$/g, '');

const normalizeSuffix = (token: string) => {
  const cleaned = cleanToken(token);
  const key = cleaned.toLowerCase();

  switch (key) {
    case 'jr':
      return 'Jr.';
    case 'sr':
      return 'Sr.';
    case 'phd':
    case 'ph.d':
      return 'Ph.D.';
    case 'md':
    case 'm.d':
      return 'M.D.';
    case 'dds':
    case 'd.d.s':
      return 'D.D.S.';
    case 'esq':
      return 'Esq.';
    default:
      return cleaned.toUpperCase();
  }
};

const isSuffix = (token: string) => SUFFIXES.has(cleanToken(token).toLowerCase());

const formatInitial = (token: string) => {
  const initial = cleanToken(token).charAt(0);
  return initial ? `${initial.toUpperCase()}.` : '';
};

const titleCaseSegment = (segment: string) => {
  if (!segment) return segment;
  if (/^[A-Z]\.$/.test(segment)) return segment;
  if (/^[IVXLCDM]+$/i.test(segment) && segment.length <= 6) return segment.toUpperCase();

  const lower = segment.toLowerCase();
  let titled = lower.charAt(0).toUpperCase() + lower.slice(1);

  titled = titled.replace(/\bMc([a-z])/, (_match, letter: string) => `Mc${letter.toUpperCase()}`);
  titled = titled.replace(/\bMac([a-z])/, (_match, letter: string) => `Mac${letter.toUpperCase()}`);

  return titled;
};

const titleCaseToken = (token: string, index = 0) => {
  const cleaned = cleanToken(token);
  if (!cleaned) return '';
  if (isSuffix(cleaned)) return normalizeSuffix(cleaned);

  const particle = cleaned.toLowerCase();
  if (index > 0 && LOWERCASE_PARTICLES.has(particle)) return particle;

  return cleaned
    .split('-')
    .map((hyphenPart) =>
      hyphenPart
        .split("'")
        .map(titleCaseSegment)
        .join("'"),
    )
    .join('-');
};

const formatNamePart = (part: string) =>
  normalizePunctuation(part)
    .split(' ')
    .filter(Boolean)
    .map((token, index) => titleCaseToken(token, index))
    .filter(Boolean)
    .join(' ');

const splitSuffixes = (tokens: string[]) => {
  const body = [...tokens];
  const suffixes: string[] = [];

  while (body.length > 0 && isSuffix(body[body.length - 1])) {
    suffixes.unshift(normalizeSuffix(body.pop()!));
  }

  return { body, suffixes };
};

const formatFirstMiddleLast = (tokens: string[]) => {
  const { body, suffixes } = splitSuffixes(tokens);
  if (body.length === 0) return suffixes.join(' ');
  if (body.length === 1) return [...body.map(formatNamePart), ...suffixes].join(' ');

  const first = formatNamePart(body[0]);
  const last = formatNamePart(body[body.length - 1]);
  const middleInitials = body.slice(1, -1).map(formatInitial).filter(Boolean);

  return [first, ...middleInitials, last, ...suffixes].join(' ');
};

const formatLastFirstName = (name: string) => {
  const parts = name.split(',').map(normalizePunctuation).filter(Boolean);
  if (parts.length < 2) return null;

  const last = formatNamePart(parts[0]);
  const givenTokens = parts[1].split(' ').filter(Boolean);
  const trailingTokens = parts.slice(2).flatMap((part) => part.split(' ').filter(Boolean));
  const { body: givenBody, suffixes: givenSuffixes } = splitSuffixes(givenTokens);
  const suffixes = [...givenSuffixes, ...trailingTokens.filter(isSuffix).map(normalizeSuffix)];

  if (givenBody.length === 0) return [last, ...suffixes].join(' ');

  const first = formatNamePart(givenBody[0]);
  const middleInitials = givenBody.slice(1).map(formatInitial).filter(Boolean);

  return [first, ...middleInitials, last, ...suffixes].join(' ');
};

/**
 * Formats person names for display as "First M. Last".
 *
 * Handles common FEC-style "LAST, FIRST MIDDLE" rows, all-caps source data,
 * suffixes, and existing first-last names.
 */
export const formatPersonName = (name: string | null | undefined): string => {
  const normalized = normalizePunctuation(name ?? '');
  if (!normalized) return '';

  const lastFirst = formatLastFirstName(normalized);
  if (lastFirst) return lastFirst;

  return formatFirstMiddleLast(normalized.split(' ').filter(Boolean));
};
