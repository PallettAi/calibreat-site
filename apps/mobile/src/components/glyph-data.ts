/**
 * Design data for the two home-header glyphs: the streak flame and the water drop.
 *
 * Both marks are 24×24 art that has to survive being drawn at ~22 px inside a
 * 38 px button, so every variant stays on a small set of primitives (a filled
 * silhouette, an outline, and — for water — a fill that rises with intake).
 *
 * Why data instead of JSX: `apps/mobile/scripts/glyph-gallery.mjs` renders the
 * same records into `brand/glyph-gallery.html`, so the design review and the app
 * can never drift. `check-glyphs.mjs` validates the numbers here.
 *
 * Flip ACTIVE_FIRE / ACTIVE_WATER to change what the home page draws.
 */

/** Named colours the renderer resolves against the live theme. */
export type GlyphToken = 'color' | 'soft' | 'inner' | 'white' | 'line';

export type GlyphShape =
  | {
      t: 'path';
      d: string;
      fill?: GlyphToken;
      stroke?: GlyphToken;
      sw?: number;
      opacity?: number;
      cap?: 'round' | 'butt';
      join?: 'round' | 'miter';
    }
  | {
      t: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: GlyphToken;
      sw: number;
      opacity?: number;
      cap?: 'round' | 'butt';
    }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: GlyphToken; opacity?: number }
  /** Reservoir fill, clipped to `clip` and rising with the water percentage. */
  | { t: 'rise'; fill: GlyphToken; opacity?: number }
  /** Horizontal line pinned to the water surface (instrument "level reading").
   *  `clip` keeps it inside the drop, so a full mark never grows a bar across the tip. */
  | { t: 'level'; x1: number; x2: number; stroke: GlyphToken; sw: number; opacity?: number; clip?: boolean }
  /** Dot pinned to the water surface, at a fixed x. */
  | { t: 'levelDot'; x: number; r: number; fill: GlyphToken; opacity?: number };

export type GlyphVariant = {
  id: string;
  name: string;
  /** One line of design intent, shown in the review gallery. */
  note: string;
  viewBox: { w: number; h: number };
  /** Closed path used as the clip for `rise`. Water variants require it. */
  clip?: string;
  /** The y-range the `rise` fill travels between (empty → full). */
  reservoir?: { top: number; bottom: number };
  /** Painted in order. */
  shapes: GlyphShape[];
};

/* ── Fire ────────────────────────────────────────────────────────────── */

// Two peaks (a taller right tongue and a shorter left one) so a single flat
// tone still reads as fire rather than as another droplet.
const F1_EMBER =
  'M14.2 2.6C12.6 5 11.4 7 10 8.8C9 8 7.8 7 6.4 6C5.2 9.6 4.8 12.6 4.8 15.6C4.8 19.6 8 22 12 22C16 22 19.2 19.4 19.2 15.2C19.2 12 17.4 9.6 15.8 7.4C15.2 6.6 14.6 4.6 14.2 2.6Z';

const F2_FLAME =
  'M11.2 5.2C8.2 8.8 5.6 11.6 5.6 15.6C5.6 19.5 8.4 21.9 12 21.9C15.8 21.9 18.4 19.2 18.4 15.2C18.4 11.6 15.4 8.4 11.2 5.2Z';
const F2_TONGUE =
  'M11.9 13.2C10.7 14.9 9.8 16.1 9.8 17.5C9.8 19.2 10.8 20.3 12.1 20.3C13.5 20.3 14.4 19.2 14.4 17.4C14.4 16 13.3 14.7 11.9 13.2Z';
const F2_SPARK =
  'M16.8 1.9C15.3 3.7 14.3 5 14.3 6.4C14.3 7.7 15.3 8.6 16.7 8.6C18.1 8.6 19.1 7.7 19.1 6.3C19.1 5 18 3.6 16.8 1.9Z';

const F3_OUTLINE =
  'M13 3.2C9.9 7.4 6.4 10.6 6.4 15.1C6.4 19 9.4 21.7 12.4 21.7C15.6 21.7 18.4 19.1 18.4 15.2C18.4 11.4 15.6 7 13 3.2Z';
const F3_LICK =
  'M12.6 20.6C10.6 20.2 9.4 18.8 9.4 17C9.4 15.1 10.9 13.8 11.9 12.2C12.4 13.4 13.1 14 14 14.3C15.1 12.7 16.2 11.6 16.8 10.4';

