// Short, plain-English definitions for each topic id.
// Keep to one sentence so they fit under the topic name in the selector.
export const TOPIC_DESCRIPTIONS: Record<string, string> = {
  // Federal (6 consolidated topics)
  'economy-work': 'Jobs, wages, taxes, trade, tech industry, and economic growth.',
  'health-safety-net': 'Healthcare, schools, Social Security, welfare, and housing aid.',
  'environment-energy': 'Climate change, clean energy, pollution, and conservation.',
  'national-security-borders': 'Military, foreign affairs, immigration, and border policy.',
  'rights-justice': 'Civil rights, voting, courts, criminal justice, and liberties.',
  'government-democracy': 'Ethics, transparency, elections, and how government runs.',

  // Local (5)
  'local-cost-of-living': 'Local taxes, utility rates, and everyday affordability.',
  'local-education': 'Local school funding, boards, and district policy.',
  'local-housing': 'Zoning, rent, development, and housing affordability.',
  'local-public-health': 'Hospitals, clinics, and community health services.',
  'local-public-safety': 'Policing, fire, emergency response, and local crime.',
};

export const getTopicDescription = (id: string): string =>
  TOPIC_DESCRIPTIONS[id] ?? '';
