/**
 * Share-card templates: which shape the image is, and which look it wears.
 *
 * A card is posted to very different places. Instagram feed wants 4:5, a story
 * wants a full 9:16 frame, X and Facebook want a wide link card, and a square
 * is the one size that survives everywhere. One 4:5 image made the app look
 * broken in a story (letterboxed with huge bars) and mediocre on X, so the
 * format is part of the request now, not an afterthought.
 *
 * This module is the whole design decision table: sizes, palettes, the insets
 * Stories need so the platform UI never sits on top of the numbers, and the
 * **budget maths** that keeps a card from outgrowing its own frame.
 *
 * That last part is not decoration. A card is a fixed-size box with
 * `overflow: hidden`; if its content is 60 px taller than the box, the capture
 * silently loses the footer (the QR and the site link — the only part that
 * grows the app). So no template hard-codes a font size. Every size here is
 * derived from the space that actually exists for it, and `splitBudget` hands
 * out the vertical space so the parts can never sum to more than the whole.
 *
 * Deliberately dependency-free and pure so it runs under
 * scripts/check-share.mjs (the same leaf-module pattern as share-card.ts).
 */

export type ShareFormatId = 'square' | 'portrait' | 'story' | 'wide';
export type ShareTemplateId = 'medal' | 'goal' | 'instrument' | 'grid' | 'paper' | 'terminal';
export type ShareCardMode = 'dark' | 'light';

export type ShareFormat = {
  id: ShareFormatId;
  /** Final image size in px — the size the platform actually receives. */
  width: number;
  height: number;
  label: string;
  /** Where this shape is the right choice. Shown under the picker. */
  hint: string;
  /**
   * Space the platform's own chrome covers, in final-image px. Stories put the
   * profile row on top and the reply bar on the bottom, so content must stay
   * inside this. Zero for the shapes the platform shows whole.
   */
  safeTopPx: number;
  safeBottomPx: number;
};

/**
 * Export scale: the card is laid out small (cheap Views, crisp text) and
 * captured at 3× through react-native-view-shot's width/height options. Every
 * layout constant below is in *base* px, i.e. final ÷ SHARE_RENDER_SCALE.
 */
export const SHARE_RENDER_SCALE = 3;

/**
 * The style every full-canvas decor layer (mesh, grain, scanlines, rings) must
 * carry. Not cosmetic — without it the cards render visibly wrong on web.
 *
 * The decor wrapper is a full-bleed box that lays its children out in a column
 * (React Native's default `flexDirection`). On native, RN's default
 * `flexShrink: 0` keeps those layers at their own height. On web,
 * react-native-svg renders a bare `<svg>` element, which inherits the browser
 * default `flex-shrink: 1` — so N layers of full canvas height share the
 * container and each is squashed to 1/N of it. Measured: two decor layers on a
 * 450px card laid out 225px tall each.
 *
 * The visual result is subtle enough to read as "the design looks flat" rather
 * than as a bug: the mesh gradient stops halfway down the card and the grain
 * lands only on the half that no longer has a gradient. Taking the layers out
 * of flow is the fix, and `check-share.mjs` asserts this constant stays
 * absolute because the failure is invisible to the eye.
 */
export const SHARE_DECOR_LAYER_STYLE = { position: 'absolute', top: 0, left: 0 } as const;

export const SHARE_FORMATS: Record<ShareFormatId, ShareFormat> = {
  square: {
    id: 'square',
    width: 1080,
    height: 1080,
    label: 'Square',
    hint: 'Safe everywhere · Instagram · X · Facebook',
    safeTopPx: 0,
    safeBottomPx: 0,
  },
  portrait: {
    id: 'portrait',
    width: 1080,
    height: 1350,
    label: 'Portrait',
    hint: 'Tallest Instagram feed post',
    safeTopPx: 0,
    safeBottomPx: 0,
  },
  story: {
    id: 'story',
    width: 1080,
    height: 1920,
    label: 'Story',
    hint: 'Instagram · Facebook story and Reel cover',
    // Instagram overlays the profile row up top and the reply box at the
    // bottom; the caption panel is ~250 px tall, the reply bar ~340 px.
    safeTopPx: 250,
    safeBottomPx: 340,
  },
  wide: {
    id: 'wide',
    width: 1200,
    height: 630,
    label: 'Wide',
    hint: 'X post image · Facebook link card',
    safeTopPx: 0,
    safeBottomPx: 0,
  },
};

