/**
 * The share card — one image a user posts to Instagram, a Story, X or
 * Facebook. Rendered off-screen at a third of its final size and captured to a
 * PNG (react-native-view-shot), so every pixel is generated on-device and
 * nothing about a user's week touches a server.
 *
 * Two axes, deliberately independent (see lib/share-templates.ts):
 *   format   — the shape the platform wants (square / portrait / story / wide)
 *   template — the look (Instrument / Grid / Paper / Terminal)
 *
 * Copy rules live in lib/share-card.ts and are tested: the card celebrates
 * *behavior* — logging streaks, coverage, a measured trend — never bodies.
 *
 * ## Why nothing here hard-codes a size
 *
 * A card is a fixed-size box with `overflow: hidden`. The first version of
 * this file picked font sizes by feel, and most format × template pairs silently
 * drew 60–135 px taller than their frame — the capture then threw away the
 * footer, i.e. the QR and the site link, the only part of the image that grows
 * the app. So every template runs on a budget: `shareLayout` pays for padding,
 * header and footer and hands back `mainH`; `splitBudget` divides that so the
 * parts cannot sum to more than the whole; `fitLines`/`fitWidth` derive each
 * font size from the block it sits in; and text is capped with `numberOfLines`.
 * The lab measures the result and flags any pair that spills.
 *
 * ## Why it looks like this
 *
 * The second version was *correct* and still looked like a screenshot: flat
 * fill, a bordered box, a number at body weight, a row of six-pixel dots. What
 * makes a generated stat card read as designed is a short, specific list, and
 * every template here uses it:
 *
 *   · a mesh gradient (deep → glow) plus vignette, so the surface has depth
 *     instead of being one flat colour;
 *   · film grain over it — grain is what stops an 8-bit dark gradient from
 *     banding, and it is the loudest "designed" cue in current social artwork;
 *   · display type set optically: one numeral at 3–4× the next-largest size
 *     with negative tracking, because the number *is* the composition;
 *   · layered geometry that bleeds off the canvas (rings, colour blocks,
 *     watermarks) so the frame reads as a crop of something bigger;
 *   · tonal steps and hairlines instead of boxes — no borders around panels;
 *   · exactly one loud colour, used sparingly, with greyscale for everything
 *     that isn't the point.
 *
 * Decoration lives in absolutely-positioned `Decor` layers so it can bleed
 * freely without the fit budget noticing (and the lab skips it when measuring).
 */

import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import {
  shareStripRow,
  shareTagline,
  SHARE_SITE_URL,
  type ShareAchievement,
  type ShareCopy,
  type ShareDataRow,
  type ShareHero,
  type ShareProgress,
  type ShareStatus,
} from '@/lib/share-card';
import { FireGlyph } from '@/components/glyph-variants';
import {
  ActivityRing,
  CardChrome,
  EngravedCheck,
  EngravedScales,
  EqualiserGlyph,
  IdentityStrip,
  MedalAssembly,
  ProgressTrack,
  StatusChip,
} from '@/components/share-trophy';
import { shareQrMatrix } from '@/lib/share-qr';
import {
  SHARE_DECOR_LAYER_STYLE,
  displayTracking,
  fitLines,
  fitWidth,
  getShareTemplate,
  shareCardSize,
  shareLayout,
  specklePaths,
  splitBudget,
  type ShareCardSize,
  type ShareFormatId,
  type ShareLayout,
  type SharePalette,
  type ShareTemplateId,
} from '@/lib/share-templates';

/** The QR pattern is constant, so compute it once per process. */
const QR_MATRIX = shareQrMatrix();
const QR_MODULES = QR_MATRIX.length;

/**
 * The whole code as a single SVG path. Drawing 625 Views per card is slow to
 * mount and rounds to fuzzy module edges at capture time — one path keeps the
 * modules square and crisp.
 */
const QR_PATH = (() => {
  const parts: string[] = [];
  QR_MATRIX.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) parts.push(`M${c} ${r}h1v1h-1z`);
    });
  });
  return parts.join('');
})();

export type ShareCardData = {
  copy: ShareCopy;
  /** Consecutive days lit in the segments row. */
  litDays: number;
  /** The hero number every layout leads with. */
  hero: ShareHero;
  /** Facts for the stat row and the Terminal table. */
  rows: ShareDataRow[];
  /**
   * Logged / not-logged for the trailing window, oldest first — the Grid
   * layout's calendar. Falls back to `litDays` segments when absent.
   */
  /** One week of days logged, oldest first — at most 7. The Grid layout lays
   *  this out 7 to a row and takes its header count from the length, so a
   *  caller holding a denser series (Home and Trends both keep 60) must slice
   *  at the call site rather than pass the whole array. */
  loggedDays?: boolean[];
  /** Measured True Burn history, oldest first. */
  burnPoints?: number[];
  /** The formula estimate the dashed reference line sits at. */
  burnEst?: number;
  /** Caps label over the card body ("LOGGING STREAK") — the chrome idiom. */
  eyebrow?: string;
  /** The medal: arched name, unit of achievement, metal. */
  achievement?: ShareAchievement;
  /** The claim stamped beside the number ("Goal met!"). */
  status?: ShareStatus;
  /** The run to beat, shown in the identity strip. */
  best?: ShareDataRow;
  /** Goal track for the Goal template. */
  progress?: ShareProgress;
  /**
   * Today's macros against their targets, for the Goal template's activity
   * rings. Optional: a card shared from Trends has no macro context, and the
   * template falls back to a stat row rather than inventing numbers.
   */
  macros?: { label: string; value: number; target: number }[];
  /** "Sunday 20 Sept" — the date the achievement is being claimed for. */
  dateLabel?: string;
};

export type ShareCardProps = ShareCardData & {
  format: ShareFormatId;
  template: ShareTemplateId;
};

type Kit = {
  size: ShareCardSize;
  palette: SharePalette;
  lay: ShareLayout;
  data: ShareCardData;
};

/**
 * Facts to show beside the hero, minus the one the hero already *is*.
 *
 * The hero reads "12 · day streak", so a stat cell labelled "streak 12 d" next
 * to it is the card saying the same thing twice — the fastest way to make a
 * designed card look auto-generated. The hero's own metric is dropped and the
 * rest keep their order.
 */
function supportingStats(data: ShareCardData, limit: number): ShareDataRow[] {
  const heroWords = data.hero.label.toLowerCase();
  return data.rows.filter((row) => !heroWords.includes(row.label.toLowerCase())).slice(0, limit);
}

/** Dim fill for an "empty" cell or segment, per palette mode. */
function dimInk(palette: SharePalette): string {
  return palette.mode === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(21,25,27,0.10)';
}

/* ── Surfaces ──────────────────────────────────────────────────── */

/**
 * Decoration layer: covers the whole card, ignores touches, and is clipped by
 * the card's own `overflow: hidden` — which is what lets rings, glows and
 * watermarks bleed off the edge on purpose. The id prefix is how the share lab
 * knows to skip this subtree when it measures for clipping.
 */
function Decor({ cardId, children }: { cardId: string; children: React.ReactNode }) {
  return (
    <View
      nativeID={`sharecard-decor-${cardId}`}
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {children}
    </View>
  );
}

/**
 * Mesh gradient + vignette: the difference between a coloured rectangle and a
 * surface. Two blooms (one warm corner, one cool) over a diagonal falloff, then
 * a vignette to pull the eye to the middle. All in one SVG, four nodes.
 */
