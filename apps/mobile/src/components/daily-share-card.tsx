/**
 * The daily recap card — "yesterday, calibrated" — captured and shared the
 * same way as the weekly card (off-screen at base size, PNG at 3×).
 *
 * The composition is the app's thesis drawn once: a budget bar that IS the
 * equation (the goal is the whole track; food is the filled span), the
 * remaining figure as the display numeral, the equation spelled out in a
 * leader-dot table, and the same QR footer as the weekly card so the loop
 * works wherever the image lands.
 *
 * It deliberately re-uses only the *exported* maths from lib/share-templates
 * (shareLayout, splitBudget, specklePaths) and the QR module from lib/share-qr,
 * and owns its own palette + mesh so the weekly templates and the redesign of
 * them can move without breaking this card. Copy comes from lib/share-daily.
 */

import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { dailyTagline, type DailyCard } from '@/lib/share-daily';
import { shareQrMatrix } from '@/lib/share-qr';
import {
  SHARE_DECOR_LAYER_STYLE,
  displayTracking,
  shareCardSize,
  shareLayout,
  specklePaths,
  type ShareFormatId,
} from '@/lib/share-templates';

/** The QR pattern is constant, so compute it once per process. */
const QR_MATRIX = shareQrMatrix();
const QR_MODULES = QR_MATRIX.length;
const QR_PATH = (() => {
  const parts: string[] = [];
  QR_MATRIX.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) parts.push(`M${c} ${r}h1v1h-1z`);
    });
  });
  return parts.join('');
})();

/**
 * The daily card's look: the Instrument lane (near-black, one loud accent) so
 * the daily and weekly cards read as the same app, but with a slightly warmer
 * bloom so the two are distinguishable in a feed at a glance.
 */
const DAILY_PALETTE = {
  mode: 'dark',
  background: '#0A0F17',
  deep: '#04070C',
  glow: '#123A2A',
  text: '#EEF3F7',
  muted: '#A8B4BF',
  accent: '#B7E93C',
  ink2: '#5AD9C6',
  hairline: 'rgba(255,255,255,0.13)',
  speckle: 'rgba(255,255,255,0.055)',
} as const;

export type DailyShareCardProps = {
  card: DailyCard;
  format: ShareFormatId;
};

