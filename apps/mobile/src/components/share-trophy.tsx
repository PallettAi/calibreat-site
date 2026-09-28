/**
 * The trophy kit — the parts an *achievement* card is made of.
 *
 * The editorial templates (Paper, Terminal) tell you what the week was. This kit
 * is for the other job a share card does: showing that something was *won*. The
 * vocabulary is the one every athlete already reads fluently — a medal hanging
 * from a lanyard, a status stamp, a filled progress track, activity rings, and a
 * chrome bar down the top with the app's name in it. Straight from the
 * reference the app is aiming at (Strava/Nike-class milestone cards): card
 * chrome, medal, one big number, a claim, a ring-badged footer.
 *
 * Two deliberate departures from the reference, both because a share card must
 * not lie:
 *
 *  · The left of the chrome bar is an **equaliser glyph**, not a hamburger
 *    menu. A menu icon on a saved PNG is a picture of a button that does not
 *    exist; the equaliser is the app's own calibration mark.
 *  · The footer strip carries no avatar, handle, country flag or social icons.
 *    calibrEAT has no account, no username and no user photo — so the strip
 *    shows a ringed monogram of the brand, the measured-on-device claim, and
 *    the QR. The *layout* is the reference's; the content is ours.
 *
 * Everything is portable SVG: arcs are built from per-glyph rotations rather
 * than `TextPath` (which is a native-module feature), so the medal sets
 * identically on Android, iOS and the web preview.
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { arcGlyphs, fitArc } from '@/lib/share-arc';
import { fitWidth, type SharePalette } from '@/lib/share-templates';

/** Arc text as individual glyphs — no `TextPath`, so it renders everywhere. */
function ArcText({
  text,
  cx,
  cy,
  radius,
  stepDeg = 9,
  centerDeg = 0,
  fontSize,
  color,
  fontFamily,
  letterOpacity,
}: {
  text: string;
  cx: number;
  cy: number;
  radius: number;
  stepDeg?: number;
  centerDeg?: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  letterOpacity?: number;
}) {
  const glyphs = arcGlyphs({ text, cx, cy, radius, stepDeg, centerDeg });
  return (
    <>
      {glyphs.map((glyph, i) => (
        <SvgText
          key={`${glyph.char}-${i}`}
          x={glyph.x}
          y={glyph.y}
          fill={color}
          fontSize={fontSize}
          fontFamily={fontFamily ?? Fonts.rounded}
          fontWeight="800"
          textAnchor="middle"
          alignmentBaseline="middle"
          opacity={letterOpacity}
          transform={`rotate(${glyph.rotate} ${glyph.x} ${glyph.y})`}
        >
          {glyph.char}
        </SvgText>
      ))}
    </>
  );
}

/* ── Medal ─────────────────────────────────────────────────────── */

export type MedalTone = 'gold' | 'silver' | 'bronze' | 'accent';

/**
 * Metal finishes, light source top-left. A medal drawn in one flat colour reads
 * as a sticker; the four-stop ramp is what makes it look struck.
 */
const MEDAL_METAL: Record<MedalTone, [string, string, string, string]> = {
  gold: ['#FFF3C4', '#F2CE74', '#B8872E', '#6B4711'],
  silver: ['#FFFFFF', '#DCE4EC', '#97A4B2', '#525D68'],
  bronze: ['#FADCB4', '#D9A368', '#A2652F', '#57330F'],
  accent: ['#F2FFDA', '#D8F87C', '#8CBC1E', '#425C0A'],
};

