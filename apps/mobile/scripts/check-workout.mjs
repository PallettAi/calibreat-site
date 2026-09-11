/**
 * Accuracy checks for Train session duration and estimated extra kcal.
 * Independent literals: Mifflin BMR from check:math, Compendium MET × BMR × time.
 */
import { bmr } from '../src/lib/nutrition.ts';
import { sessionDurationSec, sessionKcal } from '../src/lib/workout.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) < 0.15 : Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}, want ${want}`);
};

// Sit-up: 3s/rep, 45s rest. 3×12 → 108s work + 90s rest = 198s
eq('sit-up 3x12 duration', sessionDurationSec('sit-up', 3, 12), 198);
eq('zero sets is zero time', sessionDurationSec('sit-up', 0, 12), 0);
eq('zero reps is zero time', sessionDurationSec('sit-up', 3, 0), 0);

const male30 = bmr({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 });
eq('fixture BMR male 30', male30, 1780);
// 1780 × 8 MET × 198s / 86400s = 32.63 → 33
eq('sit-up 3x12 male 30y 80kg', sessionKcal({ bmr: male30, exerciseId: 'sit-up', sets: 3, reps: 12 }), 33);

const female30 = bmr({ sex: 'female', ageYears: 30, heightCm: 180, weightKg: 80 });
eq('fixture BMR female 30', female30, 1614);
eq('sit-up 3x12 female 30y same weight is lower', sessionKcal({ bmr: female30, exerciseId: 'sit-up', sets: 3, reps: 12 }), 30);

const male55 = bmr({ sex: 'male', ageYears: 55, heightCm: 180, weightKg: 80 });
eq('fixture BMR male 55', male55, 1655);
// 10×15 sit-up: 450s work + 405s rest = 855s
eq('sit-up 10x15 duration', sessionDurationSec('sit-up', 10, 15), 855);
eq('older male burns less at same sets', sessionKcal({ bmr: male55, exerciseId: 'sit-up', sets: 10, reps: 15 }), 131);
eq('younger male 10x15', sessionKcal({ bmr: male30, exerciseId: 'sit-up', sets: 10, reps: 15 }), 141);

// Squat: 4s/rep, 90s rest, MET 6. 3×5 → 60s + 180s = 240s
eq('squat 3x5 duration', sessionDurationSec('squat', 3, 5), 240);
eq('squat 3x5 male 30', sessionKcal({ bmr: male30, exerciseId: 'squat', sets: 3, reps: 5 }), 30);

eq('unknown lift is zero kcal', sessionKcal({ bmr: male30, exerciseId: 'kettlebell-swing', sets: 3, reps: 10 }), 0);

// Push-up: 2s/rep, 45s rest, MET 8. 3×10 → 60s + 90s = 150s
eq('push-up 3x10 duration', sessionDurationSec('push-up', 3, 10), 150);
// 1780 × 8 × 150 / 86400 = 24.72 → 25
eq('push-up 3x10 male 30', sessionKcal({ bmr: male30, exerciseId: 'push-up', sets: 3, reps: 10 }), 25);

// Bench: 3s/rep, 90s rest, MET 6. 3×10 → 90s + 180s = 270s
eq('bench 3x10 duration', sessionDurationSec('bench-press', 3, 10), 270);
// 1780 × 6 × 270 / 86400 = 33.38 → 33
eq('bench 3x10 male 30', sessionKcal({ bmr: male30, exerciseId: 'bench-press', sets: 3, reps: 10 }), 33);

// Plank: 20s/rep, 30s rest, MET 4. 3×10 → 600s + 60s = 660s
eq('plank 3x10 duration', sessionDurationSec('plank', 3, 10), 660);
// 1780 × 4 × 660 / 86400 = 54.40 → 54
eq('plank 3x10 male 30', sessionKcal({ bmr: male30, exerciseId: 'plank', sets: 3, reps: 10 }), 54);

// Chest press machine: 3s/rep, 60s rest, MET 3.5. 3×10 → 90s + 120s = 210s
eq('chest-press 3x10 duration', sessionDurationSec('chest-press', 3, 10), 210);
// 1780 × 3.5 × 210 / 86400 = 15.14 → 15
eq('chest-press 3x10 male 30', sessionKcal({ bmr: male30, exerciseId: 'chest-press', sets: 3, reps: 10 }), 15);

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
console.log('\nall workout checks passed');