function Mesh({ palette, width, height, uid }: { palette: SharePalette; width: number; height: number; uid: string }) {
  const bloom = Math.max(width, height);
  return (
    <Svg width={width} height={height} style={SHARE_DECOR_LAYER_STYLE}>
      <Defs>
        <RadialGradient id={`${uid}-glowA`} cx={width * 0.86} cy={height * 0.04} r={bloom * 0.86}>
          <Stop offset="0" stopColor={palette.glow} stopOpacity={0.85} />
          <Stop offset="0.55" stopColor={palette.glow} stopOpacity={0.28} />
          <Stop offset="1" stopColor={palette.glow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}-glowB`} cx={width * 0.02} cy={height * 1.02} r={bloom * 0.7}>
          <Stop offset="0" stopColor={palette.accent} stopOpacity={palette.mode === 'dark' ? 0.16 : 0.14} />
          <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${uid}-fall`} x1="0" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor={palette.deep} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={palette.deep} stopOpacity={0.08} />
          <Stop offset="1" stopColor={palette.deep} stopOpacity={0.7} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-glowA)`} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-glowB)`} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-fall)`} />
    </Svg>
  );
}

/** Film grain: three batched paths, no per-fleck nodes. */
function Grain({ palette, width, height, seed, density = 0.5 }: { palette: SharePalette; width: number; height: number; seed: number; density?: number }) {
  const layers = specklePaths({
    width,
    height,
    count: Math.round(width * height * 0.0016 * density),
    seed,
  });
  return (
    <Svg width={width} height={height} style={SHARE_DECOR_LAYER_STYLE}>
      {layers.map((layer, i) => (
        <Path key={i} d={layer.d} fill={palette.speckle} opacity={layer.alpha} />
      ))}
    </Svg>
  );
}

/** Hairline concentric rings — a dial face, deliberately off-centre. */
function Rings({ cx, cy, radii, color, width = 1, opacity = 1 }: { cx: number; cy: number; radii: number[]; color: string; width?: number; opacity?: number }) {
  return (
    <Svg width="100%" height="100%" style={SHARE_DECOR_LAYER_STYLE}>
      {radii.map((r) => (
        <Circle key={r} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={width} fill="none" opacity={opacity} />
      ))}
    </Svg>
  );
}

/** Scanlines, for the monitor template. One path, not one node per line. */
function Scanlines({ width, height, color, step = 3, opacity = 0.5 }: { width: number; height: number; color: string; step?: number; opacity?: number }) {
  const parts: string[] = [];
  for (let y = 0; y < height; y += step) parts.push(`M0 ${y}h${width}v1h-${width}z`);
  return (
    <Svg width={width} height={height} style={SHARE_DECOR_LAYER_STYLE}>
      <Path d={parts.join('')} fill={color} opacity={opacity} />
    </Svg>
  );
}

/**
 * Giant ghosted word behind the composition, clipped by the frame. Reads as a
 * crop of something larger — the cheapest way to make a fixed canvas feel like
 * it continues past its edges.
 */
function Watermark({ text, size, color, style }: { text: string; size: number; color: string; style?: object }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.watermark,
        { fontSize: size, letterSpacing: displayTracking(size), color },
        style,
      ]}
    >
      {text}
    </Text>
  );
}

/* ── Type + micro-detail ───────────────────────────────────────── */

/** Small uppercase label, optionally with a leading accent rule. */
function Kicker({ label, palette, size, rule }: { label: string; palette: SharePalette; size: number; rule?: boolean }) {
  return (
    <View style={[styles.kickerRow, { gap: Math.max(5, Math.round(size * 0.6)) }]}>
      {rule ? <View style={{ width: Math.max(10, Math.round(size * 1.6)), height: Math.max(1, Math.round(size * 0.14)), backgroundColor: palette.accent }} /> : null}
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.kicker, { color: palette.muted, fontSize: size, letterSpacing: size * 0.18 }]}>
        {label}
      </Text>
    </View>
  );
}

/** Rounded label chip. `filled` uses the accent fill, otherwise a hairline. */
function Pill({ label, palette, size, height, filled }: { label: string; palette: SharePalette; size: number; height: number; filled?: boolean }) {
  return (
    <View
      style={[
        styles.pill,
        {
          height,
          paddingHorizontal: Math.round(height * 0.62),
          borderRadius: height / 2,
          backgroundColor: filled ? palette.accent : 'transparent',
          borderColor: filled ? palette.accent : palette.hairline,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.pillText, { color: filled ? palette.accentInk : palette.muted, fontSize: size, letterSpacing: size * 0.14 }]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The hero numeral.
 *
 * This is the whole pitch of the card, so it is set as display type: line height
 * *below* the font size (the glyphs sit on their own baseline without the usual
 * half-leading), tracking closed up proportionally, weight at the top of the
 * range. A number set like this at 3× capture is ~250 px of the final image.
 */
function HeroNumeral({
  value,
  font,
  color,
  align = 'left',
  style,
}: {
  value: string;
  font: number;
  color: string;
  align?: 'left' | 'right';
  style?: object;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[
        styles.heroNumeral,
        { fontSize: font, lineHeight: font * 0.98, letterSpacing: displayTracking(font), color, textAlign: align },
        style,
      ]}
    >
      {value}
    </Text>
  );
}

/** A small unit set beside a numeral, so "2,140" doesn't have to explain itself. */
function Unit({ label, palette, size, color }: { label: string; palette: SharePalette; size: number; color?: string }) {
  return (
    <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: color ?? palette.muted, fontSize: size, letterSpacing: size * 0.08 }]}>
      {label}
    </Text>
  );
}

/**
 * Streak as a segmented bar. A row of dots reads as decoration; equal segments
 * with a claim on them read as progress — same pixel cost, different message.
 */
function SegmentBar({ lit, count = 7, height, color, dim }: { lit: number; count?: number; height: number; color: string; dim: string }) {
  const n = Math.max(0, Math.min(count, Math.round(lit)));
  return (
    <View style={styles.segmentBar} accessibilityLabel={`${n} of ${count} days`}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ height, flex: 1, borderRadius: Math.max(1, Math.round(height / 2)), backgroundColor: i < n ? color : dim }}
        />
      ))}
    </View>
  );
}

/**
 * Calendar with **weeks as rows**. One column per week spends the scarce axis
 * (height) on the plentiful one and forces tiny cells; stacking weeks is also
 * how a wall calendar reads.
 */
function CalendarGrid({
  days,
  lit,
  cell,
  gap,
  color,
  dim,
  palette,
}: {
  days: boolean[];
  lit: number;
  cell: number;
  gap: number;
  color: string;
  dim: string;
  palette: SharePalette;
}) {
  let source = days.slice();
  if (!source.length) source = Array.from({ length: 7 }, (_, i) => i < lit);
  const rows: boolean[][] = [];
  for (let i = 0; i < source.length; i += 7) {
    const row = source.slice(i, i + 7);
    while (row.length < 7) row.push(false);
    rows.push(row);
  }
  const lastLit = (() => {
    for (let i = source.length - 1; i >= 0; i--) if (source[i]) return i;
    return -1;
  })();
  return (
    <View style={[styles.calendar, { gap }]} accessibilityLabel={`${lit} logged days`}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.calendarRow, { gap }]}>
          {row.map((on, c) => {
            const index = r * 7 + c;
            // Only the newest logged day gets a ring: one focal point, so the
            // eye lands on "today" before it counts anything.
            const ringed = on && index === lastLit;
            return (
              <View
                key={c}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: Math.max(2, Math.round(cell * 0.26)),
                  backgroundColor: on ? color : dim,
                  borderWidth: ringed ? Math.max(1, Math.round(cell * 0.14)) : on ? 0 : StyleSheet.hairlineWidth,
                  borderColor: ringed ? palette.text : palette.hairline,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Legend swatches, so the calendar explains itself without a sentence. */
function Legend({ palette, size, color, dim }: { palette: SharePalette; size: number; color: string; dim: string }) {
  const dot = Math.max(5, Math.round(size * 0.55));
  return (
    <View style={[styles.legend, { gap: Math.max(4, Math.round(size * 0.5)) }]}>
      <View style={{ width: dot, height: dot, borderRadius: 2, backgroundColor: color }} />
      <Text allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: size, letterSpacing: size * 0.12 }]}>
        LOGGED
      </Text>
      <View style={{ width: dot, height: dot, borderRadius: 2, backgroundColor: dim, marginLeft: Math.max(6, size) }} />
      <Text allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: size, letterSpacing: size * 0.12 }]}>
        MISSED
      </Text>
    </View>
  );
}

/**
 * Hairline-separated stat row. Boxes would need a border each; hairlines cost
 * one line and read as a printed table — which is why every premium stat card
 * uses them instead.
 */
function StatRow({
  items,
  palette,
  height,
  width,
  labelSize,
  valueSize,
  dividers = true,
}: {
  items: ShareDataRow[];
  palette: SharePalette;
  height: number;
  /** px the row occupies, so sizes can be capped to the cell width. */
  width: number;
  labelSize: number;
  valueSize: number;
  dividers?: boolean;
}) {
  const cellW = Math.max(24, width / Math.max(1, items.length) - 10);
  // Fit to the *cell*, not the row. "2,140 kcal" in a 59 px column was
  // ellipsizing to "2,14…" on the wide card — text that fits its height and not
  // its width fails just as visibly, it just isn't caught by a vertical check.
  const widestValue = Math.max(1, ...items.map((item) => item.value.length));
  const widestLabel = Math.max(1, ...items.map((item) => item.label.length));
  const valueFont = Math.min(valueSize, fitWidth(cellW, widestValue, 0.58));
  const labelFont = Math.min(labelSize, fitWidth(cellW, widestLabel, 0.64));
  return (
    <View style={[styles.statRow, { height }]}>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[
            styles.statCell,
            i < items.length - 1 && dividers
              ? { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: palette.hairline }
              : null,
          ]}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, labelFont), letterSpacing: labelFont * 0.14 }]}>
            {item.label.toUpperCase()}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.statValue, { color: palette.text, fontSize: Math.max(10, valueFont), letterSpacing: -valueFont * 0.02 }]}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Dashed estimate line + measured sparkline, the True Burn visual language. The
 * gradient id is per-card: SVG ids are global in a web document, so two card
 * styles mounted together would otherwise share the first definition's colour.
 */
function BurnSpark({
  points,
  est,
  palette,
  width,
  height,
  uid,
}: {
  points: number[];
  est: number;
  palette: SharePalette;
  width: number;
  height: number;
  uid: string;
}) {
  const pad = 4;
  const all = [...points, est];
  const lo = Math.min(...all) - 40;
  const hi = Math.max(...all) + 40;
  const span = Math.max(1, hi - lo);
  const xs = points.map((_, i) => pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2));
  const ys = points.map((v) => pad + (1 - (v - lo) / span) * (height - pad * 2));
  const estY = pad + (1 - (est - lo) / span) * (height - pad * 2);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.accent} stopOpacity={0.34} />
          <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Line x1={pad} y1={estY} x2={width - pad} y2={estY} stroke={palette.ink2} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
      {path ? <Path d={`${path} L ${xs[xs.length - 1]!.toFixed(1)} ${height - pad} L ${xs[0]!.toFixed(1)} ${height - pad} Z`} fill={`url(#${uid}-fill)`} /> : null}
      {path ? <Path d={path} stroke={palette.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {xs.map((x, i) => (
        <Circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 2.6 : 1.7} fill={palette.accent} />
      ))}
    </Svg>
  );
}

