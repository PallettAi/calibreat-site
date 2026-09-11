/**
 * Fire + water glyph review sheet (npm run gallery:glyphs).
 *
 * Renders the same variant records the app draws into brand/glyph-gallery.html,
 * so what you approve here is exactly what ships. Regenerate after editing
 * glyph-data.ts — the file is generated, never hand-edited.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ACTIVE_FIRE, ACTIVE_WATER, FIRE_VARIANTS, WATER_VARIANTS } from '../src/components/glyph-data.ts';

const OUT = fileURLToPath(new URL('../../../brand/glyph-gallery.html', import.meta.url));

// Mirrors home.tsx: the flame warms up on a live run, the drop reads as sky blue
// on dark and deeper blue on light.
const THEMES = {
  dark: {
    page: '#0A1019',
    card: '#131F2E',
    line: 'rgba(255,255,255,0.09)',
    text: '#EEF2F5',
    dim: '#7D8A96',
    fire: { color: '#EA580C', dim: '#9A3412', soft: '#FB923C', inner: '#FDE68A', innerDim: '#FDBA74' },
    water: '#38BDF8',
  },
  light: {
    page: '#F6F7F4',
    card: '#FFFFFF',
    line: 'rgba(13,21,30,0.09)',
    text: '#101820',
    dim: '#67727C',
    fire: { color: '#EA580C', dim: '#9A3412', soft: '#FB923C', inner: '#FDE68A', innerDim: '#FDBA74' },
    water: '#0284C7',
  },
};

function levelY(variant, pct) {
  const r = variant.reservoir ?? { top: 0, bottom: variant.viewBox.h };
  const c = Math.max(0, Math.min(1, pct));
  return r.bottom - (r.bottom - r.top) * c;
}

function shapeSvg(shape, pal, variant, pct, clipId) {
  const c = (token) => (token === 'white' ? '#FFFFFF' : token === 'line' ? pal.color : (pal[token] ?? pal.color));
  const cap = shape.cap ?? 'round';
  switch (shape.t) {
    case 'path':
      return `<path d="${shape.d}" fill="${shape.fill ? c(shape.fill) : 'none'}" stroke="${
        shape.stroke ? c(shape.stroke) : 'none'
      }"${shape.sw ? ` stroke-width="${shape.sw}"` : ''} stroke-linecap="${cap}" stroke-linejoin="${
        shape.join ?? 'round'
      }"${shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : ''}/>`;
    case 'line':
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${c(
        shape.stroke,
      )}" stroke-width="${shape.sw}" stroke-linecap="${cap}"${
        shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : ''
      }/>`;
    case 'circle':
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${c(shape.fill)}"${
        shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : ''
      }/>`;
    case 'rise': {
      const r = variant.reservoir ?? { top: 0, bottom: variant.viewBox.h };
      const y = r.top + (r.bottom - r.top) * (1 - Math.max(0, Math.min(1, pct)));
      return `<rect x="0" y="${y}" width="${variant.viewBox.w}" height="${variant.viewBox.h}" fill="${c(shape.fill)}"${
        shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : ''
      } clip-path="url(#${clipId})"/>`;
    }
    case 'level':
      return `<line x1="${shape.x1}" y1="${levelY(variant, pct)}" x2="${shape.x2}" y2="${levelY(
        variant,
        pct,
      )}" stroke="${c(shape.stroke)}" stroke-width="${shape.sw}" stroke-linecap="round"${
        shape.clip ? ` clip-path="url(#${clipId})"` : ''
      }/>`;
    case 'levelDot':
      return `<circle cx="${shape.x}" cy="${levelY(variant, pct)}" r="${shape.r}" fill="${c(shape.fill)}"/>`;
    default:
      return '';
  }
}

let uid = 0;
function glyphSvg(variant, pal, pct, size) {
  const { w, h } = variant.viewBox;
  const clipId = `clip-${variant.id}-${(uid += 1)}`;
  const defs = variant.clip ? `<defs><clipPath id="${clipId}"><path d="${variant.clip}"/></clipPath></defs>` : '';
  const body = variant.shapes.map((s) => shapeSvg(s, pal, variant, pct, clipId)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${size}" height="${(size * h) / w}">${defs}${body}</svg>`;
}

function paletteFor(family, theme, live) {
  if (family === 'fire') {
    const color = live ? theme.fire.color : theme.fire.dim;
    return { color, soft: live ? theme.fire.soft : color, inner: live ? theme.fire.inner : theme.fire.innerDim };
  }
  return { color: theme.water, soft: theme.water, inner: '#FFFFFF' };
}

/** The 38 px header button from header-glyphs.tsx. */
function buttonMock(family, variant, themeName, pctOrLive, opts = {}) {
  const theme = THEMES[themeName];
  const live = family === 'fire' ? pctOrLive === true : false;
  const color = family === 'fire' ? (live ? theme.fire.color : theme.fire.dim) : theme.water;
  const svg = glyphSvg(variant, paletteFor(family, theme, live), family === 'fire' ? (live ? 1 : 0) : pctOrLive, 22);
  const badge = opts.count ? `<span class="badge" style="background:${color};border-color:${color}">${opts.count}</span>` : '';
  return `<div class="btnwrap"><div class="btn" style="background:${
    themeName === 'dark' ? theme.card : '#FFFFFF'
  };border-color:${theme.line}">${svg}${badge}</div>${
    opts.caption ? `<span class="mockcap" style="color:${theme.dim}">${opts.caption}</span>` : ''
  }</div>`;
}

