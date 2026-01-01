/**
 * Utility functions for handling source URLs and display names
 */

// Known domain display names
const KNOWN_DOMAINS: Record<string, string> = {
  'congress.gov': 'Congress.gov',
  'senate.gov': 'Senate.gov',
  'house.gov': 'House.gov',
  'whitehouse.gov': 'White House',
  'nytimes.com': 'NY Times',
  'washingtonpost.com': 'Washington Post',
  'apnews.com': 'AP News',
  'reuters.com': 'Reuters',
  'politico.com': 'Politico',
  'cnn.com': 'CNN',
  'foxnews.com': 'Fox News',
  'npr.org': 'NPR',
  'bbc.com': 'BBC',
  'thehill.com': 'The Hill',
  'democrats.org': 'Democrats.org',
  'gop.com': 'GOP.com',
  'gp.org': 'Green Party',
  'lp.org': 'Libertarian Party',
  'ballotpedia.org': 'Ballotpedia',
  'opensecrets.org': 'OpenSecrets',
  'votesmart.org': 'VoteSmart',
  'govtrack.us': 'GovTrack',
  'wikipedia.org': 'Wikipedia',
};

// Source type categorization
export type SourceType = 'government' | 'news' | 'party' | 'reference' | 'other';

interface SourceInfo {
  displayName: string;
  domain: string;
  type: SourceType;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Get source type based on domain
 */
function getSourceType(domain: string): SourceType {
  if (domain.endsWith('.gov')) return 'government';
  if (['democrats.org', 'gop.com', 'gp.org', 'lp.org'].includes(domain)) return 'party';
  if (['nytimes.com', 'washingtonpost.com', 'apnews.com', 'reuters.com', 'politico.com', 'cnn.com', 'foxnews.com', 'npr.org', 'bbc.com', 'thehill.com'].includes(domain)) return 'news';
  if (['ballotpedia.org', 'opensecrets.org', 'votesmart.org', 'govtrack.us', 'wikipedia.org'].includes(domain)) return 'reference';
  return 'other';
}

/**
 * Format a domain name for display
 */
function formatDomain(domain: string): string {
  // Check known domains first
  for (const [key, value] of Object.entries(KNOWN_DOMAINS)) {
    if (domain.includes(key)) return value;
  }
  
  // Format unknown domain: capitalize first letter of each part
  const parts = domain.split('.');
  const mainPart = parts[0];
  return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
}

/**
 * Get display information for a source URL
 */
export function getSourceInfo(url: string, title?: string | null): SourceInfo {
  const domain = extractDomain(url);
  const type = getSourceType(domain);
  
  // Use provided title if it's meaningful (not just the domain or generic)
  if (title && title.length > 3 && !title.toLowerCase().includes('untitled')) {
    // Truncate long titles
    const truncatedTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
    return { displayName: truncatedTitle, domain, type };
  }
  
  // Otherwise use formatted domain name
  return { displayName: formatDomain(domain), domain, type };
}

/**
 * Get display name for a source URL (simple version)
 */
export function getSourceDisplayName(url: string, title?: string | null): string {
  return getSourceInfo(url, title).displayName;
}

/**
 * Get badge color class based on source type
 */
export function getSourceBadgeClass(type: SourceType): string {
  switch (type) {
    case 'government':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'news':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800';
    case 'party':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'reference':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}