/** Two-strap lanyard above the medal, with the accent stripe. */
function Lanyard({
  width,
  height,
  cx,
  palette,
  strap,
}: {
  width: number;
  height: number;
  cx: number;
  palette: SharePalette;
  strap: string;
}) {
  // Each strap is a tapered quad from the top edge down to the medal's rim.
  const left = `M${cx - width * 0.30} 0 L${cx - width * 0.10} 0 L${cx - 0.5} ${height} L${cx - width * 0.035} ${height} Z`;
  const right = `M${cx + width * 0.10} 0 L${cx + width * 0.30} 0 L${cx + width * 0.035} ${height} L${cx + 0.5} ${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="trophy-strap" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={strap} stopOpacity={0.95} />
          <Stop offset="1" stopColor={strap} stopOpacity={0.55} />
        </LinearGradient>
      </Defs>
      <Path d={left} fill="url(#trophy-strap)" />
      <Path d={right} fill="url(#trophy-strap)" />
      {/* Accent pinstripe on each strap: the detail that says "ribbon". */}
      <Path d={`M${cx - width * 0.215} 0 L${cx - width * 0.185} 0 L${cx - width * 0.055} ${height} L${cx - width * 0.075} ${height} Z`} fill={palette.accent} opacity={0.85} />
      <Path d={`M${cx + width * 0.185} 0 L${cx + width * 0.215} 0 L${cx + width * 0.075} ${height} L${cx + width * 0.055} ${height} Z`} fill={palette.accent} opacity={0.85} />
    </Svg>
  );
}

/** Glowing dashed arcs flanking the medal, the reference's "energy" marks. */
function GlowArcs({ width, height, cx, cy, radius, color }: { width: number; height: number; cx: number; cy: number; radius: number; color: string }) {
  return (
    <Svg width={width} height={height}>
      {[radius, radius * 1.18].map((r, i) => (
        <Circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={i === 0 ? 2 : 1}
          strokeDasharray="2 7"
          strokeLinecap="round"
          fill="none"
          opacity={i === 0 ? 0.9 : 0.45}
        />
      ))}
      {[radius, radius * 1.18].map((r, i) => (
        <Circle
          key={`g${r}`}
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={i === 0 ? 2 : 1}
          strokeDasharray="2 7"
          strokeLinecap="round"
          fill="none"
          opacity={0.25}
          transform={`rotate(90 ${cx} ${cy})`}
        />
      ))}
    </Svg>
  );
}

export function Medal({
  size,
  tone,
  title,
  subtitle,
  palette,
}: {
  size: number;
  tone: MedalTone;
  /** Arched across the top of the disc. Keep it under ~16 characters. */
  title: string;
  /** Arched across the bottom of the disc, under the glyph. */
  subtitle?: string;
  palette: SharePalette;
}) {
  const metal = MEDAL_METAL[tone];
  const cx = size / 2;
  const cy = size / 2;
  const discR = size / 2 - Math.max(2, size * 0.03);
  const rimR = discR - Math.max(1.5, size * 0.028);
  const bandR = rimR - Math.max(6, size * 0.09);
  // Title size walks down with the string length so a long achievement name
  // still arcs inside the rim instead of running off the disc.
  const titleSize = Math.max(6, Math.min(size * 0.115, fitWidth(size * 0.62, title.length, 0.62)));
  const subSize = Math.max(5, Math.min(size * 0.075, fitWidth(size * 0.5, (subtitle ?? '').length || 1, 0.6)));
  // The radius decides the step, not the string length: the same 9° that reads
  // as generously spaced on a 180px medallion overlaps its letters on a 100px
  // one. `fitArc` widens the arc before it shrinks the type, and never returns
  // a step that lets two glyphs share pixels.
  const titleRadius = bandR + (discR - bandR) * 0.55;
  const subRadius = bandR - size * 0.03;
  const titleFit = fitArc({ text: title.toUpperCase(), radius: titleRadius, fontSize: titleSize, maxSweepDeg: 150 });
  // The title owns the top 150°, so the bottom arc can afford 120° before the
  // two would meet — room worth spending on spacing rather than on smaller type.
  const subFit = fitArc({ text: (subtitle ?? '').toUpperCase(), radius: subRadius, fontSize: subSize, maxSweepDeg: 120 });

  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="trophy-disc" cx="34%" cy="26%" r="82%">
          <Stop offset="0" stopColor={metal[0]} />
          <Stop offset="0.42" stopColor={metal[1]} />
          <Stop offset="0.82" stopColor={metal[2]} />
          <Stop offset="1" stopColor={metal[3]} />
        </RadialGradient>
      </Defs>
      {/* Halo: a soft accent bloom behind the metal. */}
      <Circle cx={cx} cy={cy} r={discR} fill={palette.accent} opacity={0.16} />
      <Circle cx={cx} cy={cy} r={discR} fill="url(#trophy-disc)" />
      <Circle cx={cx} cy={cy} r={discR - 0.5} stroke="rgba(255,255,255,0.5)" strokeWidth={1} fill="none" />
      {/* Engraved band the title rides on. */}
      <Circle cx={cx} cy={cy} r={bandR} stroke="rgba(0,0,0,0.28)" strokeWidth={1} fill="none" />
      <ArcText
        text={title.toUpperCase()}
        cx={cx}
        cy={cy}
        radius={titleRadius}
        stepDeg={titleFit.stepDeg}
        centerDeg={0}
        fontSize={titleFit.fontSize}
        color="#1A1208"
      />
      {subtitle ? (
        <ArcText
          text={subtitle.toUpperCase()}
          cx={cx}
          cy={cy}
          radius={subRadius}
          stepDeg={subFit.stepDeg}
          centerDeg={180}
          fontSize={subFit.fontSize}
          color="#1A1208"
          letterOpacity={0.72}
        />
      ) : null}
    </Svg>
  );
}

/* ── Progress + rings ──────────────────────────────────────────── */

/** Filled track with a rounded cap: the "goal met" bar from the reference. */
export function ProgressTrack({
  width,
  height,
  pct,
  fill,
  track,
  cap,
}: {
  width: number;
  height: number;
  /** 0…1 */
  pct: number;
  fill: string;
  track: string;
  /** Colour of the knob at the end of the filled span. */
  cap?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.max(height, Math.round(width * clamped));
  const knob = Math.max(height, Math.round(height * 1.9));
  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: height / 2, backgroundColor: track }} />
      <View style={{ position: 'absolute', left: 0, width: filled, top: 0, bottom: 0, borderRadius: height / 2, backgroundColor: fill }} />
      {cap ? (
        <View
          style={{
            position: 'absolute',
            left: Math.max(0, filled - knob / 2),
            top: (height - knob) / 2,
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            backgroundColor: cap,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Activity ring: a 270° arc that fills from the top, plus a badge in the middle
 * (a glyph, or a percentage). Drawn from dash offsets on two circles — the
 * cheapest way to get an arc that antialiases in both renderers.
 */
export function ActivityRing({
  size,
  pct,
  color,
  track,
  thickness,
  children,
}: {
  size: number;
  /** 0…1 */
  pct: number;
  color: string;
  track: string;
  thickness?: number;
  children?: ReactNode;
}) {
  const stroke = thickness ?? Math.max(3, Math.round(size * 0.12));
  const r = (size - stroke) / 2;
  const sweep = 0.75; // 270°
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${2 * Math.PI * r * sweep} ${2 * Math.PI * r}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
        {clamped > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${2 * Math.PI * r * sweep * clamped} ${2 * Math.PI * r}`}
            transform={`rotate(135 ${size / 2} ${size / 2})`}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/* ── Chip, chrome, identity ────────────────────────────────────── */