export const SHARE_FORMAT_IDS: ShareFormatId[] = ['square', 'portrait', 'story', 'wide'];

export const DEFAULT_SHARE_FORMAT: ShareFormatId = 'portrait';

export type SharePalette = {
  mode: ShareCardMode;
  background: string;
  /**
   * Darkest tone, for the gradient's far corner and the vignette.
   *
   * The card is not a flat fill. A single flat colour is what makes a generated
   * image read as "screenshot" instead of "post": the eye gets no depth, no
   * falloff, nothing to hold. A mesh of `deep` → `glow` over `background`, plus
   * grain, is the cheapest way to look designed rather than printed.
   */
  deep: string;
  /** Saturated mid-tone the mesh gradient blooms from. */
  glow: string;
  /** Slightly raised blocks (panels, rows) on `background`. */
  surface: string;
  /**
   * Tinted fill for the one large colour block a composition may use (the
   * calendar panel, a metric slab). A translucent accent tint rather than a
   * grey step: the second tone has to belong to the accent family or the block
   * reads as a placeholder box.
   */
  block: string;
  text: string;
  muted: string;
  accent: string;
  /** Text that sits *on* `accent` fills. */
  accentInk: string;
  /**
   * Secondary data colour — the second series in a chart, a stamp, a unit.
   * Body copy stays greyscale so the card has exactly one loud colour.
   */
  ink2: string;
  hairline: string;
  /** RGBA for the film-grain speckle, already at its final opacity. */
  speckle: string;
};

export type ShareTemplate = {
  id: ShareTemplateId;
  name: string;
  /** One-line description for the picker. */
  blurb: string;
  palette: SharePalette;
  /**
   * Which format this look was composed for. The renderer still supports every
   * pair; this only drives the picker's default suggestion.
   */
  bestFor: ShareFormatId;
};

/**
 * High-contrast pairs checked against WCAG AA so the numbers stay readable
 * once the platform re-compresses the PNG: body text ≥ 4.5:1 on its own
 * background, and accent ink ≥ 4.5:1 on the accent fill.
 */
export const SHARE_TEMPLATES: Record<ShareTemplateId, ShareTemplate> = {
  /**
   * The achievement cards. `medal` and `goal` are the app-chrome idiom — a
   * bordered header bar with the wordmark in it, an arched medal, a claim
   * stamped next to the number, and a ringed identity strip at the bottom. They
   * are the default because this is the shape people already know how to read
   * from every other training app, and a share card only works if it reads in
   * half a second.
   */
  medal: {
    id: 'medal',
    name: 'Medal',
    blurb: 'An earned medal on your week',
    bestFor: 'portrait',
    palette: {
      mode: 'dark',
      background: '#070B11',
      deep: '#03050A',
      glow: '#1B301A',
      surface: '#101720',
      block: 'rgba(183,233,60,0.08)',
      text: '#F2F5F7',
      muted: '#A6B2BA',
      accent: '#B7E93C',
      accentInk: '#070C12',
      // Metal gold as the secondary: medals, best-run figures, dividers.
      ink2: '#F2CE74',
      hairline: 'rgba(255,255,255,0.14)',
      speckle: 'rgba(255,255,255,0.055)',
    },
  },
  goal: {
    id: 'goal',
    name: 'Goal',
    blurb: 'Progress bar and activity rings',
    bestFor: 'square',
    palette: {
      mode: 'dark',
      background: '#070C14',
      deep: '#03060B',
      glow: '#123A63',
      surface: '#0E1724',
      block: 'rgba(52,226,155,0.10)',
      text: '#EEF4FA',
      muted: '#A2B0C0',
      accent: '#34E29B',
      accentInk: '#03150C',
      ink2: '#FFB86B',
      hairline: 'rgba(255,255,255,0.13)',
      speckle: 'rgba(255,255,255,0.05)',
    },
  },
  instrument: {
    id: 'instrument',
    name: 'Instrument',
    blurb: 'Dark dial, one hero number',
    bestFor: 'portrait',
    palette: {
      mode: 'dark',
      background: '#0A0F17',
      deep: '#04070C',
      glow: '#123A2A',
      surface: '#121A26',
      block: 'rgba(183,233,60,0.07)',
      text: '#EEF3F7',
      muted: '#A8B4BF',
      accent: '#B7E93C',
      accentInk: '#070C12',
      ink2: '#5AD9C6',
      hairline: 'rgba(255,255,255,0.13)',
      speckle: 'rgba(255,255,255,0.055)',
    },
  },
  grid: {
    id: 'grid',
    name: 'Grid',
    blurb: 'Your streak as a calendar',
    bestFor: 'square',
    palette: {
      mode: 'dark',
      background: '#08111F',
      deep: '#03070E',
      glow: '#12365F',
      surface: '#101B2C',
      block: 'rgba(52,226,155,0.11)',
      text: '#EEF4FA',
      muted: '#A2B0C0',
      accent: '#34E29B',
      accentInk: '#03150C',
      ink2: '#8FB6FF',
      hairline: 'rgba(255,255,255,0.11)',
      speckle: 'rgba(255,255,255,0.045)',
    },
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    blurb: 'Light, editorial, calm',
    bestFor: 'wide',
    palette: {
      mode: 'light',
      background: '#F4F1E9',
      deep: '#E3DCCB',
      glow: '#FFF7E4',
      surface: '#FFFDF7',
      block: '#FBF5E7',
      text: '#15191B',
      muted: '#565C55',
      accent: '#17663B',
      accentInk: '#FFFFFF',
      ink2: '#A8532C',
      hairline: 'rgba(21,25,27,0.16)',
      speckle: 'rgba(21,25,27,0.05)',
    },
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    blurb: 'The week as data',
    bestFor: 'wide',
    palette: {
      mode: 'dark',
      background: '#05090C',
      deep: '#010305',
      glow: '#0D2A1C',
      surface: '#0A1418',
      block: 'rgba(125,247,166,0.09)',
      text: '#E8F0EC',
      muted: '#93A29A',
      // Phosphor green, deliberately not the brand lime: the two dark
      // templates have to look like different products, not one look recoloured.
      accent: '#7DF7A6',
      accentInk: '#04150A',
      ink2: '#5AC8FF',
      hairline: 'rgba(125,247,166,0.20)',
      speckle: 'rgba(255,255,255,0.05)',
    },
  },
};