/* ── Footer + brand ────────────────────────────────────────────── */

function QrCode({ size, dark, light, caption, captionColor }: { size: number; dark: string; light: string; caption?: string; captionColor: string }) {
  const border = Math.max(2, Math.round(size * 0.08));
  return (
    <View style={[styles.qrWrap, { gap: Math.max(3, Math.round(size * 0.08)) }]} accessibilityLabel="QR code linking to the calibrEAT website">
      <View style={{ width: size, height: size, padding: border, borderRadius: Math.round(size * 0.16), backgroundColor: light }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${QR_MODULES} ${QR_MODULES}`}>
          <Path d={QR_PATH} fill={dark} />
        </Svg>
      </View>
      {caption ? (
        <Text allowFontScaling={false} style={[styles.qrCaption, { color: captionColor, fontSize: Math.max(8, Math.round(size * 0.14)), letterSpacing: size * 0.02 }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Same wordmark as the app's BrandMark, but coloured from the *card's* palette
 * rather than the device theme: the shared image must not turn near-black on a
 * light phone just because its owner runs light mode.
 */
function Wordmark({ palette, size }: { palette: SharePalette; size: number }) {
  return (
    <Text allowFontScaling={false} style={[styles.brandName, { color: palette.text, fontSize: size, letterSpacing: displayTracking(size) }]}>
      calibr<Text style={{ color: palette.accent }}>EAT</Text>
    </Text>
  );
}

/** The registrable domain, without the scheme or a trailing slash. */
function shareDomain(): string {
  return SHARE_SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function BrandRow({ kit, label }: { kit: Kit; label: string }) {
  const { palette, lay } = kit;
  const pillH = Math.max(14, Math.round(lay.headerH * 0.86));
  return (
    <View style={[styles.brandRow, { gap: lay.gap }]}>
      <Wordmark palette={palette} size={lay.headerFont} />
      <View style={[styles.brandRight, { gap: lay.gap * 0.6 }]}>
        {/* Wide cards have no footer band, so the URL rides in the header,
            where the full width is available. Under the rail's QR it only had
            the QR's own 63 px and ellipsized to "calibreat.c…". */}
        {lay.railFooter ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.mono, { color: palette.muted, fontSize: Math.max(8, lay.kicker), letterSpacing: lay.kicker * 0.1 }]}
          >
            {shareDomain()}
          </Text>
        ) : null}
        <Pill label={label} palette={palette} size={Math.max(7, lay.kicker - 1)} height={pillH} />
      </View>
    </View>
  );
}

/**
 * The card's three fixed bands. `headerH + mainH + footerH` and the card's own
 * padding and gaps are all derived from the same frame, so they add up to the
 * card height exactly — the footer cannot be pushed out of the image.
 */
/**
 * `bare` drops the header band and folds its height (plus the gap it would have
 * spent) into the main block.
 *
 * The trophy templates need room for a chrome bar *and* an eyebrow line — more
 * than the header band reserves — so they own their entire top area instead of
 * squeezing into it. The arithmetic still adds up exactly, which is what keeps
 * the footer on the card.
 */
function Frame({ lay, header, main, footer, bare }: { lay: ShareLayout; header?: React.ReactNode; main: React.ReactNode; footer?: React.ReactNode; bare?: boolean }) {
  if (bare) {
    return (
      <>
        <View style={{ height: lay.mainH + lay.headerH + lay.gap, overflow: 'hidden', justifyContent: 'center' }}>{main}</View>
        {footer && lay.footerH > 0 ? (
          <View style={{ height: lay.footerH, justifyContent: 'flex-end' }}>{footer}</View>
        ) : null}
      </>
    );
  }
  return (
    <>
      <View style={{ height: lay.headerH, justifyContent: 'center' }}>{header}</View>
      <View style={{ height: lay.mainH, overflow: 'hidden', justifyContent: 'center' }}>{main}</View>
      {/* Omitted on wide cards, where the QR lives inside `main` — an empty band
          would spend a gap and push the card past its own height. */}
      {footer && lay.footerH > 0 ? (
        <View style={{ height: lay.footerH, justifyContent: 'flex-end' }}>{footer}</View>
      ) : null}
    </>
  );
}

/** Stacked footer: the URL set as the loudest thing down here, QR on the right. */
function Footer({ kit }: { kit: Kit }) {
  const { palette, lay } = kit;
  const domain = shareDomain();
  // The domain is printed large right above, so the tagline drops its own copy
  // of the URL — otherwise the footer says `calibreat.co.uk` twice.
  const tagline = shareTagline().split('·')[0]!.split('—')[0]!.trim();
  return (
    <View style={styles.footer}>
      <View style={[styles.footerCopy, { gap: Math.max(3, Math.round(lay.gap * 0.3)) }]}>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.footerUrl, { color: palette.text, fontSize: Math.max(9, Math.round(lay.body * 1.05)), letterSpacing: lay.body * 0.06 }]}>
          {domain}
        </Text>
        <Text allowFontScaling={false} numberOfLines={2} style={[styles.footerTagline, { color: palette.muted, fontSize: Math.max(8, Math.round(lay.body * 0.8)), lineHeight: Math.max(11, Math.round(lay.body * 1.15)) }]}>
          {tagline}
        </Text>
      </View>
      <QrCode
        size={lay.qrSize}
        dark="#05080C"
        light="#FFFFFF"
        caption={lay.qrCaption ? 'SCAN ME' : undefined}
        captionColor={palette.muted}
      />
    </View>
  );
}

/**
 * Wide cards put the footer in a rail beside the content: the QR alone.
 *
 * The rail is exactly as wide as the code, so anything else in it is being set
 * in ~60 px and will ellipsize — the tagline did ("Calibr ate …"), then the
 * domain did ("calibreat.c…"). The URL lives in the header instead; the QR
 * needs no neighbour, because a QR *is* the link.
 */
function FooterRail({ kit }: { kit: Kit }) {
  const { palette, lay } = kit;
  return (
    <View style={[styles.footerRail, { width: lay.qrSize }]}>
      <QrCode size={lay.qrSize} dark="#05080C" light="#FFFFFF" captionColor={palette.muted} />
    </View>
  );
}

/* ── Templates ─────────────────────────────────────────────────── */

/**
 * Instrument — the dial. One enormous lime numeral on a dark mesh, a ring of
 * hairlines bleeding off the top-right corner, the measured trend underneath.
 * This is the default because it is the one that reads at thumbnail size.
 */
function Instrument({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `instrument-${lay.baseWidth}x${lay.baseHeight}`;
  const showSpark = !lay.railFooter && data.burnEst != null && (data.burnPoints?.length ?? 0) >= 2 && lay.mainH >= 190;
  const statItems = supportingStats(data, lay.railFooter ? 2 : 3);

  const decor = (
    <Decor cardId={`instrument-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      {/* Centre pushed off-canvas so only the lower-left arc segments cross the
          card: rings centred inside the frame cut through the header type. */}
      <Rings
        cx={size.baseWidth * 1.12}
        cy={-size.baseHeight * 0.06}
        radii={[size.baseWidth * 0.5, size.baseWidth * 0.68, size.baseWidth * 0.86]}
        color={palette.hairline}
      />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={1101} />
    </Decor>
  );

  if (lay.railFooter) {
    const [numH, headlineH, statH] = splitBudget(lay.mainH, [52, 26, 22]);
    const numFont = Math.min(lay.hero * 1.15, fitLines(numH - Math.round(lay.body * 1.4), 1, 0.98));
    const headlineFont = Math.min(lay.headline, fitLines(headlineH, 2, 1.3));
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          header={<BrandRow kit={kit} label="MY WEEK" />}
          main={
            <View style={[styles.wideRow, { gap: lay.gap * 1.5 }]}>
              <View style={[styles.wideMain, { gap: Math.max(2, Math.round(lay.gap * 0.3)) }]}>
                <Kicker label="this week" palette={palette} size={lay.kicker} rule />
                <HeroNumeral value={data.hero.value} font={numFont} color={palette.accent} />
                <Text numberOfLines={2} allowFontScaling={false} style={[styles.headline, { color: palette.text, fontSize: headlineFont, lineHeight: headlineFont * 1.3 }]}>
                  {data.copy.headline}
                </Text>
              </View>
              <View style={{ width: Math.round(lay.mainW * 0.34), gap: lay.gap * 0.4 }}>
                <StatRow
                  items={statItems}
                  palette={palette}
                  height={statH}
                  width={Math.round(lay.mainW * 0.34)}
                  labelSize={Math.max(7, lay.kicker - 2)}
                  valueSize={Math.max(11, Math.round(lay.body * 1.2))}
                  dividers={false}
                />
              </View>
              <FooterRail kit={kit} />
            </View>
          }
        />
      </>
    );
  }

  const tall = lay.mainH >= 240;
  const [kickerH, numH, headlineH, sparkH, statH] = splitBudget(lay.mainH, [
    6,
    tall ? 36 : 40,
    tall ? 13 : 15,
    showSpark ? 17 : 0,
    13,
  ]);
  const numFont = Math.min(lay.hero * 1.15, fitLines(numH, 1, 0.98));
  const headlineFont = Math.min(lay.subline * 1.05, fitLines(headlineH, 2, 1.32));
  const statValueSize = Math.min(lay.body * 1.45, fitLines(statH - Math.round(lay.label * 1.6), 1, 1.1));
  const sparkHead = Math.max(9, lay.kicker);
  const sparkGraphH = sparkH - sparkHead - 6;

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        header={<BrandRow kit={kit} label="MY WEEK" />}
        main={
          <View style={{ gap: Math.max(2, Math.round(lay.gap * 0.35)) }}>
            <View style={{ height: kickerH, justifyContent: 'center' }}>
              <Kicker label={data.hero.label} palette={palette} size={lay.kicker} rule />
            </View>
            <View style={{ height: numH, justifyContent: 'center' }}>
              <HeroNumeral value={data.hero.value} font={numFont} color={palette.accent} />
            </View>
            <View style={{ height: headlineH, justifyContent: 'center' }}>
              <Text numberOfLines={2} allowFontScaling={false} style={[styles.headline, { color: palette.text, fontSize: headlineFont, lineHeight: headlineFont * 1.32 }]}>
                {data.copy.headline}
              </Text>
            </View>
            {showSpark && sparkGraphH >= 14 ? (
              <View style={{ height: sparkH, justifyContent: 'flex-end', gap: 4 }}>
                <View style={styles.sparkHead}>
                  <Kicker label="True burn" palette={palette} size={sparkHead} />
                  <Unit label="measured vs estimate" palette={palette} size={Math.max(7, sparkHead - 2)} color={palette.ink2} />
                </View>
                {/* Bleeds past the right padding: the trend runs off the card. */}
                <View style={{ marginRight: -lay.pad * 0.6 }}>
                  <BurnSpark
                    points={data.burnPoints!}
                    est={data.burnEst!}
                    palette={palette}
                    width={lay.mainW + lay.pad * 0.6}
                    height={sparkGraphH}
                    uid={uid}
                  />
                </View>
              </View>
            ) : null}
            <View style={{ height: statH, justifyContent: 'center' }}>
              <StatRow
                items={statItems}
                palette={palette}
                height={statH}
                width={lay.mainW}
                labelSize={Math.max(7, lay.kicker - 1)}
                valueSize={Math.max(11, statValueSize)}
              />
            </View>
          </View>
        }
        footer={<Footer kit={kit} />}
      />
    </>
  );
}

