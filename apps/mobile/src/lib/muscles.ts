/** Train muscle map — which regions light for a lift. */

export type MuscleSlug =
  | 'abs'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'deltoids'
  | 'forearm'
  | 'gluteal'
  | 'hamstring'
  | 'lower-back'
  | 'obliques'
  | 'quadriceps'
  | 'triceps'
  | 'upper-back';

export type MuscleRole = 'primary' | 'assisting' | 'rest';

export type Equipment = 'free' | 'machine';

export type ExerciseId =
  | 'ab-crunch-machine'
  | 'bench-press'
  | 'bent-over-row'
  | 'bicep-curl'
  | 'bulgarian-split-squat'
  | 'cable-pushdown'
  | 'calf-raise'
  | 'chest-press'
  | 'chin-up'
  | 'deadlift'
  | 'face-pull'
  | 'hammer-curl'
  | 'hip-abduction'
  | 'hip-thrust'
  | 'incline-bench'
  | 'lat-pulldown'
  | 'lateral-raise'
  | 'leg-extension'
  | 'leg-press'
  | 'lunge'
  | 'lying-leg-curl'
  | 'overhead-press'
  | 'pec-deck'
  | 'plank'
  | 'preacher-curl'
  | 'pull-up'
  | 'push-up'
  | 'romanian-deadlift'
  | 'russian-twist'
  | 'seated-calf-raise'
  | 'seated-row'
  | 'shoulder-press-machine'
  | 'sit-up'
  | 'skull-crusher'
  | 'squat'
  | 'tricep-dip';

export type MusclePlate = 'front' | 'back';

export type Highlight = {
  slug: MuscleSlug;
  intensity: 1 | 2;
};

export type ListedMuscle = {
  slug: MuscleSlug;
  name: string;
  role: Exclude<MuscleRole, 'rest'>;
  plate: MusclePlate;
};

export type ExerciseDef = {
  id: ExerciseId;
  name: string;
  equipment: Equipment;
  primary: MuscleSlug[];
  assisting: MuscleSlug[];
};

export type MuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'abs'
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves';

export type MuscleGroup = {
  id: MuscleGroupId;
  name: string;
  exercises: ExerciseDef[];
};

const LABELS: Record<MuscleSlug, { name: string; plate: MusclePlate }> = {
  chest: { name: 'Chest', plate: 'front' },
  deltoids: { name: 'Shoulders', plate: 'front' },
  abs: { name: 'Abs', plate: 'front' },
  obliques: { name: 'Obliques', plate: 'front' },
  biceps: { name: 'Biceps', plate: 'front' },
  triceps: { name: 'Triceps', plate: 'back' },
  forearm: { name: 'Brachioradialis', plate: 'front' },
  quadriceps: { name: 'Quads', plate: 'front' },
  adductors: { name: 'Adductors', plate: 'front' },
  'upper-back': { name: 'Upper back', plate: 'back' },
  'lower-back': { name: 'Erectors', plate: 'back' },
  gluteal: { name: 'Glutes', plate: 'back' },
  hamstring: { name: 'Hamstrings', plate: 'back' },
  calves: { name: 'Calves', plate: 'back' },
};

const GROUP_DEFS: { id: MuscleGroupId; name: string; slugs: MuscleSlug[] }[] = [
  { id: 'chest', name: 'Chest', slugs: ['chest'] },
  { id: 'back', name: 'Back', slugs: ['upper-back', 'lower-back'] },
  { id: 'shoulders', name: 'Shoulders', slugs: ['deltoids'] },
  { id: 'biceps', name: 'Biceps', slugs: ['biceps'] },
  { id: 'triceps', name: 'Triceps', slugs: ['triceps'] },
  { id: 'abs', name: 'Abs', slugs: ['abs', 'obliques'] },
  { id: 'quads', name: 'Quads', slugs: ['quadriceps'] },
  { id: 'glutes', name: 'Glutes', slugs: ['gluteal'] },
  { id: 'hamstrings', name: 'Hamstrings', slugs: ['hamstring'] },
  { id: 'calves', name: 'Calves', slugs: ['calves'] },
];

const FREE: Pick<ExerciseDef, 'equipment'> = { equipment: 'free' };
const MACHINE: Pick<ExerciseDef, 'equipment'> = { equipment: 'machine' };

