/**
 * Fire + water glyph geometry checks (npm run check:glyphs).
 *
 * The icons are hand-authored SVG on a 24 px grid and are drawn at ~22 px, so a
 * stray decimal or a missing command turns into a silent blob on the home
 * header. This walks every path, checks command arity, and keeps the art inside
 * its viewBox. Arc bounds assume what the art actually uses: axis-aligned
 * arcs no wider than a semicircle, bounded by the chord midpoint ± radius.
 */
import { ACTIVE_FIRE, ACTIVE_WATER, FIRE_VARIANTS, WATER_VARIANTS } from '../src/components/glyph-data.ts';

let fails = 0;
const ok = (label) => console.log(`PASS  ${label}`);
const bad = (label, detail) => {
  fails++;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const check = (label, condition, detail) => (condition ? ok(label) : bad(label, detail));

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TOKENS = new Set(['color', 'soft', 'inner', 'white', 'line']);

/** Bounding box of a path, control points included (conservative). */
function pathBounds(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const pts = [];
  const push = (px, py) => pts.push([px, py]);

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[A-Za-z]$/.test(token)) {
      cmd = token;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        x = startX;
        y = startY;
        push(x, y);
        continue;
      }
    } else if (!cmd) {
      return { error: 'numbers before the first command' };
    }

    const upper = cmd.toUpperCase();
    const n = ARITY[upper];
    if (n === undefined) return { error: `unknown command "${cmd}"` };
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some((a) => !Number.isFinite(a))) {
      return { error: `${cmd} near index ${i} does not have ${n} finite numbers` };
    }
    i += n;
    const rel = cmd !== upper;
    const ax = (v) => (rel ? x + v : v);
    const ay = (v) => (rel ? y + v : v);

    switch (upper) {
      case 'M':
        x = ax(args[0]);
        y = ay(args[1]);
        startX = x;
        startY = y;
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = ax(args[0]);
        y = ay(args[1]);
        break;
      case 'H':
        x = ax(args[0]);
        break;
      case 'V':
        y = ay(args[0]);
        break;
      case 'C':
        push(ax(args[0]), ay(args[1]));
        push(ax(args[2]), ay(args[3]));
        x = ax(args[4]);
        y = ay(args[5]);
        break;
      case 'S':
      case 'Q':
        push(ax(args[0]), ay(args[1]));
        x = ax(args[2]);
        y = ay(args[3]);
        break;
      case 'T':
        x = ax(args[0]);
        y = ay(args[1]);
        break;
      case 'A': {
        if (args[2] !== 0) return { error: `rotated arc (x-axis-rotation ${args[2]}) is not supported by the bounds check` };
        x = ax(args[5]);
        y = ay(args[6]);
        // Chord midpoint ± radius bounds any arc up to a semicircle.
        const mx = (x + (rel ? x - args[5] : args[5])) / 2;
        const my = (y + (rel ? y - args[6] : args[6])) / 2;
        push(mx - args[0], my - args[1]);
        push(mx + args[0], my + args[1]);
        break;
      }
      default:
        break;
    }
    push(x, y);
  }

  if (!pts.length) return { error: 'no coordinates found' };
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

const FAMILIES = [
  { label: 'fire', variants: FIRE_VARIANTS, active: ACTIVE_FIRE, prefix: 'f', clip: false },
  { label: 'water', variants: WATER_VARIANTS, active: ACTIVE_WATER, prefix: 'w', clip: true },
];