/**
 * Grid — the streak as a colour block. The numeral is large enough to overlap
 * the tonal panel below it, which is what gives the composition depth: the
 * figure breaks the block edge instead of sitting politely above it.
 */
function Grid({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `grid-${lay.baseWidth}x${lay.baseHeight}`;
  const dim = dimInk(palette);
  const days = data.loggedDays ?? [];
  const rows = days.length ? Math.ceil(days.length / 7) : 1;
  // How many days in the *shown window* were logged. Not the same number as the
  // streak: the streak counts back from today, this counts within the calendar,
  // and mixing the two printed "7/21" on a 12-day streak.
  const windowLogged = days.length ? days.filter(Boolean).length : data.litDays;
  const windowLabel = days.length ? `${windowLogged}/${days.length} LOGGED` : `${data.litDays}/7 LOGGED`;

  const decor = (
    <Decor cardId={`grid-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      {/* Ghosted word sits beside the numeral (the numeral is left-aligned), so
          the two don't fight, and it is cropped by the frame on purpose. */}
      <Watermark text="STREAK" size={size.baseWidth * 0.32} color={palette.speckle} style={{ position: 'absolute', top: size.baseHeight * 0.09, right: -size.baseWidth * 0.08 }} />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={2202} />
    </Decor>
  );

  if (lay.railFooter) {
    const [numH, calH] = splitBudget(lay.mainH, [46, 54]);
    const numFont = Math.min(lay.hero * 1.2, fitLines(numH - Math.round(lay.body * 2.4), 1, 0.98));
    const pad = Math.max(6, Math.round(lay.pad * 0.45));
    const gap = 3;
    const panelW = Math.round(lay.mainW * 0.46);
    const cell = Math.max(5, Math.min(
      Math.floor((panelW - pad * 2 - gap * 6) / 7),
      Math.floor((calH - pad * 2 - gap * (Math.min(rows, 2) - 1)) / Math.min(rows, 2)),
    ));
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          header={<BrandRow kit={kit} label={windowLabel} />}
          main={
            <View style={[styles.wideRow, { gap: lay.gap }]}>
              <View style={[styles.wideMain, { gap: 1 }]}>
                <HeroNumeral value={data.hero.value} font={numFont} color={palette.accent} />
                <Text numberOfLines={2} allowFontScaling={false} style={[styles.heroLabel, { color: palette.text, fontSize: lay.label, letterSpacing: lay.label * 0.14 }]}>
                  {data.hero.label}
                </Text>
              </View>
              <View style={{ width: panelW, backgroundColor: palette.block, borderRadius: Math.round(lay.baseHeight * 0.06), borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, padding: pad, justifyContent: 'center' }}>
                <CalendarGrid days={days} lit={data.litDays} cell={cell} gap={gap} color={palette.accent} dim={dim} palette={palette} />
              </View>
              <FooterRail kit={kit} />
            </View>
          }
        />
      </>
    );
  }

  const [kickerH, numH, noteH, panelH] = splitBudget(lay.mainH, [5, 33, 13, 49]);
  const numFont = Math.min(lay.hero * 1.28, fitLines(numH + noteH * 0.35, 1, 0.98));
  const noteFont = Math.min(lay.subline, fitLines(noteH, 2, 1.32));
  const panelPad = Math.max(9, Math.round(lay.pad * 0.55));
  const legendH = Math.max(10, Math.round(lay.label * 1.4));
  const gap = Math.max(3, Math.round(lay.baseWidth * 0.013));
  const cellsH = Math.max(14, panelH - panelPad * 2 - legendH - Math.max(6, lay.gap * 0.6));
  const cell = Math.max(5, Math.min(
    Math.floor((lay.mainW - panelPad * 2 - gap * 6) / 7),
    Math.floor((cellsH - gap * (rows - 1)) / rows),
  ));

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        header={<BrandRow kit={kit} label={windowLabel} />}
        main={
          // The numeral sits behind the panel edge (negative margin), so the
          // figure and the block overlap instead of stacking.
          <View>
            <View style={{ height: kickerH + numH, justifyContent: 'flex-end', gap: 2 }}>
              <Kicker label="this week" palette={palette} size={lay.kicker} rule />
              <HeroNumeral value={data.hero.value} font={numFont} color={palette.accent} />
            </View>
            <View style={{ height: noteH, justifyContent: 'center', zIndex: 2 }}>
              <Text numberOfLines={1} allowFontScaling={false} style={[styles.headline, { color: palette.text, fontSize: noteFont, lineHeight: noteFont * 1.32 }]}>
                {data.copy.headline}
              </Text>
            </View>
            <View
              style={{
                height: panelH,
                backgroundColor: palette.block,
                borderRadius: Math.round(lay.baseWidth * 0.07),
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.hairline,
                padding: panelPad,
                gap: Math.max(6, lay.gap * 0.6),
                justifyContent: 'center',
              }}
            >
              <CalendarGrid days={days} lit={windowLogged} cell={cell} gap={gap} color={palette.accent} dim={dim} palette={palette} />
              <Legend palette={palette} size={Math.max(7, lay.label * 0.8)} color={palette.accent} dim={dim} />
            </View>
          </View>
        }
        footer={<Footer kit={kit} />}
      />
    </>
  );
}

/**
 * Paper — a magazine page: warm stock, serif display, hairline rules, a stamp.
 * In a feed of dark cards this is the one that looks printed rather than
 * rendered, which is the whole reason to offer it.
 */
function Paper({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `paper-${lay.baseWidth}x${lay.baseHeight}`;
  const rule = { backgroundColor: palette.hairline } as const;

  const decor = (
    <Decor cardId={`paper-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={3303} density={0.8} />
    </Decor>
  );

  /**
   * A rotated rubber stamp — the kind of micro-detail that reads as "printed".
   *
   * Anchored *inside* the stat block rather than spilling up over the rule: the
   * stamp is decoration, so it can never be allowed to land on the subline, and
   * a subline long enough to wrap to its second line did exactly that.
   */
  const stamp = (
    <View
      style={{
        position: 'absolute',
        right: -Math.round(lay.pad * 0.2),
        top: 0,
        transform: [{ rotate: '-7deg' }],
        borderWidth: Math.max(1, Math.round(lay.kicker * 0.16)),
        borderColor: palette.ink2,
        borderRadius: 3,
        paddingHorizontal: Math.max(4, Math.round(lay.kicker * 0.5)),
        paddingVertical: Math.max(2, Math.round(lay.kicker * 0.22)),
      }}
    >
      <Text allowFontScaling={false} style={[styles.mono, { color: palette.ink2, fontSize: Math.max(6, lay.kicker - 2), letterSpacing: Math.max(6, lay.kicker - 2) * 0.16 }]}>
        MEASURED ON DEVICE
      </Text>
    </View>
  );

  const header = (
    <View style={[styles.paperTop, { gap: lay.gap }]}>
      <View style={[styles.paperTopRule, { backgroundColor: palette.text }]} />
      <View style={styles.paperFolioRow}>
        <Text allowFontScaling={false} style={[styles.paperMark, { color: palette.text, fontSize: Math.max(10, Math.round(lay.headerFont * 0.78)), letterSpacing: lay.headerFont * 0.02 }]}>
          calibrEAT
        </Text>
        <Text allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker), letterSpacing: lay.kicker * 0.2 }]}>
          {lay.railFooter ? 'THE WEEKLY CALIBRATION' : '01 / WEEK'}
        </Text>
      </View>
      <View style={[styles.paperTopRule, { backgroundColor: palette.hairline }]} />
    </View>
  );

  const footer = lay.railFooter ? undefined : <Footer kit={kit} />;

  if (lay.railFooter) {
    const [headH, subH, statH] = splitBudget(lay.mainH, [42, 30, 28]);
    const headlineFont = Math.min(lay.headline * 1.1, fitLines(headH, 2, 1.06));
    const subFont = Math.min(lay.body, fitLines(subH, 2, 1.4));
    const statFont = Math.min(lay.hero * 1.2, fitLines(statH - Math.round(lay.label * 1.6), 1, 1.0));
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          header={header}
          main={
            <View style={[styles.wideRow, { gap: lay.gap * 1.3, alignItems: 'stretch' }]}>
              <View style={[styles.wideMain, { gap: Math.max(2, Math.round(lay.gap * 0.35)) }]}>
                <Text numberOfLines={2} allowFontScaling={false} style={[styles.paperHeadline, { color: palette.text, fontSize: headlineFont, lineHeight: headlineFont * 1.06, letterSpacing: headlineFont * -0.02 }]}>
                  {data.copy.headline}
                </Text>
                <View style={[styles.paperRule, rule]} />
                <Text numberOfLines={2} allowFontScaling={false} style={[styles.subline, { color: palette.muted, fontSize: subFont, lineHeight: subFont * 1.4 }]}>
                  {data.copy.subline}
                </Text>
              </View>
              <View style={styles.paperStat}>
                <Text numberOfLines={1} allowFontScaling={false} style={[styles.paperStatValue, { color: palette.accent, fontSize: statFont, lineHeight: statFont * 1.0, letterSpacing: displayTracking(statFont) }]}>
                  {data.hero.value}
                </Text>
                <Text numberOfLines={1} allowFontScaling={false} style={[styles.heroLabel, { color: palette.muted, fontSize: lay.label, letterSpacing: lay.label * 0.16 }]}>
                  {data.hero.label}
                </Text>
              </View>
              <FooterRail kit={kit} />
            </View>
          }
          footer={footer}
        />
      </>
    );
  }

  // No eyebrow row: the header already carries the folio, and a second small
  // caps line right under its rule reads as a mistake, not a hierarchy.
  const [headlineH, ruleH, subH, statH, bottomH] = splitBudget(lay.mainH, [36, 5, 15, 29, 15]);
  const headlineFont = Math.min(lay.headline * 1.45, fitLines(headlineH, 2, 1.06));
  const subFont = Math.min(lay.body * 1.05, fitLines(subH, 2, 1.4));
  const statFont = Math.min(lay.hero * 1.3, fitLines(statH - Math.round(lay.label * 1.8), 1, 1.0));
  const segmentH = Math.max(3, Math.round(bottomH * 0.18));

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        header={header}
        main={
          <View style={{ gap: Math.max(3, Math.round(lay.gap * 0.35)) }}>
            <View style={{ height: headlineH, justifyContent: 'center' }}>
              <Text numberOfLines={2} allowFontScaling={false} style={[styles.paperHeadline, { color: palette.text, fontSize: headlineFont, lineHeight: headlineFont * 1.06, letterSpacing: headlineFont * -0.022 }]}>
                {data.copy.headline}
              </Text>
            </View>
            <View style={{ height: ruleH, justifyContent: 'center' }}>
              <View style={[styles.paperRule, rule]} />
            </View>
            <View style={{ height: subH, justifyContent: 'center' }}>
              <Text numberOfLines={2} allowFontScaling={false} style={[styles.subline, { color: palette.muted, fontSize: subFont, lineHeight: subFont * 1.4 }]}>
                {data.copy.subline}
              </Text>
            </View>
            <View style={{ height: statH, justifyContent: 'center' }}>
              {stamp}
              <Text numberOfLines={1} allowFontScaling={false} style={[styles.paperStatValue, { color: palette.accent, fontSize: statFont, lineHeight: statFont * 1.0, letterSpacing: displayTracking(statFont) }]}>
                {data.hero.value}
              </Text>
              <Text numberOfLines={1} allowFontScaling={false} style={[styles.heroLabel, { color: palette.muted, fontSize: lay.label, letterSpacing: lay.label * 0.16 }]}>
                {data.hero.label}
              </Text>
            </View>
            <View style={{ height: bottomH, justifyContent: 'center', gap: Math.max(4, lay.gap * 0.4) }}>
              <SegmentBar lit={data.litDays} height={segmentH} color={palette.accent} dim={dimInk(palette)} />
              {/* One source per claim: the bar and this number both come from
                  `litDays`. Pairing the streak's pips with the coverage stat
                  printed "7 / 7 LOGGED" next to "6/7 DAYS LOGGED" — two
                  different windows, one row, so the card argued with itself. */}
              <View style={styles.legendRow}>
                <Text allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker - 1), letterSpacing: lay.kicker * 0.16 }]}>
                  THIS WEEK
                </Text>
                <Text allowFontScaling={false} style={[styles.mono, { color: palette.accent, fontSize: Math.max(7, lay.kicker - 1), letterSpacing: lay.kicker * 0.16 }]}>
                  {data.litDays}/7
                </Text>
              </View>
            </View>
          </View>
        }
        footer={footer}
      />
    </>
  );
}