export function StatusChip({
  label,
  palette,
  size,
  height,
  tone = 'accent',
}: {
  label: string;
  palette: SharePalette;
  size: number;
  height: number;
  tone?: 'accent' | 'muted' | 'metal';
}) {
  const bg = tone === 'accent' ? palette.accent : tone === 'metal' ? 'rgba(242,206,116,0.16)' : 'transparent';
  const fg = tone === 'accent' ? palette.accentInk : tone === 'metal' ? '#F2CE74' : palette.muted;
  return (
    <View
      style={[
        styles.chip,
        {
          height,
          paddingHorizontal: Math.round(height * 0.6),
          borderRadius: Math.max(3, Math.round(height * 0.28)),
          backgroundColor: bg,
          borderColor: tone === 'muted' ? palette.hairline : 'transparent',
        },
      ]}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.chipText, { color: fg, fontSize: size, letterSpacing: size * 0.14 }]}
      >
        {label}
      </Text>
    </View>
  );
}

/** The app's calibration mark: three bars of unequal height. */
export function EqualiserGlyph({ size, color }: { size: number; color: string }) {
  const bar = Math.max(1.5, size * 0.16);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={9} width={bar} height={12} rx={bar / 2} fill={color} />
      <Rect x={11} y={4} width={bar} height={17} rx={bar / 2} fill={color} />
      <Rect x={17} y={13} width={bar} height={8} rx={bar / 2} fill={color} />
    </Svg>
  );
}

