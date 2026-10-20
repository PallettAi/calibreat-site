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
  | 'arm-circle'
  | 'assisted-dip'
  | 'assisted-pull-up'
  | 'back-extension'
  | 'back-extension-machine'
  | 'bench-press'
  | 'bent-over-row'
  | 'bicep-curl'
  | 'bicycle-crunch'
  | 'bulgarian-split-squat'
  | 'burpee'
  | 'cable-crunch'
  | 'cable-curl'
  | 'cable-fly'
  | 'cable-lateral-raise'
  | 'cable-pushdown'
  | 'cable-woodchop'
  | 'calf-raise'
  | 'chest-press'
  | 'chest-supported-row'
  | 'chin-up'
  | 'concentration-curl'
  | 'crunch'
  | 'dead-bug'
  | 'deadlift'
  | 'decline-chest-press'
  | 'decline-push-up'
  | 'diamond-push-up'
  | 'donkey-kick'
  | 'doorway-row'
  | 'dumbbell-fly'
  | 'dumbbell-row'
  | 'face-pull'
  | 'fire-hydrant'
  | 'front-raise'
  | 'glute-bridge'
  | 'glute-kickback-machine'
  | 'goblet-squat'
  | 'good-morning'
  | 'hack-squat'
  | 'hammer-curl'
  | 'hip-abduction'
  | 'hip-adduction'
  | 'hip-thrust'
  | 'incline-bench'
  | 'incline-chest-press'
  | 'jump-squat'
  | 'jumping-jack'
  | 'lat-pulldown'
  | 'lateral-lunge'
  | 'lateral-raise'
  | 'lateral-raise-machine'
  | 'leg-extension'
  | 'leg-press'
  | 'leg-raise'
  | 'lunge'
  | 'lying-leg-curl'
  | 'mountain-climber'
  | 'overhead-press'
  | 'overhead-triceps-extension'
  | 'pec-deck'
  | 'pike-push-up'
  | 'plank'
  | 'preacher-curl'
  | 'pull-up'
  | 'push-up'
  | 'reverse-crunch'
  | 'reverse-fly'
  | 'reverse-hyperextension'
  | 'reverse-lunge'
  | 'reverse-pec-deck'
  | 'romanian-deadlift'
  | 'rotary-torso'
  | 'russian-twist'
  | 'seated-calf-raise'
  | 'seated-leg-curl'
  | 'seated-row'
  | 'shoulder-press-machine'
  | 'shoulder-tap'
  | 'side-plank'
  | 'single-leg-calf-raise'
  | 'single-leg-glute-bridge'
  | 'single-leg-romanian-deadlift'
  | 'sit-up'
  | 'skipping'
  | 'skull-crusher'
  | 'smith-bench-press'
  | 'smith-shoulder-press'
  | 'smith-squat'
  | 'squat'
  | 'standing-calf-raise-machine'
  | 'step-up'
  | 'sumo-squat'
  | 'superman'
  | 'tricep-dip'
  | 't-bar-row'
  | 'triceps-press-machine'
  | 'wall-sit';

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
  { id: 'incline-chest-press', name: 'Incline chest press', ...MACHINE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'decline-chest-press', name: 'Decline chest press', ...MACHINE, primary: ['chest'], assisting: ['triceps'] },
  { id: 'smith-bench-press', name: 'Smith bench press', ...MACHINE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'cable-fly', name: 'Cable fly', ...MACHINE, primary: ['chest'], assisting: ['deltoids'] },
  { id: 'chest-supported-row', name: 'Chest-supported row', ...MACHINE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 't-bar-row', name: 'T-bar row', ...MACHINE, primary: ['upper-back'], assisting: ['biceps', 'lower-back'] },
  { id: 'assisted-pull-up', name: 'Assisted pull-up', ...MACHINE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'assisted-dip', name: 'Assisted dip', ...MACHINE, primary: ['triceps'], assisting: ['chest', 'deltoids'] },
  { id: 'reverse-pec-deck', name: 'Reverse pec deck', ...MACHINE, primary: ['deltoids'], assisting: ['upper-back'] },
  { id: 'lateral-raise-machine', name: 'Lateral raise machine', ...MACHINE, primary: ['deltoids'], assisting: [] },
  { id: 'cable-lateral-raise', name: 'Cable lateral raise', ...MACHINE, primary: ['deltoids'], assisting: [] },
  { id: 'smith-shoulder-press', name: 'Smith shoulder press', ...MACHINE, primary: ['deltoids'], assisting: ['triceps'] },
  { id: 'triceps-press-machine', name: 'Triceps press machine', ...MACHINE, primary: ['triceps'], assisting: [] },
  { id: 'cable-curl', name: 'Cable curl', ...MACHINE, primary: ['biceps'], assisting: ['forearm'] },
  { id: 'smith-squat', name: 'Smith squat', ...MACHINE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring', 'lower-back'] },
  { id: 'hack-squat', name: 'Hack squat', ...MACHINE, primary: ['quadriceps'], assisting: ['gluteal', 'hamstring'] },
  { id: 'hip-adduction', name: 'Hip adduction', ...MACHINE, primary: ['adductors'], assisting: [] },
  { id: 'glute-kickback-machine', name: 'Glute kickback machine', ...MACHINE, primary: ['gluteal'], assisting: ['hamstring'] },
  { id: 'reverse-hyperextension', name: 'Reverse hyperextension', ...MACHINE, primary: ['gluteal'], assisting: ['lower-back', 'hamstring'] },
  { id: 'seated-leg-curl', name: 'Seated leg curl', ...MACHINE, primary: ['hamstring'], assisting: [] },
  { id: 'standing-calf-raise-machine', name: 'Standing calf raise machine', ...MACHINE, primary: ['calves'], assisting: [] },
  { id: 'back-extension-machine', name: 'Back extension machine', ...MACHINE, primary: ['lower-back'], assisting: ['gluteal', 'hamstring'] },
  { id: 'rotary-torso', name: 'Rotary torso', ...MACHINE, primary: ['obliques'], assisting: ['abs'] },
  { id: 'cable-crunch', name: 'Cable crunch', ...MACHINE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'cable-woodchop', name: 'Cable woodchop', ...MACHINE, primary: ['obliques'], assisting: ['abs', 'deltoids'] },
  // Home and free-weight additions: bodyweight first, then dumbbells.
  { id: 'decline-push-up', name: 'Decline push-up', ...FREE, primary: ['chest'], assisting: ['triceps', 'deltoids'] },
  { id: 'diamond-push-up', name: 'Diamond push-up', ...FREE, primary: ['triceps'], assisting: ['chest', 'deltoids'] },
  { id: 'dumbbell-fly', name: 'Dumbbell fly', ...FREE, primary: ['chest'], assisting: ['deltoids'] },
  { id: 'overhead-triceps-extension', name: 'Overhead triceps extension', ...FREE, primary: ['triceps'], assisting: [] },
  { id: 'superman', name: 'Superman', ...FREE, primary: ['lower-back'], assisting: ['gluteal', 'upper-back'] },
  { id: 'back-extension', name: 'Back extension', ...FREE, primary: ['lower-back'], assisting: ['gluteal', 'hamstring'] },
  { id: 'good-morning', name: 'Good morning', ...FREE, primary: ['lower-back'], assisting: ['hamstring', 'gluteal'] },
  { id: 'dumbbell-row', name: 'Dumbbell row', ...FREE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'doorway-row', name: 'Doorway row', ...FREE, primary: ['upper-back'], assisting: ['biceps'] },
  { id: 'reverse-fly', name: 'Reverse fly', ...FREE, primary: ['upper-back'], assisting: ['deltoids'] },
  { id: 'pike-push-up', name: 'Pike push-up', ...FREE, primary: ['deltoids'], assisting: ['triceps', 'chest'] },
  { id: 'front-raise', name: 'Front raise', ...FREE, primary: ['deltoids'], assisting: ['chest'] },
  { id: 'arm-circle', name: 'Arm circles', ...FREE, primary: ['deltoids'], assisting: [] },
  { id: 'jumping-jack', name: 'Jumping jacks', ...FREE, primary: ['deltoids'], assisting: ['calves', 'adductors'] },
  { id: 'concentration-curl', name: 'Concentration curl', ...FREE, primary: ['biceps'], assisting: ['forearm'] },
  { id: 'crunch', name: 'Crunch', ...FREE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'reverse-crunch', name: 'Reverse crunch', ...FREE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'dead-bug', name: 'Dead bug', ...FREE, primary: ['abs'], assisting: ['obliques'] },
  { id: 'leg-raise', name: 'Leg raise', ...FREE, primary: ['abs'], assisting: [] },
  { id: 'mountain-climber', name: 'Mountain climber', ...FREE, primary: ['abs'], assisting: ['deltoids', 'quadriceps'] },
  { id: 'shoulder-tap', name: 'Shoulder tap', ...FREE, primary: ['abs'], assisting: ['deltoids', 'obliques'] },
  { id: 'bicycle-crunch', name: 'Bicycle crunch', ...FREE, primary: ['obliques'], assisting: ['abs'] },
  { id: 'side-plank', name: 'Side plank', ...FREE, primary: ['obliques'], assisting: ['abs'] },
  { id: 'jump-squat', name: 'Jump squat', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring', 'calves'] },
  { id: 'wall-sit', name: 'Wall sit', ...FREE, primary: ['quadriceps'], assisting: ['gluteal'] },
  { id: 'step-up', name: 'Step-up', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring'] },
  { id: 'reverse-lunge', name: 'Reverse lunge', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['hamstring'] },
  { id: 'lateral-lunge', name: 'Lateral lunge', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['adductors', 'hamstring'] },
  { id: 'sumo-squat', name: 'Sumo squat', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['adductors', 'hamstring'] },
  { id: 'goblet-squat', name: 'Goblet squat', ...FREE, primary: ['quadriceps', 'gluteal'], assisting: ['lower-back'] },
  { id: 'burpee', name: 'Burpee', ...FREE, primary: ['quadriceps'], assisting: ['chest', 'triceps', 'deltoids', 'abs'] },
  { id: 'glute-bridge', name: 'Glute bridge', ...FREE, primary: ['gluteal'], assisting: ['hamstring', 'lower-back'] },
  { id: 'single-leg-glute-bridge', name: 'Single-leg glute bridge', ...FREE, primary: ['gluteal'], assisting: ['hamstring'] },
  { id: 'donkey-kick', name: 'Donkey kick', ...FREE, primary: ['gluteal'], assisting: ['lower-back'] },
  { id: 'fire-hydrant', name: 'Fire hydrant', ...FREE, primary: ['gluteal'], assisting: ['adductors'] },
  { id: 'single-leg-romanian-deadlift', name: 'Single-leg Romanian deadlift', ...FREE, primary: ['hamstring'], assisting: ['gluteal', 'lower-back'] },
  { id: 'single-leg-calf-raise', name: 'Single-leg calf raise', ...FREE, primary: ['calves'], assisting: [] },
  { id: 'skipping', name: 'Skipping', ...FREE, primary: ['calves'], assisting: ['quadriceps', 'deltoids'] },
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

export function exercisesForMuscle(slug: MuscleSlug): ExerciseDef[] {
  return EXERCISES.filter((ex) => ex.primary.includes(slug) || ex.assisting.includes(slug));
}

export function exercisesForMuscleAndEquipment(slug: MuscleSlug, equipment: Equipment): ExerciseDef[] {
  return exercisesForMuscle(slug).filter((ex) => ex.equipment === equipment);
}

export function muscleLabel(slug: MuscleSlug): string {
  return LABELS[slug]?.name ?? slug;
}

export function allMuscleSlugs(): MuscleSlug[] {
  return Object.keys(LABELS) as MuscleSlug[];
}