/** Mesh gradient — the same surface treatment as the weekly card. */
function Mesh({ width, height, uid }: { width: number; height: number; uid: string }) {
  const bloom = Math.max(width, height);
  return (
    <Svg width={width} height={height} style={SHARE_DECOR_LAYER_STYLE}>
      <Defs>
        <RadialGradient id={`${uid}-glow`} cx={width * 0.88} cy={height * 0.02} r={bloom * 0.9}>
          <Stop offset="0" stopColor={DAILY_PALETTE.glow} stopOpacity={0.85} />
          <Stop offset="0.55" stopColor={DAILY_PALETTE.glow} stopOpacity={0.26} />
          <Stop offset="1" stopColor={DAILY_PALETTE.glow} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${uid}-fall`} x1="0" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor={DAILY_PALETTE.deep} stopOpacity={0.5} />
          <Stop offset="0.5" stopColor={DAILY_PALETTE.deep} stopOpacity={0.06} />
          <Stop offset="1" stopColor={DAILY_PALETTE.deep} stopOpacity={0.72} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-glow)`} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-fall)`} />
    </Svg>
  );
}

/** Film grain, three batched paths — same as the weekly card's treatment. */
function Grain({ width, height, seed }: { width: number; height: number; seed: number }) {
  const layers = specklePaths({ width, height, count: Math.round(width * height * 0.0016), seed });
  return (
    <Svg width={width} height={height} style={SHARE_DECOR_LAYER_STYLE}>
      {layers.map((layer, i) => (
        <Path key={i} d={layer.d} fill={DAILY_PALETTE.speckle} opacity={layer.alpha} />
      ))}
    </Svg>
  );
}

function Kicker({ label, size, rule }: { label: string; size: number; rule?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Math.max(5, Math.round(size * 0.6)) }}>
      {rule ? <View style={{ width: Math.max(10, Math.round(size * 1.6)), height: Math.max(1, Math.round(size * 0.14)), backgroundColor: DAILY_PALETTE.accent }} /> : null}
      <Text numberOfLines={1} allowFontScaling={false} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase', fontSize: size, letterSpacing: size * 0.18 }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The budget bar that IS the equation: the full track is the goal, the filled
 * span is food, and the marker sits at the day's edge. One glance answers "how
 * full was the day". Training is deliberately not on this track — it is
 * already inside the goal, so drawing it as extra track would overstate the
 * day's room by exactly the size of the mistake this app doesn't make.
 */
function BudgetBar({ fill, height }: { fill: number; height: number }) {
  return (
    <View style={{ height, borderRadius: Math.max(1, Math.round(height / 2)), backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' }} accessibilityLabel={`Day filled to ${Math.round(fill * 100)} percent`}>
      <View style={{ width: `${Math.max(2, Math.round(fill * 100))}%`, height, borderRadius: Math.max(1, Math.round(height / 2)), backgroundColor: DAILY_PALETTE.accent }} />
    </View>
  );
}

/** `goal ········ 2,100` — leader dots, the weekly card's table language. */
function EquationTable({ card, height, width, font }: { card: DailyCard; height: number; width: number; font: number }) {
  const rowH = Math.floor((height - 2) / Math.max(1, card.equation.length));
  const dots = '·'.repeat(Math.max(3, Math.round(width / (font * 0.42))));
  return (
    <View style={{ height, borderWidth: StyleSheet.hairlineWidth, borderColor: DAILY_PALETTE.hairline, borderRadius: Math.max(4, Math.round(width * 0.03)), overflow: 'hidden' }}>
      {card.equation.map((row, i) => (
        <View
          key={row.label}
          style={[
            { height: rowH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Math.max(7, Math.round(font * 0.8)), gap: 4 },
            i < card.equation.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DAILY_PALETTE.hairline } : null,
          ]}
        >
          <Text numberOfLines={1} allowFontScaling={false} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontSize: font }}>
            {row.label}
          </Text>
          <Text numberOfLines={1} allowFontScaling={false} style={{ color: DAILY_PALETTE.hairline, fontFamily: Fonts.mono, fontSize: font, flex: 1, overflow: 'hidden', marginHorizontal: 4 }}>
            {dots}
          </Text>
          <Text numberOfLines={1} allowFontScaling={false} style={{ color: row.muted ? DAILY_PALETTE.muted : row.signed ? DAILY_PALETTE.ink2 : DAILY_PALETTE.accent, fontFamily: Fonts.mono, fontSize: font * 1.05, fontWeight: '700' }}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DailyShareCard({ card, format }: DailyShareCardProps) {
  const size = shareCardSize(format);
  const lay = shareLayout(size, { heroChars: card.hero.value.length });
  const uid = `daily-${lay.baseWidth}x${lay.baseHeight}`;
  const wide = lay.railFooter;

  const decor = (
    <View
      nativeID={`sharecard-decor-daily-${format}`}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', pointerEvents: 'none' }]}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Mesh width={size.baseWidth} height={size.baseHeight} uid={uid} />
      <Grain width={size.baseWidth} height={size.baseHeight} seed={5505} />
    </View>
  );

  const header = (
    <View style={{ height: lay.headerH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text allowFontScaling={false} style={{ color: DAILY_PALETTE.text, fontFamily: Fonts.rounded, fontWeight: '800', fontSize: lay.headerFont, letterSpacing: displayTracking(lay.headerFont) }}>
        calibr<Text style={{ color: DAILY_PALETTE.accent }}>EAT</Text>
      </Text>
      <Text numberOfLines={1} allowFontScaling={false} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase', fontSize: Math.max(7, lay.kicker - 1), letterSpacing: Math.max(7, lay.kicker - 1) * 0.16 }}>
        {card.copy.kicker}
      </Text>
    </View>
  );

  const footerDomain = dailyTagline().split('—')[1]?.trim() ?? 'calibreat.co.uk';
  const footer = wide ? null : (
    <View style={{ height: lay.footerH, justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text allowFontScaling={false} numberOfLines={1} style={{ color: DAILY_PALETTE.text, fontFamily: Fonts.mono, fontWeight: '700', fontSize: Math.max(9, Math.round(lay.body * 1.05)), letterSpacing: lay.body * 0.06 }}>
          {footerDomain}
        </Text>
        <Text allowFontScaling={false} numberOfLines={2} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.rounded, fontSize: Math.max(8, Math.round(lay.body * 0.8)), lineHeight: Math.max(11, Math.round(lay.body * 1.15)) }}>
          Calibrate your eating lifestyle.
        </Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: lay.qrSize, height: lay.qrSize, padding: Math.max(2, Math.round(lay.qrSize * 0.08)), borderRadius: Math.round(lay.qrSize * 0.16), backgroundColor: '#FFFFFF' }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${QR_MODULES} ${QR_MODULES}`}>
            <Path d={QR_PATH} fill="#05080C" />
          </Svg>
        </View>
        {lay.qrCaption ? (
          <Text allowFontScaling={false} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase', fontSize: Math.max(8, Math.round(lay.qrSize * 0.14)), letterSpacing: lay.qrSize * 0.02, marginTop: Math.max(3, Math.round(lay.qrSize * 0.08)) }}>
            SCAN ME
          </Text>
        ) : null}
      </View>
    </View>
  );

  // The wide card puts the QR in a rail beside the content, same as the weekly
  // card — the short 1.9:1 shape has no footer band to spend.
  const railQr = wide ? (
    <View style={{ width: lay.qrSize, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
      <View style={{ width: lay.qrSize, height: lay.qrSize, padding: Math.max(2, Math.round(lay.qrSize * 0.08)), borderRadius: Math.round(lay.qrSize * 0.16), backgroundColor: '#FFFFFF' }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${QR_MODULES} ${QR_MODULES}`}>
          <Path d={QR_PATH} fill="#05080C" />
        </Svg>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontWeight: '700', fontSize: Math.min(lay.kicker, lay.qrSize / 8), marginTop: Math.max(4, Math.round(lay.gap * 0.6)) }}>
        {footerDomain}
      </Text>
    </View>
  ) : null;

  const numFont = Math.min(lay.hero * 1.1, Math.round(lay.hero));
  const [kickerH, barH, numH, tableH, noteH] = lay.railFooter
    ? splitMain(lay.mainH, [8, 6, 46, 30, 10])
    : splitMain(lay.mainH, [8, 6, 34, 34, 18]);
  const tableFont = Math.min(lay.body * 1.1, Math.max(9, Math.floor(tableH / Math.max(1, card.equation.length) - 4)));
  const noteFont = Math.min(lay.body, Math.max(8, Math.floor(noteH / 2)));

  return (
    <View
      nativeID={`sharecard-daily-${format}`}
      style={[
        styles.card,
        {
          width: size.baseWidth,
          height: size.baseHeight,
          backgroundColor: DAILY_PALETTE.background,
          paddingTop: size.safeTop + lay.pad,
          paddingBottom: size.safeBottom + lay.pad,
          paddingHorizontal: lay.pad,
          gap: lay.gap,
        },
      ]}
    >
      {decor}
      {header}
      <View
        style={{
          height: lay.mainH,
          overflow: 'hidden',
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
          gap: wide ? Math.round(lay.gap * 2) : 0,
        }}
      >
        <View style={{ flex: 1, justifyContent: 'center', gap: Math.max(3, Math.round(lay.gap * 0.4)) }}>
          <View style={{ height: wide ? undefined : kickerH, justifyContent: 'center' }}>
            <Kicker label={card.copy.line} size={lay.kicker} rule />
          </View>
          <View style={{ height: wide ? undefined : barH, justifyContent: 'center' }}>
            <BudgetBar fill={card.fill} height={Math.max(5, Math.round((wide ? 8 : barH) * 0.5))} />
          </View>
          <View style={{ height: wide ? undefined : numH, justifyContent: 'flex-end' }}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: DAILY_PALETTE.accent, fontFamily: Fonts.rounded, fontWeight: '800', fontSize: numFont, lineHeight: numFont * 0.98, letterSpacing: displayTracking(numFont) }}
            >
              {card.hero.value}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.mono, fontWeight: '700', textTransform: 'uppercase', fontSize: Math.max(8, lay.kicker), letterSpacing: Math.max(8, lay.kicker) * 0.14, marginTop: 2 }}>
              {card.hero.label}
            </Text>
          </View>
          <View style={{ height: wide ? undefined : tableH, justifyContent: 'center' }}>
            <EquationTable card={card} height={wide ? Math.min(120, Math.round(lay.mainH * 0.8)) : tableH} width={wide ? Math.round((lay.mainW - lay.qrSize - lay.gap * 2) * 0.62) : lay.mainW} font={tableFont} />
          </View>
          <View style={{ height: wide ? undefined : noteH, justifyContent: 'center' }}>
            <Text numberOfLines={2} allowFontScaling={false} style={{ color: DAILY_PALETTE.muted, fontFamily: Fonts.rounded, fontSize: noteFont, lineHeight: noteFont * 1.35 }}>
              {card.copy.note}
            </Text>
          </View>
        </View>
        {railQr}
      </View>
      {footer}
    </View>
  );
}

/** Integer budget split that always sums to the total (same rule as weekly). */
function splitMain(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const parts = weights.map((w) => Math.floor((w / sum) * total));
  let left = total - parts.reduce((a, b) => a + b, 0);
  let i = 0;
  while (left > 0) {
    parts[i % parts.length]! += 1;
    left -= 1;
    i += 1;
  }
  return parts;
}

/** Scaled-down visible copy, so the user sees exactly what they will post. */
export function DailyShareCardPreview({ maxWidth, card, format }: { maxWidth: number } & DailyShareCardProps) {
  const size = shareCardSize(format);
  const scale = Math.min(1, maxWidth / size.baseWidth);
  return (
    <View
      style={{ overflow: 'hidden', backgroundColor: '#070C12', alignSelf: 'center', width: size.baseWidth * scale, height: size.baseHeight * scale, borderRadius: Math.round(size.baseWidth * scale * 0.06) }}
      accessibilityLabel="Preview of the daily recap card"
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
        <DailyShareCard card={card} format={format} />
      </View>
    </View>
  );
}

/** Off-screen capture stage — same pattern as the weekly card's stage. */
export function DailyShareCardStage({ cardRef, card, format }: { cardRef: RefObject<View | null> } & DailyShareCardProps) {
  const size = shareCardSize(format);
  return (
    <View
      style={{ position: 'absolute', left: 0, top: 0, opacity: 0, width: size.baseWidth, height: size.baseHeight, pointerEvents: 'none' }}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View ref={cardRef} collapsable={false}>
        <DailyShareCard card={card} format={format} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
