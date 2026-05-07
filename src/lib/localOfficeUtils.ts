/**
 * Keywords that identify a local/state official (governor and below).
 * Federal officials (Senator, Representative) do NOT match these.
 */
const LOCAL_OFFICE_KEYWORDS = [
  'governor', 'state senator', 'state rep', 'mayor', 'city council',
  'county', 'alderman', 'selectman', 'town council', 'school board',
  'sheriff', 'district attorney', 'municipal', 'attorney general',
  'secretary of state', 'treasurer', 'auditor', 'comptroller',
];

export function isLocalOfficial(office: string | null | undefined): boolean {
  if (!office) return false;
  const lower = office.toLowerCase();
  return LOCAL_OFFICE_KEYWORDS.some(kw => lower.includes(kw));
}
