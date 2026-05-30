export interface CauseDisplayInfo {
  id?: string | null;
  label?: string | null;
}

const GENERIC_CAUSE_IDS = new Set(['progressive', 'conservative', 'libertarian']);

export const isGenericCause = (cause: CauseDisplayInfo | null | undefined) => {
  if (!cause) return false;
  const id = cause.id?.toLowerCase();
  const label = cause.label ?? '';
  return (!!id && GENERIC_CAUSE_IDS.has(id)) || /\(general\)/i.test(label);
};

export const choosePrimaryCauseLabel = (
  primaryCause: CauseDisplayInfo | null | undefined,
  secondaryCauses: CauseDisplayInfo[] = [],
) => {
  const specificSecondary = secondaryCauses.find(
    (cause) => cause.label && !isGenericCause(cause),
  );

  if (isGenericCause(primaryCause) && specificSecondary?.label) {
    return specificSecondary.label;
  }

  return primaryCause?.label ?? specificSecondary?.label ?? null;
};
