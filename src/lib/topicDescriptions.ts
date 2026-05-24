// Short, plain-English definitions for each topic id.
// Keep to one sentence so they fit under the topic name in the selector.
export const TOPIC_DESCRIPTIONS: Record<string, string> = {
  // Federal (12)
  'civil-rights': 'Equality, voting rights, discrimination, and individual liberties.',
  'defense': 'Military spending, national security, and armed forces policy.',
  'economy': 'Jobs, wages, taxes, trade, and economic growth.',
  'education': 'K-12 schools, colleges, student loans, and curriculum.',
  'environment': 'Climate change, clean energy, pollution, and conservation.',
  'foreign-affairs': 'Diplomacy, treaties, alliances, and U.S. role abroad.',
  'government': 'Ethics, transparency, elections, and how government runs.',
  'healthcare': 'Insurance, drug prices, Medicare/Medicaid, and access to care.',
  'immigration': 'Borders, visas, asylum, and paths to citizenship.',
  'judicial': 'Courts, judges, criminal justice, and the legal system.',
  'social-programs': 'Social Security, welfare, housing aid, and the safety net.',
  'technology': 'AI, privacy, internet regulation, and tech industry rules.',

  // Local (5)
  'local-cost-of-living': 'Local taxes, utility rates, and everyday affordability.',
  'local-education': 'Local school funding, boards, and district policy.',
  'local-housing': 'Zoning, rent, development, and housing affordability.',
  'local-public-health': 'Hospitals, clinics, and community health services.',
  'local-public-safety': 'Policing, fire, emergency response, and local crime.',
};

export const getTopicDescription = (id: string): string =>
  TOPIC_DESCRIPTIONS[id] ?? '';
