/**
 * Checks for keyboard-aware scrolling (npm run check:keyboard).
 */
import { revealOffset } from '../src/lib/keyboard-reveal.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// Field already clear of the keyboard (keyboard at 700, margin 24 -> visible bottom 676).
eq('field above keyboard needs no scroll', revealOffset({ fieldBottom: 600, keyboardTop: 700, margin: 24 }), 0);
// Field bottom exactly at the visible bottom needs no scroll.
eq('field exactly at visible bottom', revealOffset({ fieldBottom: 676, keyboardTop: 700, margin: 24 }), 0);
// Field hidden behind the keyboard: scroll by the overlap plus the margin.
eq('field under keyboard scrolls by overlap', revealOffset({ fieldBottom: 900, keyboardTop: 700, margin: 24 }), 224);
// Fractional overlap rounds up so the field is never left half-covered.
eq('fractional overlap rounds up', revealOffset({ fieldBottom: 676.4, keyboardTop: 700, margin: 24 }), 1);
// No margin: scroll exactly to the keyboard edge.
eq('zero margin', revealOffset({ fieldBottom: 710, keyboardTop: 700, margin: 0 }), 10);

console.log(fails === 0 ? 'keyboard reveal: all checks passed' : `keyboard reveal: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
