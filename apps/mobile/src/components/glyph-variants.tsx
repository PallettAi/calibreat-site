import { useId, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect } from 'react-native-svg';

import {
  ACTIVE_FIRE,
  ACTIVE_WATER,
  FIRE_VARIANTS,
  WATER_VARIANTS,
  findVariant,
  type GlyphShape,
  type GlyphToken,
  type GlyphVariant,
} from '@/components/glyph-data';

/** Concrete colours the named tokens resolve to for one draw. */
type GlyphPalette = {
  color: string;
  soft: string;
  inner: string;
  white: string;
  line: string;
};

function tokenColor(token: GlyphToken, p: GlyphPalette): string {
  return p[token];
}

/** Water surface y for a reservoir, given 0…1 intake. */
export function levelY(variant: GlyphVariant, pct: number): number {
  const r = variant.reservoir ?? { top: 0, bottom: variant.viewBox.h };
  const clamped = Math.max(0, Math.min(1, pct));
  return r.bottom - (r.bottom - r.top) * clamped;
}

function renderShape(
  shape: GlyphShape,
  palette: GlyphPalette,
  variant: GlyphVariant,
  pct: number,
  clipId: string | null,
  key: number,
): ReactNode {
  switch (shape.t) {
    case 'path':
      return (
        <Path
          key={key}
          d={shape.d}
          fill={shape.fill ? tokenColor(shape.fill, palette) : 'none'}
          stroke={shape.stroke ? tokenColor(shape.stroke, palette) : 'none'}
          strokeWidth={shape.sw}
          strokeLinecap={shape.cap ?? 'round'}
          strokeLinejoin={shape.join ?? 'round'}
          opacity={shape.opacity}
        />
      );
    case 'line':
      return (
        <Line
          key={key}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={tokenColor(shape.stroke, palette)}
          strokeWidth={shape.sw}
          strokeLinecap={shape.cap ?? 'round'}
          opacity={shape.opacity}
        />
      );
    case 'circle':
      return (
        <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill={tokenColor(shape.fill, palette)} opacity={shape.opacity} />
      );
    case 'rise': {
      const r = variant.reservoir ?? { top: 0, bottom: variant.viewBox.h };
      const y = r.top + (r.bottom - r.top) * (1 - Math.max(0, Math.min(1, pct)));
      return (
        <Rect
          key={key}
          x={0}
          y={y}
          width={variant.viewBox.w}
          height={variant.viewBox.h}
          fill={tokenColor(shape.fill, palette)}
          opacity={shape.opacity}
          clipPath={clipId ? `url(#${clipId})` : undefined}
        />
      );
    }
    case 'level': {
      const y = levelY(variant, pct);
      return (
        <Line
          key={key}
          x1={shape.x1}
          y1={y}
          x2={shape.x2}
          y2={y}
          stroke={tokenColor(shape.stroke, palette)}
          strokeWidth={shape.sw}
          strokeLinecap="round"
          opacity={shape.opacity}
          clipPath={shape.clip && clipId ? `url(#${clipId})` : undefined}
        />
      );
    }
    case 'levelDot':
      return (
        <Circle
          key={key}
          cx={shape.x}
          cy={levelY(variant, pct)}
          r={shape.r}
          fill={tokenColor(shape.fill, palette)}
          opacity={shape.opacity}
        />
      );
  }
}

function GlyphSvg({
  variant,
  palette,
  pct,
  size,
}: {
  variant: GlyphVariant;
  palette: GlyphPalette;
  pct: number;
  size: number;
}) {
  const rawId = useId();
  const clipId = variant.clip ? `glyph-${rawId.replace(/[^A-Za-z0-9_-]/g, '')}` : null;
  const { w, h } = variant.viewBox;
  return (
    <Svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`}>
      {variant.clip && clipId ? (
        <Defs>
          <ClipPath id={clipId}>
            <Path d={variant.clip} />
          </ClipPath>
        </Defs>
      ) : null}
      {variant.shapes.map((shape, index) => renderShape(shape, palette, variant, pct, clipId, index))}
    </Svg>
  );
}

/** Streak flame. `variant` picks the art; `live` warms the inner tones. */
export function FireGlyph({
  variant = ACTIVE_FIRE,
  live,
  color,
  size = 22,
  inner,
  soft,
}: {
  variant?: string;
  live: boolean;
  color: string;
  size?: number;
  inner?: string;
  soft?: string;
}) {
  const palette: GlyphPalette = {
    color,
    soft: soft ?? (live ? '#FB923C' : color),
    inner: inner ?? (live ? '#FDE68A' : '#FDBA74'),
    white: '#FFFFFF',
    line: color,
  };
  // Only water variants carry a reservoir, so the percentage never applies here.
  return <GlyphSvg variant={findVariant(FIRE_VARIANTS, variant)} palette={palette} pct={live ? 1 : 0} size={size} />;
}

/** Water mark. `fill` is the day's intake as 0…1 and drives the rising fill. */
export function WaterGlyph({
  variant = ACTIVE_WATER,
  fill,
  color,
  size = 22,
  inner,
  soft,
}: {
  variant?: string;
  fill: number;
  color: string;
  size?: number;
  inner?: string;
  soft?: string;
}) {
  const palette: GlyphPalette = {
    color,
    soft: soft ?? color,
    inner: inner ?? '#FFFFFF',
    white: inner ?? '#FFFFFF',
    line: color,
  };
  return <GlyphSvg variant={findVariant(WATER_VARIANTS, variant)} palette={palette} pct={fill} size={size} />;
}