/**
 * Terminal — the week as data, on phosphor green with scanlines. Leader dots
 * and mono type do the work; the giant metric is what makes it a poster rather
 * than a log dump.
 */
function Terminal({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `terminal-${lay.baseWidth}x${lay.baseHeight}`;
  // Supporting facts only: the metric above already is the streak.
  const supported = supportingStats(data, 4);
  const allRows = supported.length ? supported : data.rows.length ? data.rows : [{ label: 'days logged', value: String(data.litDays) }];

  const decor = (
    <Decor cardId={`terminal-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      <Scanlines width={size.baseWidth} height={size.baseHeight} color={palette.accent} step={Math.max(3, Math.round(lay.kicker * 0.5))} opacity={0.07} />
      <Watermark text="KCAL" size={size.baseWidth * 0.3} color={palette.speckle} style={{ position: 'absolute', bottom: -size.baseHeight * 0.03, right: -size.baseWidth * 0.02 }} />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={4404} />
    </Decor>
  );

  /** `label ······· value` — the leader dots are the whole aesthetic. */
  const table = (rows: ShareDataRow[], height: number, font: number) => {
    const rowH = Math.floor((height - 2) / Math.max(1, rows.length));
    const dots = '·'.repeat(Math.max(3, Math.round(lay.mainW / (font * 0.42))));
    return (
      <View style={{ height, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, borderRadius: Math.max(4, Math.round(lay.baseWidth * 0.03)), overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View
            key={row.label}
            style={[
              styles.terminalRow,
              { height: rowH, paddingHorizontal: Math.max(7, Math.round(lay.pad * 0.42)) },
              i < rows.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline } : null,
            ]}
          >
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: palette.muted, fontSize: font }]}>
              {row.label}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.monoDots, { color: palette.hairline, fontSize: font }]}>
              {dots}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: palette.accent, fontSize: font * 1.05, fontWeight: '700' }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const header = (
    <View style={styles.terminalHead}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: palette.accent, fontSize: Math.max(8, Math.round(lay.body * 0.95)) }]}>
        {'>'} calibreat --week
      </Text>
      <Pill label="on device" palette={palette} size={Math.max(7, lay.kicker - 2)} height={Math.max(13, Math.round(lay.headerH * 0.82))} />
    </View>
  );

  if (lay.railFooter) {
    const [tableH, noteH] = splitBudget(lay.mainH, [48, 44, 8]);
    const rowFont = Math.min(lay.body * 1.1, fitLines((tableH - 4) / Math.min(2, allRows.length), 1.4));
    const noteFont = Math.min(lay.body * 1.5, fitLines(noteH, 3, 1.3));
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          header={header}
          main={
            <View style={[styles.wideRow, { alignItems: 'stretch', gap: lay.gap }]}>
              <View style={[styles.wideMain, { height: lay.mainH, justifyContent: 'center', gap: Math.max(4, lay.gap * 0.5) }]}>
                {table(allRows.slice(0, 2), tableH, rowFont)}
                <Text numberOfLines={3} allowFontScaling={false} style={[styles.monoBody, { color: palette.text, fontSize: noteFont, lineHeight: noteFont * 1.3 }]}>
                  {data.copy.headline}
                </Text>
              </View>
              <FooterRail kit={kit} />
            </View>
          }
        />
      </>
    );
  }

  const shown = allRows.slice(0, 4);
  const [numH, tableH, noteH] = splitBudget(lay.mainH, [30, 40, 17, 13]);
  const numFont = Math.min(lay.hero * 1.2, fitLines(numH - Math.round(lay.body * 1.2), 1, 0.98));
  const rowFont = Math.min(lay.body * 1.15, fitLines(tableH / shown.length - 8, 1, 1.4));
  const noteFont = Math.min(lay.body * 1.05, fitLines(noteH, 3, 1.32));

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        header={header}
        main={
          <View style={{ gap: Math.max(4, lay.gap * 0.5) }}>
            <View style={{ height: numH, justifyContent: 'flex-end' }}>
              <View style={styles.terminalMetric}>
                <HeroNumeral value={data.hero.value} font={numFont} color={palette.accent} />
                <Unit label={data.hero.label.toUpperCase()} palette={palette} size={Math.max(8, lay.kicker)} color={palette.muted} />
              </View>
            </View>
            {table(shown, tableH, rowFont)}
            <View style={{ height: noteH, justifyContent: 'center' }}>
              <Text numberOfLines={2} allowFontScaling={false} style={[styles.monoBody, { color: palette.text, fontSize: noteFont, lineHeight: noteFont * 1.32 }]}>
                {data.copy.headline}
              </Text>
            </View>
          </View>
        }
        footer={<Footer kit={kit} />}
      />
    </>
  );
}

/**
 * Medal — the achievement card: chrome bar, an earned medal on its lanyard, the
 * number with a claim stamped beside it, and a ringed identity strip.
 *
 * This is the shape people already know how to read from every other training
 * app, which is the whole point: a share card that needs study does not get
 * shared. The medal's metal is earned (see shareAchievement) and the stamp never
 * claims a record that was not set.
 */
function MedalCard({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `medal-${lay.baseWidth}x${lay.baseHeight}`;
  const achievement: ShareAchievement = data.achievement ?? { title: 'Your week', subtitle: '', tone: 'gold' };
  const status: ShareStatus = data.status ?? { label: 'Measured', tone: 'muted' };
  const best: ShareDataRow = data.best ?? { label: 'best run', value: '—' };
  // The chrome owns the top area, so the header band's height is folded in.
  const bareH = lay.mainH + lay.headerH + lay.gap;

  const decor = (
    <Decor cardId={`medal-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={5505} />
    </Decor>
  );

  // Engraved centre mark, chosen to match what the medal is celebrating: the
  // streak flame for a run, a check for an honest week, scales for a
  // measurement-only card. Falls back to the flame.
  const markLower = achievement.title.toLowerCase();
  const engraved = (medalSize: number) => {
    const mark = Math.max(16, Math.round(medalSize * 0.3));
    if (markLower.includes('week')) return <EngravedCheck size={mark} color="#3B2A0E" />;
    if (markLower.includes('calibrat')) return <EngravedScales size={mark} color="#3B2A0E" />;
    return <FireGlyph live={false} color="#3B2A0E" soft="#8A5A16" inner="#C08A2E" size={mark} />;
  };

  // The medal arches the achievement across the disc, so when that achievement
  // *is* the record the strip must not print it again (see shareStripRow).
  const stripStat = shareStripRow(achievement, best, data.progress);

  const strip = (monogram: number, qrSize: number) => (
    <IdentityStrip
      palette={palette}
      monogramSize={monogram}
      monogramLetter="C"
      name="calibrEAT"
      detail="measured on device"
      statLabel={stripStat.label}
      statValue={stripStat.value}
      qr={<QrCode size={qrSize} dark="#05080C" light="#FFFFFF" captionColor={palette.muted} />}
    />
  );

  if (lay.railFooter) {
    // Only the first two bands are used here; the rail variant renders the
    // identity strip inline, so its band (still weighed below, to keep the
    // proportions) is not destructured.
    const [chromeH, medalRowH] = splitBudget(bareH, [17, 46, 37]);
    const barH = Math.max(15, Math.min(Math.round(chromeH * 0.62), Math.round(lay.baseWidth * 0.075)));
    const medalSize = Math.max(36, Math.min(medalRowH - 6, lay.mainH * 0.62));
    const valueFont = Math.min(lay.hero * 1.1, fitLines(medalRowH - Math.round(lay.label * 1.6), 1, 0.98), fitWidth(lay.mainW * 0.3, data.hero.value.length, 0.62));
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          bare
          main={
            <View style={{ gap: lay.gap }}>
              <CardChrome
                palette={palette}
                eyebrow={data.eyebrow ?? 'Your week'}
                height={barH}
                markSize={Math.round(barH * 0.52)}
                wordSize={Math.max(9, Math.round(barH * 0.46))}
                eyebrowSize={Math.max(7, lay.kicker - 1)}
                right={<StatusChip label={status.label} palette={palette} size={Math.max(7, lay.kicker - 2)} height={Math.max(12, Math.round(barH * 0.72))} tone={status.tone} />}
              />
              <View style={[styles.wideRow, { gap: lay.gap * 1.2 }]}>
                <MedalAssembly
                  medalSize={medalSize}
                  strapHeight={Math.round(medalSize * 0.22)}
                  tone={achievement.tone}
                  title={achievement.title}
                  subtitle={achievement.subtitle}
                  palette={palette}
                >
                  {engraved(medalSize)}
                </MedalAssembly>
                <View style={[styles.wideMain, { gap: 2 }]}>
                  <Text numberOfLines={1} allowFontScaling={false} style={[styles.heroLabel, { color: palette.muted, fontSize: lay.label, letterSpacing: lay.label * 0.16 }]}>
                    {data.hero.label.toUpperCase()}
                  </Text>
                  <HeroNumeral value={data.hero.value} font={valueFont} color={palette.accent} />
                  {data.dateLabel ? (
                    <Text numberOfLines={1} allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker - 1) }]}>
                      {data.dateLabel.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
                <QrCode size={Math.max(24, Math.min(lay.qrSize, lay.mainH * 0.7))} dark="#05080C" light="#FFFFFF" captionColor={palette.muted} />
              </View>
            </View>
          }
        />
      </>
    );
  }

  const [chromeH, medalBlockH, metricH, stripH] = splitBudget(bareH, [11, 41, 18, 20]);
  const barH = Math.max(16, Math.min(Math.round(chromeH * 0.62), Math.round(lay.baseWidth * 0.08)));
  const eyebrowSize = Math.max(7, Math.min(Math.round(chromeH * 0.26), lay.kicker + 1));
  const strapH = Math.round(medalBlockH * 0.24);
  const medalSize = Math.max(40, Math.min(medalBlockH - strapH, lay.mainW * 0.6));
  const [valueH, valueLabelH] = splitBudget(metricH, [70, 30]);
  const valueFont = Math.min(
    lay.hero * 1.25,
    fitLines(valueH, 1, 0.98),
    fitWidth(lay.mainW * 0.56, data.hero.value.length, 0.62),
  );
  const monogram = Math.max(20, Math.min(Math.round(stripH * 0.86), Math.round(lay.baseWidth * 0.13)));
  const qrSize = Math.max(22, Math.min(Math.round(stripH * 0.92), Math.round(monogram * 1.15)));

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        bare
        main={
          <View style={{ gap: Math.max(4, lay.gap * 0.6) }}>
            <CardChrome
              palette={palette}
              eyebrow={data.eyebrow ?? 'Your week'}
              height={barH}
              markSize={Math.round(barH * 0.5)}
              wordSize={Math.max(10, Math.round(barH * 0.46))}
              eyebrowSize={eyebrowSize}
              right={<EqualiserGlyph size={Math.round(barH * 0.5)} color={palette.accent} />}
            />
            <View style={{ height: medalBlockH, alignItems: 'center', justifyContent: 'center' }}>
              <MedalAssembly
                medalSize={medalSize}
                strapHeight={strapH}
                tone={achievement.tone}
                title={achievement.title}
                subtitle={achievement.subtitle}
                palette={palette}
              >
                {engraved(medalSize)}
              </MedalAssembly>
            </View>
            {/* The number and its claim, divided — the reference's "21:30 | NEW PR!". */}
            <View style={{ height: metricH, flexDirection: 'row', alignItems: 'center', gap: lay.gap }}>
              <View style={{ width: Math.round(lay.mainW * 0.56) }}>
                <View style={{ height: valueH, justifyContent: 'center' }}>
                  <HeroNumeral value={data.hero.value} font={valueFont} color={palette.accent} />
                </View>
                <View style={{ height: valueLabelH, justifyContent: 'center' }}>
                  <Text numberOfLines={1} allowFontScaling={false} style={[styles.heroLabel, { color: palette.muted, fontSize: lay.label, letterSpacing: lay.label * 0.16 }]}>
                    {data.hero.label.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={{ width: StyleSheet.hairlineWidth, height: Math.round(metricH * 0.62), backgroundColor: palette.hairline }} />
              <View style={{ flex: 1, alignItems: 'flex-start', gap: Math.max(4, lay.gap * 0.4) }}>
                <StatusChip
                  label={status.label}
                  palette={palette}
                  size={Math.max(8, lay.kicker)}
                  height={Math.max(15, Math.round(metricH * 0.34))}
                  tone={status.tone}
                />
                {data.dateLabel ? (
                  <Text numberOfLines={1} allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker) }]}>
                    {data.dateLabel.toUpperCase()}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ height: stripH, justifyContent: 'flex-end' }}>{strip(monogram, qrSize)}</View>
          </View>
        }
      />
    </>
  );
}