function detailMock(family, variant, themeName, pctOrLive, size) {
  const theme = THEMES[themeName];
  const live = family === 'fire' ? pctOrLive === true : false;
  return `<div class="detail ${themeName}">${glyphSvg(
    variant,
    paletteFor(family, theme, live),
    family === 'fire' ? (live ? 1 : 0) : pctOrLive,
    size,
  )}</div>`;
}

function card(family, variant, theme) {
  const active = family === 'fire' ? variant.id === ACTIVE_FIRE : variant.id === ACTIVE_WATER;
  const fills = [0, 0.25, 0.5, 0.75, 1];
  const states =
    family === 'fire'
      ? [
          buttonMock('fire', variant, 'dark', true, { caption: 'live' }),
          buttonMock('fire', variant, 'dark', false, { caption: 'needs claim' }),
          buttonMock('fire', variant, 'dark', false, { caption: '+ count', count: 5 }),
          buttonMock('fire', variant, 'light', true, { caption: 'light · live' }),
        ]
      : [
          ...fills.map((p) => buttonMock('water', variant, 'dark', p, { caption: `${Math.round(p * 100)}%` })),
          buttonMock('water', variant, 'light', 1, { caption: 'light · full' }),
        ];

  return `<article class="card${active ? ' active' : ''}">
    <header class="cardhead">
      <span class="idchip">${variant.id}</span>
      <h3>${variant.name}</h3>
      ${active ? '<span class="pill">ACTIVE</span>' : ''}
    </header>
    <p class="note">${variant.note}</p>
    <div class="mockrow">${states.join('')}</div>
    <div class="detailrow">
      ${detailMock(family, variant, 'dark', family === 'fire' ? true : 0.6, 88)}
      ${detailMock(family, variant, 'dark', family === 'fire' ? false : 1, 88)}
      ${detailMock(family, variant, 'light', family === 'fire' ? true : 0.6, 88)}
    </div>
  </article>`;
}