export const EXERCISES: ExerciseDef[] = [
  { id: 'push-up', name: 'Push-up', ...FREE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'bench-press', name: 'Bench press', ...FREE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'incline-bench', name: 'Incline bench', ...FREE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'pull-up', name: 'Pull-up', ...FREE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'chin-up', name: 'Chin-up', ...FREE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'bent-over-row', name: 'Bent-over row', ...FREE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'overhead-press', name: 'Overhead press', ...FREE, primary: ['deltoids'], assisting: ['triceps'] },
  { id: 'lateral-raise', name: 'Lateral raise', ...FREE, primary: ['deltoids'], assisting: [] },
  { id: 'face-pull', name: 'Face pull', ...FREE, primary: ['deltoids'], assisting: ['upper-back'] },
  { id: 'bicep-curl', name: 'Bicep curl', ...FREE, primary: ['biceps'], assisting: ['forearm'] },
  { id: 'hammer-curl', name: 'Hammer curl', ...FREE, primary: ['biceps'], assisting: ['forearm'] },
  { id: 'tricep-dip', name: 'Tricep dip', ...FREE, primary: ['triceps'], assisting: ['chest', 'deltoids'] },
  { id: 'skull-crusher', name: 'Skull crusher', ...FREE, primary: ['triceps'], assisting: [] },
  { id: 'sit-up', name: 'Sit-up', ...FREE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'russian-twist', name: 'Russian twist', ...FREE, primary: ['obliques'], assisting: ['abs'] },
  { id: 'plank', name: 'Plank', ...FREE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'squat', name: 'Squat', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring', 'adductors', 'lower-back'] },
  { id: 'lunge', name: 'Lunge', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring'] },
  { id: 'deadlift', name: 'Deadlift', ...FREE, primary: ['hamstring', 'gluteal', 'lower-back'], assisting: ['quadriceps', 'upper-back'] },
  { id: 'hip-thrust', name: 'Hip thrust', ...FREE, primary: ['gluteal'], assisting: ['hamstring'] },
  { id: 'bulgarian-split-squat', name: 'Bulgarian split squat', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring'] },
  { id: 'romanian-deadlift', name: 'Romanian deadlift', ...FREE, primary: ['hamstring', 'gluteal'], assisting: ['lower-back'] },
  { id: 'calf-raise', name: 'Calf raise', ...FREE, primary: ['calves'], assisting: [] },
  { id: 'chest-press', name: 'Chest press', ...MACHINE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'pec-deck', name: 'Pec deck', ...MACHINE, primary: ['chest'], assisting: [] },
  { id: 'lat-pulldown', name: 'Lat pulldown', ...MACHINE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'seated-row', name: 'Seated row', ...MACHINE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'shoulder-press-machine', name: 'Shoulder press machine', ...MACHINE, primary: ['deltoids'], assisting: ['triceps'] },
  { id: 'preacher-curl', name: 'Preacher curl', ...MACHINE, primary: ['biceps'], assisting: ['forearm'] },
  { id: 'cable-pushdown', name: 'Cable pushdown', ...MACHINE, primary: ['triceps'], assisting: [] },
  { id: 'ab-crunch-machine', name: 'Ab crunch machine', ...MACHINE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'leg-press', name: 'Leg press', ...MACHINE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring'] },
  { id: 'leg-extension', name: 'Leg extension', ...MACHINE, primary: ['quadriceps'], assisting: [] },
  { id: 'lying-leg-curl', name: 'Lying leg curl', ...MACHINE, primary: ['hamstring'], assisting: [] },
  { id: 'hip-abduction', name: 'Hip abduction', ...MACHINE, primary: ['gluteal'], assisting: [] },
  { id: 'seated-calf-raise', name: 'Seated calf raise', ...MACHINE, primary: ['calves'], assisting: [] },
];

export function getExercise(id: string): ExerciseDef | undefined {
  return EXERCISES.find((ex) => ex.id === id);
}

/** Train shows the muscle map only after a known lift is picked. */
export function hasPickedExercise(id: string | null | undefined): id is ExerciseId {
  return Boolean(id && getExercise(id));
}

export function muscleRole(exerciseId: string, slug: string): MuscleRole {
  const ex = getExercise(exerciseId);
  if (!ex) return 'rest';
  if (ex.primary.includes(slug as MuscleSlug)) return 'primary';
  if (ex.assisting.includes(slug as MuscleSlug)) return 'assisting';
  return 'rest';
}

export function highlightForExercise(exerciseId: string): Highlight[] {
  const ex = getExercise(exerciseId);
  if (!ex) return [];
  return [
    ...ex.primary.map((slug) => ({ slug, intensity: 2 as const })),
    ...ex.assisting.map((slug) => ({ slug, intensity: 1 as const })),
  ];
}

export function listedMuscles(exerciseId: string): ListedMuscle[] {
  const ex = getExercise(exerciseId);
  if (!ex) return [];
  const row = (slug: MuscleSlug, role: Exclude<MuscleRole, 'rest'>): ListedMuscle => ({
    slug,
    role,
    name: LABELS[slug].name,
    plate: LABELS[slug].plate,
  });
  return [...ex.primary.map((s) => row(s, 'primary')), ...ex.assisting.map((s) => row(s, 'assisting'))];
}

export function exercisesGrouped(equipment: Equipment): MuscleGroup[] {
  return GROUP_DEFS.flatMap((group) => {
    const exercises = EXERCISES.filter(
      (ex) => ex.equipment === equipment && ex.primary.some((slug) => group.slugs.includes(slug)),
    );
    if (!exercises.length) return [];
    return [{ id: group.id, name: group.name, exercises }];
  });
}