export const SHARE_TEMPLATE_IDS: ShareTemplateId[] = ['medal', 'goal', 'instrument', 'grid', 'paper', 'terminal'];

export const DEFAULT_SHARE_TEMPLATE: ShareTemplateId = 'medal';

export function isShareFormatId(value: unknown): value is ShareFormatId {
  return typeof value === 'string' && SHARE_FORMAT_IDS.includes(value as ShareFormatId);
}

export function isShareTemplateId(value: unknown): value is ShareTemplateId {
  return typeof value === 'string' && SHARE_TEMPLATE_IDS.includes(value as ShareTemplateId);
}

export function getShareFormat(id: ShareFormatId): ShareFormat {
  return SHARE_FORMATS[id] ?? SHARE_FORMATS[DEFAULT_SHARE_FORMAT];
}

export function getShareTemplate(id: ShareTemplateId): ShareTemplate {
  return SHARE_TEMPLATES[id] ?? SHARE_TEMPLATES[DEFAULT_SHARE_TEMPLATE];
}

export type ShareCardSize = {
  /** Layout size the component renders at. */
  baseWidth: number;
  baseHeight: number;
  /** Output size handed to the capture step. */
  outputWidth: number;
  outputHeight: number;
  /** Story chrome, converted to base px. */
  safeTop: number;
  safeBottom: number;
};

/**
 * Layout + output size for a format. Exactly divisible by the scale, so the
 * capture never has to resample a fraction of a pixel.
 */
export function shareCardSize(formatId: ShareFormatId, scale: number = SHARE_RENDER_SCALE): ShareCardSize {
  const format = getShareFormat(formatId);
  const safe = Math.max(1, Math.round(scale));
  return {
    baseWidth: Math.round(format.width / safe),
    baseHeight: Math.round(format.height / safe),
    outputWidth: format.width,
    outputHeight: format.height,
    safeTop: Math.round(format.safeTopPx / safe),
    safeBottom: Math.round(format.safeBottomPx / safe),
  };
}

const clampInt = (value: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(value)));

/**
 * Divide `total` px among `weights` so the parts sum to at most `total`.
 *
 * Largest-remainder apportionment: whole pixels, no rounding drift, and — the
 * point — a hard ceiling. Templates ask for proportions ("the headline panel
 * wants about 40% of the main block") and physically cannot be handed more
 * height than exists.
 */