/**
 * Goal — progress as the hero: the number, a filled track, the claim, and
 * activity rings for the day's macros.
 *
 * Rings need macro targets, which only Home can supply; shared from Trends the
 * block falls back to the plain stat row rather than drawing three empty rings.
 */
function GoalCard({ kit }: { kit: Kit }) {
  const { palette, lay, size, data } = kit;
  const uid = `goal-${lay.baseWidth}x${lay.baseHeight}`;
  const progress: ShareProgress = data.progress ?? { pct: 0, value: '0', target: '0', label: 'Days logged' };
  const status: ShareStatus = data.status ?? { label: 'On track', tone: 'muted' };
  const best: ShareDataRow = data.best ?? { label: 'best run', value: '—' };
  const macros = (data.macros ?? []).slice(0, 3);
  const bareH = lay.mainH + lay.headerH + lay.gap;

  const decor = (
    <Decor cardId={`goal-${lay.baseWidth}x${lay.baseHeight}`}>
      <Mesh palette={palette} width={size.baseWidth} height={size.baseHeight} uid={uid} />
      <Grain palette={palette} width={size.baseWidth} height={size.baseHeight} seed={6606} />
    </Decor>
  );

  const rings = (height: number) => {
    const ringSize = Math.max(28, Math.min(height, Math.floor((lay.mainW - lay.gap * 2) / 3), Math.round(lay.mainW * 0.26)));
    return (
      <View style={[styles.ringRow, { height, gap: lay.gap }]}>
        {macros.map((macro) => {
          const pct = macro.target > 0 ? macro.value / macro.target : 0;
          return (
            <View key={macro.label} style={styles.ringCell}>
              <ActivityRing size={ringSize} pct={pct} color={palette.accent} track={palette.hairline}>
                <Text allowFontScaling={false} style={[styles.ringValue, { color: palette.text, fontSize: Math.max(9, Math.round(ringSize * 0.24)) }]}>
                  {Math.round(pct * 100)}%
                </Text>
              </ActivityRing>
              <Text allowFontScaling={false} numberOfLines={1} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker - 1), letterSpacing: lay.kicker * 0.14 }]}>
                {macro.label.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (lay.railFooter) {
    // Rail variant: the strip rides inline, so only the first two bands are used.
    const [chromeH, bodyH] = splitBudget(bareH, [16, 48, 36]);
    const barH = Math.max(15, Math.min(Math.round(chromeH * 0.62), Math.round(lay.baseWidth * 0.075)));
    const trackH = Math.max(6, Math.round(bodyH * 0.16));
    const valueFont = Math.min(lay.hero * 1.2, fitLines(bodyH - trackH - Math.round(lay.label * 1.4), 1, 0.98), fitWidth(lay.mainW * 0.34, data.hero.value.length, 0.62));
    const chips = macros.length ? rings(bodyH) : null;
    return (
      <>
        {decor}
        <Frame
          lay={lay}
          bare
          main={
            <View style={{ gap: lay.gap }}>
              <CardChrome
                palette={palette}
                eyebrow="Weekly calibration"
                height={barH}
                markSize={Math.round(barH * 0.52)}
                wordSize={Math.max(9, Math.round(barH * 0.46))}
                eyebrowSize={Math.max(7, lay.kicker - 1)}
                right={<StatusChip label={status.label} palette={palette} size={Math.max(7, lay.kicker - 2)} height={Math.max(12, Math.round(barH * 0.72))} tone={status.tone} />}
              />
              <View style={[styles.wideRow, { gap: lay.gap * 1.2 }]}>
                <View style={[styles.wideMain, { gap: 3 }]}>
                  <HeroNumeral value={data.hero.value} font={valueFont} color={palette.accent} />
                  <ProgressTrack width={Math.round(lay.mainW * 0.36)} height={trackH} pct={progress.pct} fill={palette.accent} track={palette.hairline} cap={palette.accent} />
                  <Text numberOfLines={1} allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker - 1) }]}>
                    {`${progress.value}/${progress.target} ${progress.label.toUpperCase()}`}
                  </Text>
                </View>
                {chips ? <View style={styles.ringCell}>{chips}</View> : null}
                <QrCode size={Math.max(24, Math.min(lay.qrSize, lay.mainH * 0.7))} dark="#05080C" light="#FFFFFF" captionColor={palette.muted} />
              </View>
            </View>
          }
        />
      </>
    );
  }

  const [chromeH, heroBlockH, trackH, ringsH, stripH] = splitBudget(bareH, [11, 26, 9, 34, 20]);
  const barH = Math.max(16, Math.min(Math.round(chromeH * 0.62), Math.round(lay.baseWidth * 0.08)));
  const valueFont = Math.min(
    lay.hero * 1.3,
    fitLines(heroBlockH, 1, 0.98),
    fitWidth(lay.mainW * 0.66, data.hero.value.length, 0.62),
  );
  const trackBar = Math.max(6, Math.round(trackH * 0.4));
  const monogram = Math.max(20, Math.min(Math.round(stripH * 0.86), Math.round(lay.baseWidth * 0.13)));
  const qrSize = Math.max(22, Math.min(Math.round(stripH * 0.92), Math.round(monogram * 1.15)));

  return (
    <>
      {decor}
      <Frame
        lay={lay}
        bare
        main={
          <View style={{ gap: Math.max(4, lay.gap * 0.6) }}>
            <CardChrome
              palette={palette}
              eyebrow="Weekly calibration"
              height={barH}
              markSize={Math.round(barH * 0.5)}
              wordSize={Math.max(10, Math.round(barH * 0.46))}
              eyebrowSize={Math.max(7, Math.min(Math.round(chromeH * 0.26), lay.kicker + 1))}
              right={<EqualiserGlyph size={Math.round(barH * 0.5)} color={palette.accent} />}
            />
            <View style={{ height: heroBlockH, justifyContent: 'center' }}>
              <HeroNumeral value={data.hero.value} font={valueFont} color={palette.accent} />
              <Text numberOfLines={1} allowFontScaling={false} style={[styles.heroLabel, { color: palette.muted, fontSize: lay.label, letterSpacing: lay.label * 0.16 }]}>
                {data.hero.label.toUpperCase()}
              </Text>
            </View>
            <View style={{ height: trackH, justifyContent: 'center', gap: Math.max(3, lay.gap * 0.3) }}>
              <ProgressTrack width={lay.mainW} height={trackBar} pct={progress.pct} fill={palette.accent} track={palette.hairline} cap={palette.accent} />
              <View style={styles.legendRow}>
                <Text numberOfLines={1} allowFontScaling={false} style={[styles.mono, { color: palette.muted, fontSize: Math.max(7, lay.kicker - 1), letterSpacing: lay.kicker * 0.1 }]}>
                  {progress.label.toUpperCase()}
                </Text>
                <StatusChip
                  label={status.label}
                  palette={palette}
                  size={Math.max(7, lay.kicker - 2)}
                  height={Math.max(12, lay.kicker + 5)}
                  tone={status.tone}
                />
              </View>
            </View>
            {macros.length ? (
              rings(ringsH)
            ) : (
              <View style={{ height: ringsH, justifyContent: 'center' }}>
                <StatRow
                  items={supportingStats(data, 3)}
                  palette={palette}
                  height={ringsH}
                  width={lay.mainW}
                  labelSize={Math.max(7, lay.kicker - 1)}
                  valueSize={Math.max(11, Math.round(lay.body * 1.3))}
                />
              </View>
            )}
            <View style={{ height: stripH, justifyContent: 'flex-end' }}>
              <IdentityStrip
                palette={palette}
                monogramSize={monogram}
                monogramLetter="C"
                name="calibrEAT"
                detail="measured on device"
                statLabel={best.label}
                statValue={best.value}
                qr={<QrCode size={qrSize} dark="#05080C" light="#FFFFFF" captionColor={palette.muted} />}
              />
            </View>
          </View>
        }
      />
    </>
  );
}

