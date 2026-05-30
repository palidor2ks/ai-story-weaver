export type RawDonorType = 'Individual' | 'PAC' | 'Organization' | 'Unknown' | string;
export type DonorEntityType = 'Individual' | 'Org/PAC' | 'Unknown';

export const normalizeDonorEntityType = (type: RawDonorType): DonorEntityType => {
  if (type === 'Individual') return 'Individual';
  if (type === 'PAC' || type === 'Organization' || type === 'Org/PAC') return 'Org/PAC';
  return 'Unknown';
};

export const getPrimaryDonorEntityType = (
  type: RawDonorType,
  types?: RawDonorType[] | null,
): DonorEntityType => {
  const normalizedTypes = (types || []).map(normalizeDonorEntityType);

  if (normalizedTypes.includes('Individual')) return 'Individual';
  if (normalizedTypes.includes('Org/PAC')) return 'Org/PAC';

  return normalizeDonorEntityType(type);
};

export const toDonorTypeFilterValue = (type: string | null | undefined) => {
  if (!type || type === 'all') return null;
  return type;
};
