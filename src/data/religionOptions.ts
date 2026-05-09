// Grouped religion / denomination options for profile selection.
// Flat string values keep storage simple (single text column on profiles).

export interface ReligionGroup {
  label: string;
  options: string[];
}

export const RELIGION_GROUPS: ReligionGroup[] = [
  {
    label: 'Christianity',
    options: [
      'Christianity (General)',
      'Catholic',
      'Protestant (General)',
      'Baptist',
      'Methodist',
      'Lutheran',
      'Presbyterian',
      'Anglican / Episcopalian',
      'Pentecostal',
      'Evangelical',
      'Non-denominational Christian',
      'Eastern Orthodox',
      'Mormon (LDS)',
      'Jehovah’s Witness',
      'Other Christian',
    ],
  },
  {
    label: 'Islam',
    options: [
      'Islam (General)',
      'Sunni',
      'Shia',
      'Sufi',
      'Other Muslim',
    ],
  },
  {
    label: 'Judaism',
    options: [
      'Judaism (General)',
      'Orthodox Jewish',
      'Conservative Jewish',
      'Reform Jewish',
      'Reconstructionist Jewish',
      'Other Jewish',
    ],
  },
  {
    label: 'Buddhism',
    options: [
      'Buddhism (General)',
      'Theravada',
      'Mahayana',
      'Vajrayana / Tibetan',
      'Zen',
      'Other Buddhist',
    ],
  },
  {
    label: 'Hinduism',
    options: [
      'Hinduism (General)',
      'Vaishnavism',
      'Shaivism',
      'Shaktism',
      'Other Hindu',
    ],
  },
  {
    label: 'Other Faiths',
    options: [
      'Sikhism',
      'Baháʼí',
      'Jain',
      'Zoroastrian',
      'Taoist',
      'Shinto',
      'Indigenous / Folk',
      'Pagan / Wiccan',
      'Spiritual but not religious',
      'Unitarian Universalist',
      'Other',
    ],
  },
  {
    label: 'Non-religious',
    options: [
      'Atheist',
      'Agnostic',
      'Humanist',
      'None',
      'Prefer not to say',
    ],
  },
];

// Flat list (used for validation/legacy fallback).
export const RELIGION_OPTIONS: string[] = RELIGION_GROUPS.flatMap(g => g.options);