for (const family of FAMILIES) {
  console.log(`\n── ${family.label} ──`);
  check(`${family.label}: has variants`, family.variants.length >= 3, `only ${family.variants.length}`);
  check(
    `${family.label}: ids unique and prefixed "${family.prefix}"`,
    family.variants.every((v, idx) => v.id.startsWith(family.prefix) && family.variants.findIndex((o) => o.id === v.id) === idx),
  );
  check(
    `${family.label}: active id "${family.active}" exists`,
    family.variants.some((v) => v.id === family.active),
    `known: ${family.variants.map((v) => v.id).join(', ')}`,
  );

  for (const variant of family.variants) {
    const tag = `${family.label}/${variant.id} ${variant.name}`;
    check(`${tag}: named + documented`, !!variant.name && variant.note.length > 40);
    check(`${tag}: square 24 grid`, variant.viewBox.w === 24 && variant.viewBox.h === 24, JSON.stringify(variant.viewBox));
    check(`${tag}: has shapes`, variant.shapes.length > 0);

    if (family.clip) {
      check(`${tag}: has a clip path`, typeof variant.clip === 'string' && variant.clip.length > 0);
      check(`${tag}: has rise + reservoir`, variant.shapes.some((s) => s.t === 'rise') && !!variant.reservoir);
      if (variant.reservoir) {
        const { top, bottom } = variant.reservoir;
        check(
          `${tag}: reservoir inside the grid`,
          top > 0 && bottom > top && bottom <= variant.viewBox.h,
          `top ${top}, bottom ${bottom}`,
        );
      }
    } else {
      check(`${tag}: no clip/rise (fire is a flat silhouette)`, !variant.clip && !variant.shapes.some((s) => s.t === 'rise'));
    }

    if (variant.clip) {
      const bounds = pathBounds(variant.clip);
      check(`${tag}: clip path parses`, !bounds.error, bounds.error);
      if (!bounds.error) {
        check(
          `${tag}: clip inside the grid`,
          bounds.minX >= -0.6 && bounds.minY >= -0.6 && bounds.maxX <= variant.viewBox.w + 0.6 && bounds.maxY <= variant.viewBox.h + 0.6,
          `x ${bounds.minX}–${bounds.maxX}, y ${bounds.minY}–${bounds.maxY}`,
        );
      }
    }

    for (const shape of variant.shapes) {
      const label = `${tag}/${shape.t}`;
      for (const key of ['fill', 'stroke']) {
        if (shape[key]) check(`${label}: ${key} token "${shape[key]}"`, TOKENS.has(shape[key]));
      }
      if (shape.opacity !== undefined) check(`${label}: opacity in range`, shape.opacity >= 0 && shape.opacity <= 1, String(shape.opacity));
      if (shape.sw !== undefined) check(`${label}: stroke width positive`, shape.sw > 0 && shape.sw <= 2.4, String(shape.sw));
      if (shape.t === 'path') {
        check(`${label}: draws something`, shape.fill !== undefined || shape.stroke !== undefined);
        const bounds = pathBounds(shape.d);
        check(`${label}: path parses`, !bounds.error, bounds.error);
        if (!bounds.error) {
          check(
            `${label}: inside the grid`,
            bounds.minX >= -0.6 && bounds.minY >= -0.6 && bounds.maxX <= variant.viewBox.w + 0.6 && bounds.maxY <= variant.viewBox.h + 0.6,
            `x ${bounds.minX}–${bounds.maxX}, y ${bounds.minY}–${bounds.maxY}`,
          );
        }
      }
      if (shape.t === 'level') {
        check(`${label}: level spans left to right`, shape.x1 < shape.x2);
        check(`${label}: level inside the grid`, shape.x1 >= 0 && shape.x2 <= variant.viewBox.w);
      }
      if (shape.t === 'levelDot') {
        check(`${label}: dot inside the grid`, shape.x - shape.r >= 0 && shape.x + shape.r <= variant.viewBox.w);
      }
      if (shape.t === 'line') {
        check(
          `${label}: line inside the grid`,
          Math.min(shape.x1, shape.x2) >= 0 && Math.max(shape.x1, shape.x2) <= variant.viewBox.w && Math.min(shape.y1, shape.y2) >= 0 && Math.max(shape.y1, shape.y2) <= variant.viewBox.h,
        );
      }
      if (shape.t === 'circle') {
        check(`${label}: circle inside the grid`, shape.cx - shape.r >= 0 && shape.cx + shape.r <= variant.viewBox.w && shape.cy - shape.r >= 0 && shape.cy + shape.r <= variant.viewBox.h);
      }
    }
  }
}

const allIds = [...FIRE_VARIANTS, ...WATER_VARIANTS].map((v) => v.id);
check('ids unique across both families', new Set(allIds).size === allIds.length, allIds.join(', '));

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