function row(family, variants, themeName, pctOrLive, caption) {
  const mock = variants
    .map((v) => buttonMock(family, v, themeName, pctOrLive, { caption: v.id, count: family === 'fire' && !pctOrLive ? 4 : undefined }))
    .join('');
  return `<div class="sheet">
    <div class="sheetlabel"><b>${caption}</b><span>${themeName} surface · real 38 px button</span></div>
    <div class="mockrow">${mock}</div>
  </div>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>calibrEAT — fire &amp; water glyphs</title>
<style>
  :root {
    --page: #0A1019; --card: #131F2E; --line: rgba(255,255,255,.09);
    --text: #EEF2F5; --dim: #A7B2BC; --green: #1F9D55; --lime: #B7E93C;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--page); color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 44px 22px 80px; }
  .kicker { font-size: 12px; font-weight: 800; letter-spacing: 2.4px; text-transform: uppercase; color: var(--lime); }
  h1 { font-size: 30px; letter-spacing: -.8px; margin: 10px 0 8px; }
  .sub { color: var(--dim); font-size: 15px; line-height: 1.6; max-width: 720px; margin: 0 0 8px; }
  .sub code, .note code { background: rgba(183,233,60,.14); border-radius: 4px; padding: 1px 5px; font-size: 12.5px; color: var(--lime); }
  .switches { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 10px; }
  .togglepill { font-size: 12px; font-weight: 700; border: 1px solid var(--line); border-radius: 999px;
    padding: 6px 12px; color: var(--dim); }
  .togglepill b { color: var(--lime); }
  h2 { font-size: 22px; letter-spacing: -.4px; margin: 44px 0 6px; }
  h2 .num { color: var(--green); font-weight: 800; margin-right: 8px; }
  .blurb { color: var(--dim); font-size: 14px; line-height: 1.6; max-width: 780px; margin: 0 0 18px; }
  .sheet { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px; margin-bottom: 14px; }
  .sheetlabel { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .sheetlabel b { font-size: 13px; letter-spacing: .4px; }
  .sheetlabel span { font-size: 12px; color: var(--dim); }
  .mockrow { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .btnwrap { display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .btn { position: relative; width: 38px; height: 38px; border: 1px solid var(--line); border-radius: 10px;
    display: flex; align-items: center; justify-content: center; }
  .mockcap { font-size: 10px; letter-spacing: .3px; }
  .badge { position: absolute; right: -7px; bottom: -4px; min-width: 14px; height: 14px; padding: 0 3px;
    border: 1px solid; border-radius: 7px; color: #FFF7ED; font-size: 8px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
  .card.active { border-color: rgba(183,233,60,.45); box-shadow: 0 0 0 1px rgba(183,233,60,.16); }
  .cardhead { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .cardhead h3 { font-size: 17px; margin: 0; letter-spacing: -.3px; }
  .idchip { font-size: 11px; font-weight: 800; letter-spacing: .8px; color: var(--lime); border: 1px solid var(--line);
    border-radius: 6px; padding: 2px 6px; }
  .pill { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: #0A1019; background: var(--lime);
    border-radius: 999px; padding: 3px 8px; }
  .note { color: var(--dim); font-size: 13px; line-height: 1.55; margin: 8px 0 16px; }
  .detailrow { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .detail { flex: 1 1 auto; min-width: 104px; display: flex; align-items: center; justify-content: center;
    border-radius: 14px; padding: 12px 8px; }
  .detail.dark { background: #0B1220; border: 1px solid rgba(255,255,255,.06); }
  .detail.light { background: #FFFFFF; border: 1px solid rgba(13,21,30,.09); }
  .foot { color: var(--dim); font-size: 13px; line-height: 1.7; margin-top: 40px; border-top: 1px solid var(--line); padding-top: 18px; }
  .foot b { color: var(--text); }
</style>
</head>
<body>
<div class="wrap">
  <div class="kicker">calibrEAT · home header</div>
  <h1>Fire &amp; water glyphs</h1>
  <p class="sub">
    Five flames and five drops, all on a 24 × 24 grid and drawn at 22 px inside the home header's 38 px
    button. Every water variant keeps the behaviour that matters: the fill rises with the day's intake.
    This page is generated from the app's own variant data — <code>npm run gallery:glyphs</code>.
  </p>
  <div class="switches">
    <span class="togglepill">ACTIVE_FIRE = <b>${ACTIVE_FIRE}</b></span>
    <span class="togglepill">ACTIVE_WATER = <b>${ACTIVE_WATER}</b></span>
    <span class="togglepill">switch in <b>src/components/glyph-data.ts</b></span>
  </div>

  <h2><span class="num">01</span>Contact sheet</h2>
  <p class="blurb">
    The whole set as it actually appears in the header, at real size. This is the view to choose from —
    if a mark isn't distinguishable here, it isn't distinguishable in the app.
  </p>
  ${row('fire', FIRE_VARIANTS, 'dark', true, 'Flames — live streak')}
  ${row('fire', FIRE_VARIANTS, 'dark', false, 'Flames — run needs a claim (count badge folded in)')}
  ${row('water', WATER_VARIANTS, 'dark', 1, 'Drops — full intake')}
  ${row('water', WATER_VARIANTS, 'dark', 0.35, 'Drops — 35% of goal')}
  ${row('fire', FIRE_VARIANTS, 'light', true, 'Flames — light surface')}
  ${row('water', WATER_VARIANTS, 'light', 1, 'Drops — light surface')}

  <h2><span class="num">02</span>Flames</h2>
  <p class="blurb">
    Live is the warm orange with a lit core; when a claim is due the flame goes deep ember and the count
    badge appears, so the badge is never competing with a full-strength flame.
  </p>
  <div class="cards">${FIRE_VARIANTS.map((v) => card('fire', v, THEMES)).join('')}</div>

  <h2><span class="num">03</span>Drops</h2>
  <p class="blurb">
    Each drop is shown across the intake ramp, because the fill is the readout: at 0% the mark should still
    look like water, and at 100% it should look finished rather than spilling.
  </p>
  <div class="cards">${WATER_VARIANTS.map((v) => card('water', v, THEMES)).join('')}</div>

  <p class="foot">
    Generated from <b>apps/mobile/src/components/glyph-data.ts</b> by
    <b>apps/mobile/scripts/glyph-gallery.mjs</b>. Geometry is checked by
    <b>npm run check:glyphs</b>. Colours come from the live header call site in <b>app/home.tsx</b>:
    flame <b>#EA580C</b> live / <b>#9A3412</b> due, drop <b>#38BDF8</b> dark / <b>#0284C7</b> light.
  </p>
</div>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${FIRE_VARIANTS.length} flames, ${WATER_VARIANTS.length} drops)`);