export function splitBudget(total: number, weights: number[]): number[] {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  const totalInt = Math.max(0, Math.floor(total));
  if (sum <= 0 || totalInt <= 0) return clean.map(() => 0);
  const raw = clean.map((w) => (totalInt * w) / sum);
  const parts = raw.map((v) => Math.floor(v));
  let rest = totalInt - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) parts[order[k]!.i] += 1;
  return parts;
}

/**
 * Biggest font size whose `lines` lines fit in `boxH` px, for a font whose
 * line box is `ratio` × its size. The floor keeps a degraded card legible
 * rather than microscopic.
 */
export function fitLines(boxH: number, lines: number, ratio = 1.16): number {
  return Math.max(9, Math.floor(boxH / (Math.max(1, lines) * ratio)));
}

/**
 * Biggest font size where `chars` characters still fit across `boxW` px, for a
 * glyph whose average advance is `emWidth` × the size. Used to keep a long
 * headline from silently wrapping into a box that only has room for one line.
 */
export function fitWidth(boxW: number, chars: number, emWidth = 0.54): number {
  return Math.max(9, Math.floor(boxW / (Math.max(1, chars) * emWidth)));
}

/**
 * Display type wants to be set optically, not metrically: the bigger a numeral
 * gets, the more its letterspacing has to close up or it reads as a gap in the
 * composition. Expressed as a fraction of the font size so it scales.
 */
export function displayTracking(fontSize: number): number {
  return -Math.max(0.5, fontSize * 0.045);
}

/**
 * mulberry32 — a tiny seeded PRNG.
 *
 * The grain has to be *deterministic*. Two people sharing the same week must
 * get the same image (and the same person sharing twice must not get a
 * different-looking card), which rules out `Math.random()`; and the grain must
 * not shimmer when React re-renders the off-screen stage, which rules out
 * regenerating it per render.
 */
