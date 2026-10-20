export const SUPPLEMENT_OPTIONS = [
  { id: 'creatine', label: 'Creatine', detail: 'Strength & muscle hydration' },
  { id: 'whey', label: 'Whey Protein', detail: 'Recovery & lean mass' },
  { id: 'ashwagandha', label: 'Ashwagandha', detail: 'Stress & recovery' },
  { id: 'vitamin_d', label: 'Vitamin D3', detail: 'Bones & immunity' },
  { id: 'omega3', label: 'Omega-3', detail: 'Heart & brain' },
  { id: 'multivitamin', label: 'Multivitamin', detail: 'Daily coverage' },
  { id: 'preworkout', label: 'Pre-Workout', detail: 'Energy & focus' },
  { id: 'bcaa', label: 'BCAA / EAA', detail: 'Intra-workout amino acids' },
  { id: 'magnesium', label: 'Magnesium', detail: 'Sleep & recovery' },
  { id: 'none', label: 'None', detail: 'Not taking any right now' },
] as const;

export type SupplementId = (typeof SUPPLEMENT_OPTIONS)[number]['id'];