/**
 * The chrome bar: rounded plate, hairline edge, mark left, wordmark centred,
 * contextual glyph right, eyebrow underneath. This is the element that makes a
 * card look like it came out of an app rather than out of a spreadsheet.
 */
export function CardChrome({
  palette,
  eyebrow,
  height,
  markSize,
  wordSize,
  eyebrowSize,
  right,
}: {
  palette: SharePalette;
  eyebrow: string;
  height: number;
  markSize: number;
  wordSize: number;
  eyebrowSize: number;
  right?: ReactNode;
}) {
  return (
    <View style={{ gap: Math.max(4, Math.round(height * 0.28)) }}>
      <View
        style={[
          styles.chromeBar,
          {
            height,
            borderRadius: Math.max(5, Math.round(height * 0.3)),
            paddingHorizontal: Math.max(6, Math.round(height * 0.34)),
            backgroundColor: palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
            borderColor: palette.hairline,
          },
        ]}
      >
        <EqualiserGlyph size={markSize} color={palette.muted} />
        <Text allowFontScaling={false} style={[styles.wordmark, { color: palette.text, fontSize: wordSize }]}>
          calibr<Text style={{ color: palette.accent }}>EAT</Text>
        </Text>
        <View style={styles.chromeRight}>{right}</View>
      </View>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.eyebrow, { color: palette.muted, fontSize: eyebrowSize, letterSpacing: eyebrowSize * 0.22 }]}
      >
        {eyebrow.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Footer identity strip: ringed monogram, the brand line, the comparison stat,
 * and the code. Not a profile — calibrEAT has no accounts — but the same
 * left/middle/right shape a record card needs.
 */
export function IdentityStrip({
  palette,
  monogramSize,
  monogramLetter,
  name,
  detail,
  statLabel,
  statValue,
  qr,
  ringColor,
}: {
  palette: SharePalette;
  monogramSize: number;
  monogramLetter: string;
  name: string;
  detail: string;
  statLabel: string;
  statValue: string;
  qr?: ReactNode;
  ringColor?: string;
}) {
  const ring = ringColor ?? palette.accent;
  return (
    <View style={styles.identity}>
      <View style={{ width: monogramSize, height: monogramSize, alignItems: 'center', justifyContent: 'center' }}>
        {/* Glow ring: two circles, one blurred-looking halo, one crisp. */}
        <View
          style={{
            position: 'absolute',
            width: monogramSize,
            height: monogramSize,
            borderRadius: monogramSize / 2,
            borderWidth: Math.max(2, Math.round(monogramSize * 0.07)),
            borderColor: ring,
            opacity: 0.22,
            transform: [{ scale: 1.14 }],
          }}
        />
        <View
          style={{
            width: monogramSize,
            height: monogramSize,
            borderRadius: monogramSize / 2,
            borderWidth: Math.max(1, Math.round(monogramSize * 0.045)),
            borderColor: ring,
            backgroundColor: palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text allowFontScaling={false} style={[styles.monogram, { color: palette.text, fontSize: monogramSize * 0.46 }]}>
            {monogramLetter}
          </Text>
        </View>
      </View>
      <View style={styles.identityCopy}>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.identityName, { color: palette.text, fontSize: Math.max(9, Math.round(monogramSize * 0.42)) }]}>
          {name}
        </Text>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.identityDetail, { color: palette.muted, fontSize: Math.max(8, Math.round(monogramSize * 0.3)) }]}>
          {monogramSize >= 30 ? detail : detail.replace(/^measured /, '')}
        </Text>
      </View>
      <View style={styles.identityStat}>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.identityDetail, { color: palette.muted, fontSize: Math.max(7, Math.round(monogramSize * 0.28)), letterSpacing: 0.6 }]}>
          {statLabel.toUpperCase()}
        </Text>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.identityValue, { color: palette.text, fontSize: Math.max(9, Math.round(monogramSize * 0.42)) }]}>
          {statValue}
        </Text>
      </View>
      {qr}
    </View>
  );
}