export function shareRandom(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SpeckleLayer = {
  /** SVG path data, one sub-path per grain fleck. */
  d: string;
  /** Opacity multiplier for this tier, so the grain is not uniformly flat. */
  alpha: number;
};

/**
 * Film grain, as three SVG paths instead of hundreds of nodes.
 *
 * Grain is what stops a big gradient from banding: an 8-bit gradient across a
 * dark card shows visible steps, and dithering it with noise dissolves them.
 * It is also the single most recognisable "this was designed" cue in current
 * social artwork. Batching the flecks into three paths (one per opacity tier)
 * keeps it to three nodes per card, same trick as the QR code.
 */
export function specklePaths(opts: {
  width: number;
  height: number;
  count: number;
  seed: number;
  fleck?: number;
}): SpeckleLayer[] {
  const { width, height, count, seed } = opts;
  const fleck = Math.max(1, opts.fleck ?? 1);
  const rand = shareRandom(seed);
  const tiers: string[][] = [[], [], []];
  for (let i = 0; i < Math.max(0, count); i++) {
    const x = Math.round(rand() * width * 10) / 10;
    const y = Math.round(rand() * height * 10) / 10;
    const tier = rand() < 0.5 ? 1 : rand() < 0.6 ? 0 : 2;
    tiers[tier]!.push(`M${x} ${y}h${fleck}v${fleck}h-${fleck}z`);
  }
  return [
    { d: tiers[0]!.join(''), alpha: 0.55 },
    { d: tiers[1]!.join(''), alpha: 1 },
    { d: tiers[2]!.join(''), alpha: 0.3 },
  ].filter((layer) => layer.d.length > 0);
}

/**
 * Every size a template is allowed to use, all derived from the frame.
 *
 * `mainH` is the load-bearing number: the height left over for the template's
 * own content once the header, the footer (QR + tagline) and the padding are
 * paid for. Templates must fit inside it, never the whole card.
 */
export type ShareLayout = {
  wide: boolean;
  baseWidth: number;
  baseHeight: number;
  safeTop: number;
  safeBottom: number;
  /** Outer card padding. */
  pad: number;
  /** Space between the header, main block and footer. */
  gap: number;
  innerW: number;
  innerH: number;
  headerH: number;
  headerFont: number;
  /** True when the QR sits in a rail beside the content rather than under it. */
  railFooter: boolean;
  /** Kicker/folio type — the small uppercase labels. */
  kicker: number;
  footerH: number;
  qrSize: number;
  /** Whether the QR gets its "SCAN TO VISIT" caption (tall cards only). */
  qrCaption: boolean;
  /** Height available to the template's own content. */
  mainH: number;
  mainW: number;
  headline: number;
  headlineLines: number;
  subline: number;
  sublineLines: number;
  body: number;
  label: number;
  hero: number;
};

/**
 * The frame's type + spacing scale. A story has ~1.8× the height of the default
 * portrait, so a single hard-coded headline size either crowds the square or
 * looks lost in the story.
 */
export function shareLayout(size: ShareCardSize, opts: { heroChars?: number } = {}): ShareLayout {
  const { baseWidth, baseHeight, safeTop, safeBottom } = size;
  const usableH = baseHeight - safeTop - safeBottom;
  const wide = baseWidth / baseHeight > 1.6;

  // Padding is bounded by *both* axes: the wide link card is only 210 px tall,
  // so a width-derived 28 px padding would eat a fifth of its height.
  const pad = clampInt(Math.min(baseWidth * 0.072, baseHeight * 0.072), 9, 28);
  const innerW = baseWidth - pad * 2;
  const innerH = usableH - pad * 2;

  const headerH = clampInt(usableH * 0.058, 13, 28);
  // The wide card has height to spare and no footer band to fight with, so its
  // QR rides in a rail at a third of the frame — the difference between a code
  // a phone camera can read out of a feed and a grey smudge.
  const qrSize = wide
    ? clampInt(baseHeight * 0.3, 24, 80)
    : clampInt(Math.min(baseWidth, baseHeight) * 0.155, 22, 66);
  // The caption is growth copy, but it costs ~15 px of a footer that has to
  // hold the QR; on a square it is the difference between a readable code and
  // a postage stamp.
  const qrCaption = !wide && baseHeight >= 420 && innerW >= 260;
  // Wide cards are too short to stack a footer under the content, so their QR
  // rides in a rail beside it and the whole remaining height goes to `mainH`.
  const footerH = wide ? 0 : qrSize + (qrCaption ? Math.max(9, Math.round(qrSize * 0.15)) + 5 : 0);
  const gap = clampInt(pad * 0.5, 5, 14);
  // `gap` is spent between header → main, and (when stacked) main → footer.
  const bands = footerH > 0 ? 2 : 1;
  const mainH = Math.max(44, innerH - headerH - footerH - gap * bands);

  const heroChars = Math.max(1, opts.heroChars ?? 2);

  // Wide cards lay their content out in a column beside the footer, so their
  // type is a function of width; tall cards are a function of the space left.
  const headline = wide
    ? clampInt(innerW * 0.058, 16, 32)
    : clampInt(Math.min(innerW * 0.095, mainH * 0.13), 14, 38);
  const body = wide
    ? clampInt(innerW * 0.038, 11, 15)
    : clampInt(Math.min(innerW * 0.042, mainH * 0.06), 10, 16);
  const label = clampInt(body * 0.78, 9, 12);
  const hero = wide
    ? clampInt(mainH * 0.5, 26, 64)
    : clampInt(Math.min(mainH * 0.36, (innerW / (0.62 * heroChars)) || 40), 20, 108);

  return {
    wide,
    baseWidth,
    baseHeight,
    safeTop,
    safeBottom,
    pad,
    gap,
    innerW,
    innerH,
    headerH,
    headerFont: clampInt(headerH * 0.78, 11, 24),
    railFooter: wide,
    kicker: clampInt(headerH * 0.42, 8, 12),
    footerH,
    qrSize,
    qrCaption,
    mainH,
    mainW: innerW,
    headline,
    headlineLines: wide ? 2 : mainH >= 150 ? 2 : 1,
    subline: body,
    sublineLines: mainH >= 150 ? 2 : 1,
    body,
    label,
    hero,
  };
}

/** A file name the share sheet can show, instead of a random cache name. */
export function shareFileName(formatId: ShareFormatId, templateId: ShareTemplateId): string {
  return `calibreat-${formatId}-${templateId}.png`;
}

/** Caption to pre-fill where the platform allows it (X, Facebook). */
export function shareCaption(websiteUrl: string): string {
  return `Tracking with calibrEAT — measured intake, not guesses. ${websiteUrl.replace(/^https:\/\//, '')}`;
}