const F4_BODY = 'M12.6 2.2L16.8 8.6L18.4 13.4L16.2 20.4L8.2 20.8L5.6 15.4L8.4 9.4Z';
const F4_INNER = 'M12.6 8.2L15.4 12.6L15.9 15.6L14.4 18.6L11.2 18.8L9.6 15.6L11 11.6Z';

const F5_FLAME =
  'M12 4.6C9.6 8 7.4 10.4 7.4 14.2C7.4 18 9.5 21 12.1 21C14.9 21 16.9 18.4 16.9 14.6C16.9 11.1 14.4 7.6 12 4.6Z';
const F5_TONGUE =
  'M12.1 12.6C11 14.2 10.2 15.4 10.2 16.9C10.2 18.6 11 19.7 12.1 19.7C13.3 19.7 14.1 18.6 14.1 16.9C14.1 15.5 13.3 14.2 12.1 12.6Z';

export const FIRE_VARIANTS: GlyphVariant[] = [
  {
    id: 'f1',
    name: 'Ember',
    note: 'One flat tone, two peaks. The calmest mark in the set, and the only one that needs no lighter inner tone to read as fire.',
    viewBox: { w: 24, h: 24 },
    shapes: [{ t: 'path', d: F1_EMBER, fill: 'color' }],
  },
  {
    id: 'f2',
    name: 'Spark',
    note: 'Classic flame with a light inner tongue and a detached spark up to the right — "energy out" with a little lift.',
    viewBox: { w: 24, h: 24 },
    shapes: [
      { t: 'path', d: F2_FLAME, fill: 'color' },
      { t: 'path', d: F2_TONGUE, fill: 'inner', opacity: 0.95 },
      { t: 'path', d: F2_SPARK, fill: 'soft', opacity: 0.9 },
    ],
  },
  {
    id: 'f3',
    name: 'Gauge',
    note: 'Drawn, not filled: stroked outline plus an inner lick. Speaks the same drafting language as the calibration dial.',
    viewBox: { w: 24, h: 24 },
    shapes: [
      { t: 'path', d: F3_OUTLINE, stroke: 'color', sw: 1.6, join: 'round' },
      { t: 'path', d: F3_LICK, stroke: 'color', sw: 1.3, cap: 'round', opacity: 0.85 },
    ],
  },
  {
    id: 'f4',
    name: 'Facet',
    note: 'Straight edges only, two tones. Hardest, most digital of the set — pairs with the angular water Prism.',
    viewBox: { w: 24, h: 24 },
    shapes: [
      { t: 'path', d: F4_BODY, fill: 'color' },
      { t: 'path', d: F4_INNER, fill: 'inner', opacity: 0.85 },
    ],
  },
  {
    id: 'f5',
    name: 'Burner',
    note: 'Flame over a burner bar — a pilot light rather than a campfire. Reads as a readout you can trust.',
    viewBox: { w: 24, h: 24 },
    shapes: [
      { t: 'path', d: F5_FLAME, fill: 'color' },
      { t: 'path', d: F5_TONGUE, fill: 'inner', opacity: 0.9 },
      { t: 'line', x1: 4.4, y1: 22.4, x2: 19.6, y2: 22.4, stroke: 'color', sw: 1.6, cap: 'round', opacity: 0.9 },
    ],
  },
];

/* ── Water ───────────────────────────────────────────────────────────── */

const W1_DROP =
  'M12 1.9C12 1.9 4.5 10.4 4.5 15.3a7.5 7.5 0 0 0 15 0C19.5 10.4 12 1.9 12 1.9Z';
const W1_GLINT = 'M9.2 14.6C9.3 12.8 10.5 11.5 11.3 10.2';

const W2_DROP =
  'M12 1.8L17.4 10.4L19.1 15.6C19.1 19.5 15.9 22.6 12 22.6C8.1 22.6 4.9 19.5 4.9 15.6L6.6 10.4Z';
const W2_FACET =
  'M12 1.8L17.4 10.4L19.1 15.6C19.1 19.5 15.9 22.6 12 22.6Z';

const W3_DROP =
  'M12 2.2C12 2.2 5 10.6 5 15.4a7 7 0 0 0 14 0C19 10.6 12 2.2 12 2.2Z';

const W4_VESSEL =
  'M6.6 3.4L17.4 3.4L16.2 20.2C16.1 21.5 15.2 22.4 13.9 22.4L10.1 22.4C8.8 22.4 7.9 21.5 7.8 20.2Z';

const W5_DROP =
  'M10.4 6.6C10.4 6.6 4.4 13.4 4.4 17.4a6 6 0 0 0 12 0C16.4 13.4 10.4 6.6 10.4 6.6Z';