/**
 * Engraved centre marks. Drawn in the medal's dark metal shade rather than a
 * glyph palette, so they read as struck into the disc instead of printed on it.
 */
export function EngravedCheck({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 12.5l5.2 5.2L20 6.8" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** A balance scale: the app's "calibrated" mark. */
export function EngravedScales({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5v17M6.5 20.5h11M4.5 7h15" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M7.5 7l-3.2 5.4a3.2 3.2 0 0 0 6.4 0L7.5 7zM16.5 7l-3.2 5.4a3.2 3.2 0 0 0 6.4 0L16.5 7z" fill={color} />
    </Svg>
  );
}

/** Lanyard + medal + arcs as one unit, so templates can place it in one go. */
export function MedalAssembly({
  medalSize,
  strapHeight,
  tone,
  title,
  subtitle,
  palette,
  children,
}: {
  medalSize: number;
  strapHeight: number;
  tone: MedalTone;
  title: string;
  subtitle?: string;
  palette: SharePalette;
  children?: ReactNode;
}) {
  const arcSize = medalSize * 1.5;
  return (
    <View style={{ alignItems: 'center' }}>
      <Lanyard width={medalSize} height={strapHeight} cx={medalSize / 2} palette={palette} strap={palette.mode === 'dark' ? '#0F1A16' : '#2A3A32'} />
      <View style={{ width: medalSize, height: medalSize, marginTop: -1 }}>
        {/* The dashed arcs deliberately spill past the medal (that is the look),
            so they carry the *spill* marker rather than the `sharecard-decor`
            one: `decor` is the full-canvas background box the share lab checks
            for coverage, and this box is the opposite — decoration that is
            supposed to bleed. The lab skips `spill` content when measuring fit
            and never mistakes it for a squashed gradient layer. */}
        <View
          nativeID="sharecard-spill-medal-arcs"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', left: -(arcSize - medalSize) / 2, top: -(arcSize - medalSize) / 2, width: arcSize, height: arcSize }]}
        >
          <GlowArcs width={arcSize} height={arcSize} cx={arcSize / 2} cy={arcSize / 2} radius={medalSize * 0.56} color={palette.accent} />
        </View>
        <Medal size={medalSize} tone={tone} title={title} subtitle={subtitle} palette={palette} />
        {/* The engraved centre glyph. Overlaid rather than passed into `Medal`
            because it is real app art (the streak flame), not SVG primitives. */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase' },
  chromeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chromeRight: { alignItems: 'flex-end', justifyContent: 'center' },
  wordmark: { fontFamily: Fonts.rounded, fontWeight: '800', letterSpacing: -0.3 },
  eyebrow: { fontFamily: Fonts.mono, fontWeight: '700', textAlign: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identityCopy: { flex: 1, flexShrink: 1 },
  identityName: { fontFamily: Fonts.rounded, fontWeight: '800' },
  identityDetail: { fontFamily: Fonts.mono },
  identityStat: { alignItems: 'flex-end', flexShrink: 0 },
  identityValue: { fontFamily: Fonts.rounded, fontWeight: '800' },
  monogram: { fontFamily: Fonts.rounded, fontWeight: '800' },
});