const TEMPLATE_RENDERERS: Record<ShareTemplateId, (props: { kit: Kit }) => React.JSX.Element> = {
  medal: MedalCard,
  goal: GoalCard,
  instrument: Instrument,
  grid: Grid,
  paper: Paper,
  terminal: Terminal,
};

export function ShareCard({ format, template, ...data }: ShareCardProps) {
  const size = shareCardSize(format);
  const { palette } = getShareTemplate(template);
  const lay = shareLayout(size, { heroChars: data.hero.value.length });
  const kit: Kit = { size, palette, lay, data };
  const Renderer = TEMPLATE_RENDERERS[template] ?? Instrument;

  return (
    <View
      // Readable from the browser during development so the share lab can
      // report which format × template pairs overflow their frame.
      nativeID={`sharecard-${format}-${template}`}
      style={[
        styles.card,
        {
          width: size.baseWidth,
          height: size.baseHeight,
          backgroundColor: palette.background,
          paddingTop: size.safeTop + lay.pad,
          paddingBottom: size.safeBottom + lay.pad,
          paddingHorizontal: lay.pad,
          gap: lay.gap,
        },
      ]}
    >
      <Renderer kit={kit} />
    </View>
  );
}

/**
 * A scaled-down, visible copy of the card — so a user sees exactly what they
 * are about to post before they post it. The scale maths places the shrunken
 * card against the wrap's top-left corner on every platform (transform origin
 * defaults to the centre, hence the negative offsets).
 */