const W5_SATELLITE =
  'M18.2 2.6C18.2 2.6 15.4 5.9 15.4 7.9a2.8 2.8 0 0 0 5.6 0C21 5.9 18.2 2.6 18.2 2.6Z';

export const WATER_VARIANTS: GlyphVariant[] = [
  {
    id: 'w1',
    name: 'Drop',
    note: 'The shape the app ships today, redrawn on a 24 px grid with a shoulder glint. Safest, most familiar.',
    viewBox: { w: 24, h: 24 },
    clip: W1_DROP,
    reservoir: { top: 2.6, bottom: 22.8 },
    shapes: [
      { t: 'path', d: W1_DROP, fill: 'soft', opacity: 0.14 },
      { t: 'rise', fill: 'color' },
      { t: 'path', d: W1_DROP, stroke: 'color', sw: 1.7, join: 'round' },
      { t: 'path', d: W1_GLINT, stroke: 'white', sw: 1.35, cap: 'round', opacity: 0.55 },
    ],
  },
  {
    id: 'w2',
    name: 'Prism',
    note: 'Crystal cut: straight shoulders, one bright facet on the right. Reads sharp and technical next to the facet flame.',
    viewBox: { w: 24, h: 24 },
    clip: W2_DROP,
    reservoir: { top: 2.2, bottom: 22.6 },
    shapes: [
      { t: 'path', d: W2_DROP, fill: 'soft', opacity: 0.14 },
      { t: 'rise', fill: 'color' },
      { t: 'path', d: W2_FACET, fill: 'white', opacity: 0.16 },
      { t: 'path', d: W2_DROP, stroke: 'color', sw: 1.7, join: 'round' },
    ],
  },
  {
    id: 'w3',
    name: 'Level',
    note: 'The drop plus a surface line that rides the intake, clipped to the silhouette: the percentage drawn as an instrument reading rather than a fill.',
    viewBox: { w: 24, h: 24 },
    clip: W3_DROP,
    reservoir: { top: 2.6, bottom: 22.4 },
    shapes: [
      { t: 'path', d: W3_DROP, fill: 'soft', opacity: 0.12 },
      { t: 'rise', fill: 'color', opacity: 0.85 },
      { t: 'level', x1: 2.4, x2: 21.6, stroke: 'color', sw: 1.8, clip: true },
      { t: 'path', d: W3_DROP, stroke: 'color', sw: 1.6, join: 'round' },
    ],
  },
  {
    id: 'w4',
    name: 'Vessel',
    note: 'A glass instead of a drop: the fill rises and a meniscus line rides it. Tallest silhouette of the set, unmistakably a measuring instrument.',
    viewBox: { w: 24, h: 24 },
    clip: W4_VESSEL,
    reservoir: { top: 3.4, bottom: 22.4 },
    shapes: [
      { t: 'path', d: W4_VESSEL, fill: 'soft', opacity: 0.14 },
      { t: 'rise', fill: 'color' },
      { t: 'path', d: W4_VESSEL, stroke: 'color', sw: 1.7, join: 'round' },
      { t: 'line', x1: 5.4, y1: 3.3, x2: 18.6, y2: 3.3, stroke: 'color', sw: 1.8, cap: 'round' },
      { t: 'level', x1: 8.4, x2: 15.6, stroke: 'white', sw: 1.3, opacity: 0.5 },
    ],
  },
  {
    id: 'w5',
    name: 'Pair',
    note: 'A drop with a satellite drop trailing it — motion, so a topped-up day feels like something is pouring rather than filling.',
    viewBox: { w: 24, h: 24 },
    clip: W5_DROP,
    reservoir: { top: 6.8, bottom: 23.4 },
    shapes: [
      { t: 'path', d: W5_DROP, fill: 'soft', opacity: 0.14 },
      { t: 'rise', fill: 'color' },
      { t: 'path', d: W5_DROP, stroke: 'color', sw: 1.7, join: 'round' },
      { t: 'path', d: W5_SATELLITE, fill: 'soft', opacity: 0.35 },
      { t: 'path', d: W5_SATELLITE, stroke: 'color', sw: 1.5, join: 'round' },
    ],
  },
];

/** Which variant the home header draws. */
export const ACTIVE_FIRE = 'f3';
export const ACTIVE_WATER = 'w5';

export function findVariant(variants: GlyphVariant[], id: string): GlyphVariant {
  const found = variants.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown glyph variant "${id}"`);
  return found;
}