export function ShareCardPreview({ maxWidth, format, template, ...data }: ShareCardProps & { maxWidth: number }) {
  const size = shareCardSize(format);
  const scale = Math.min(1, maxWidth / size.baseWidth);
  const shownWidth = size.baseWidth * scale;
  const shownHeight = size.baseHeight * scale;
  return (
    <View
      style={[styles.preview, { width: shownWidth, height: shownHeight, borderRadius: Math.round(shownWidth * 0.06) }]}
      accessibilityLabel={`Preview of the ${template} card`}
    >
      <View
        style={{
          width: size.baseWidth,
          height: size.baseHeight,
          marginLeft: -(size.baseWidth * (1 - scale)) / 2,
          marginTop: -(size.baseHeight * (1 - scale)) / 2,
          transform: [{ scale }],
        }}
      >
        <ShareCard format={format} template={template} {...data} />
      </View>
    </View>
  );
}

/**
 * The off-screen capture stage. Kept mounted (never conditionally unmounted)
 * so the share is instant, transparent, behind the scroll content and hidden
 * from accessibility — the pattern both Home and Trends use so they can never
 * drift into two different images.
 */
export function ShareCardStage({
  cardRef,
  format,
  template,
  ...data
}: ShareCardProps & { cardRef: RefObject<View | null> }) {
  const size = shareCardSize(format);
  return (
    <View
      style={[styles.stage, { width: size.baseWidth, height: size.baseHeight, pointerEvents: 'none' }]}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View ref={cardRef} collapsable={false}>
        <ShareCard format={format} template={template} {...data} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  stage: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0,
  },
  preview: { overflow: 'hidden', backgroundColor: '#070C12', alignSelf: 'center' },

  /* Type */
  brandName: { fontWeight: '800', fontFamily: Fonts.rounded },
  watermark: { position: 'absolute', fontWeight: '800', fontFamily: Fonts.rounded },
  heroNumeral: { fontFamily: Fonts.rounded, fontWeight: '800' },
  heroLabel: { fontWeight: '800', textTransform: 'uppercase' },
  headline: { fontFamily: Fonts.rounded, fontWeight: '800', letterSpacing: -0.3 },
  subline: { fontFamily: Fonts.rounded },
  kicker: { fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase' },
  kickerRow: { flexDirection: 'row', alignItems: 'center' },
  mono: { fontFamily: Fonts.mono },
  monoDots: { fontFamily: Fonts.mono, flex: 1, overflow: 'hidden', marginHorizontal: 4 },
  monoBody: { fontFamily: Fonts.mono, fontWeight: '700' },
  statRow: { flexDirection: 'row' },
  statCell: { flex: 1, justifyContent: 'center' },
  statValue: { fontFamily: Fonts.rounded, fontWeight: '800' },
  segmentBar: { flexDirection: 'row', gap: 3 },
  legend: { flexDirection: 'row', alignItems: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  /* Chips */
  pill: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase' },

  /* Brand + footer */
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRight: { flexDirection: 'row', alignItems: 'center' },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  footerCopy: { flex: 1, flexShrink: 1 },
  footerUrl: { fontFamily: Fonts.mono, fontWeight: '700' },
  footerTagline: { fontFamily: Fonts.rounded },
  footerRail: { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 },
  qrWrap: { alignItems: 'center' },
  qrCaption: { fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase' },

  /* Spark */
  sparkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  /* Calendar */
  calendar: { alignItems: 'flex-start' },
  calendarRow: { flexDirection: 'row' },

  /* Paper */
  paperTop: { justifyContent: 'center' },
  paperTopRule: { height: StyleSheet.hairlineWidth },
  paperFolioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  paperMark: { fontWeight: '800', fontFamily: Fonts.serif, letterSpacing: -0.2 },
  paperHeadline: { fontFamily: Fonts.serif, fontWeight: '700' },
  paperRule: { height: StyleSheet.hairlineWidth, width: '28%' },
  paperStat: { alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  paperStatValue: { fontFamily: Fonts.serif, fontWeight: '700' },

  /* Rings */
  ringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ringCell: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  ringValue: { fontFamily: Fonts.rounded, fontWeight: '800' },

  /* Terminal */
  terminalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  terminalMetric: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  terminalRow: { flexDirection: 'row', alignItems: 'center' },

  /* Wide */
  wideRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  wideMain: { flex: 1 },
});
