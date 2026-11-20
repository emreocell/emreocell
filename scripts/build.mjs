#!/usr/bin/env node
// Offline, deterministic artwork. Refresh data with activity.mjs before building.
//
// The whole profile is ONE painted panel (a single virtual canvas with one grainy mesh
// gradient) that is delivered as a stack of seamless SVG slices. Most of it is a single image;
// it is only cut where something has to be clickable: each merged PR button and each contact
// button is its own slice wrapped in a native link, so the interactive area is exactly that
// button. Every slice paints the same canvas, so the cuts are invisible.
//
// Text is measured with real Manrope advances (assets/fonts/manrope-metrics.json), so wrapping
// and the company wordmark placement are exact without a browser.
import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateActivity } from './activity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const config = JSON.parse(read('profile.config.json'));
const bio = config.bio.join(' ');
const nameBreak = config.name.indexOf(' ');
const nameLines = nameBreak < 0 ? [config.name, ''] : [config.name.slice(0, nameBreak), config.name.slice(nameBreak + 1)];
const activity = validateActivity(JSON.parse(read('data/activity.json')));
if (activity.login !== config.login) throw new Error('Activity and profile logins must match.');
const C = config.palette;
const fonts = {
  full: readFileSync(join(root, 'assets/fonts/manrope-latin.woff2')).toString('base64'), // weights 400-800
  panel: readFileSync(join(root, 'assets/fonts/manrope-panel.woff2')).toString('base64'), // ASCII, weights 500-650
};
const metrics = JSON.parse(read('assets/fonts/manrope-metrics.json'));
const escape = value => String(value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[ch]);
const tag = (name, attributes, content = null) => {
  const attrs = Object.entries(attributes).map(([key, value]) => ' ' + key + '="' + escape(value) + '"').join('');
  return '<' + name + attrs + (content === null ? '/>' : '>' + content + '</' + name + '>');
};
const group = (attrs, body) => tag('g', attrs, body);
const rect = attrs => tag('rect', attrs);
const path = attrs => tag('path', attrs);
const num = value => +value.toFixed(3);

/** Width of `value` in px for Manrope at `weight` (kerning off, so draw it with NOKERN). */
const measure = (value, size, weight = 500, tracking = 0) => {
  const table = metrics[String(weight)] || metrics['500'];
  return [...String(value)].reduce((sum, ch) => sum + (table[ch] ?? .58) * size + tracking, 0);
};
/** Greedy word wrap into lines no wider than `maxWidth`. */
const wrap = (value, size, weight, maxWidth) => {
  const lines = [];
  let current = '';
  for (const word of String(value).split(' ')) {
    const next = current ? current + ' ' + word : word;
    if (current && measure(next, size, weight) > maxWidth) { lines.push(current); current = word; } else current = next;
  }
  return current ? lines.concat(current) : lines;
};
const NOKERN = { style: 'font-kerning:none' };

const text = (x, y, value, size = 24, extra = {}) => tag('text', {
  x, y, fill: C.cloud, 'font-size': size, 'font-family': 'Manrope,Arial,sans-serif',
  ...extra,
}, escape(value));
const label = (x, y, value, size = 20, extra = {}) => text(x, y, value, size, {
  fill: C.muted, 'font-weight': 500, 'letter-spacing': 2, ...extra,
});
const line = (y, width, inset) => tag('line', {
  x1: inset, y1: y, x2: width - inset, y2: y, stroke: C.cloud, 'stroke-opacity': .16,
});
const formatDate = date => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(date)).toUpperCase();
const updated = formatDate(activity.updatedAt) + ' · ' + activity.updatedAt.slice(11, 16) + ' UTC';
const range = formatDate(activity.range.from) + ' — ' + formatDate(activity.range.to);
const count = new Intl.NumberFormat('en-US').format(activity.totalContributions);
const title = config.name + ' — ' + config.role + ' at ' + config.company;
const description = bio + ' Toolkit: ' + config.tools.map(t => t.name).join(', ')
  + '. ' + count + ' GitHub contributions in the last 365 days. Snapshot: ' + updated + '.';
const icons = config.tools.map(tool => {
  if (!/^[a-z0-9-]+$/.test(tool.slug)) throw new Error('Invalid icon slug.');
  const source = read('assets/icons/' + tool.slug + '.svg');
  const match = source.match(/<path d="([^"]+)"/);
  if (!match) throw new Error('Missing icon path: ' + tool.slug);
  return { ...tool, d: match[1] };
});
// The company wordmark (traced vector, assets/brand) replaces the company name in the role line.
const brandSource = read('assets/brand/' + config.companyLogo + '.svg');
const brand = {
  d: brandSource.match(/ d="([^"]+)"/)[1],
  box: brandSource.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1, 3).map(Number),
};
const wordmark = (x, baseline, height, fill = C.cloud) => {
  const scale = height / brand.box[1];
  return group({ transform: 'translate(' + x.toFixed(2) + ' ' + (baseline - height).toFixed(2) + ') scale(' + scale.toFixed(5) + ')',
    'aria-label': config.company }, path({ d: brand.d, 'fill-rule': 'evenodd', fill }));
};
const wordmarkWidth = height => height * brand.box[0] / brand.box[1];

// ---- Projects -------------------------------------------------------------------------------

const projects = config.openSource.map(entry => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository)
    || !entry.name || !Array.isArray(entry.prs) || entry.prs.length < 1
    || !entry.prs.every(n => Number.isInteger(n) && n > 0)) {
    throw new Error('Invalid open-source contribution in profile.config.json (at least one merged PR per project).');
  }
  if (!/^[a-z0-9-]+$/.test(entry.logo || '')) throw new Error('Missing or invalid logo for ' + entry.name + ' in profile.config.json.');
  return {
    ...entry, logoData: readFileSync(join(root, 'assets/logos/' + entry.logo + '.webp')).toString('base64'),
    slug: entry.repository.replace('/', '-').toLowerCase(),
    prs: entry.prs.map(number => ({ number, url: 'https://github.com/' + entry.repository + '/pull/' + number })),
  };
});
const prTotal = projects.reduce((sum, p) => sum + p.prs.length, 0);
const mergedSearchUrl = 'https://github.com/search?q='
  + encodeURIComponent('author:' + config.login + ' is:pr is:merged -user:' + config.login)
  + '&type=pullrequests';
const contacts = [
  { key: 'talk', label: 'Let’s talk', href: config.contact.email, primary: true },
  { key: 'linkedin', label: 'LinkedIn', href: config.contact.linkedin },
  { key: 'website', label: config.company, href: config.contact.website, logo: true },
];

// ---- Shared painting ------------------------------------------------------------------------

function defs(w, h, corners, fontData) {
  const stop = (offset, color, opacity = 1) => tag('stop', {
    offset, 'stop-color': color, 'stop-opacity': opacity,
  });
  const radial = (id, stops) => tag('radialGradient', { id }, stops);
  const R = 24, { tl = 0, tr = 0, bl = 0, br = 0 } = corners;
  const r = k => k ? R : 0;
  const clip = 'M0 ' + r(tl) + (tl ? 'A' + R + ' ' + R + ' 0 0 1 ' + R + ' 0' : '') + 'H' + num(w - r(tr))
    + (tr ? 'A' + R + ' ' + R + ' 0 0 1 ' + num(w) + ' ' + R : '') + 'V' + num(h - r(br))
    + (br ? 'A' + R + ' ' + R + ' 0 0 1 ' + num(w - R) + ' ' + num(h) : '') + 'H' + r(bl)
    + (bl ? 'A' + R + ' ' + R + ' 0 0 1 0 ' + num(h - R) : '') + 'Z';
  return tag('defs', {}, [
    fontData ? tag('style', {}, '@font-face{font-family:Manrope;src:url(data:font/woff2;base64,' + fontData
      + ') format("woff2");font-style:normal;font-weight:400 800;}text{font-kerning:normal;}') : '',
    radial('atmosphere', stop('0%', '#27435D', .65) + stop('55%', '#10283E', .35) + stop('100%', C.ink, 0)),
    radial('powder', stop('0%', '#CDE5F5') + stop('28%', '#9EC5E3', .92) + stop('62%', '#426C94', .68) + stop('100%', '#133756', 0)),
    radial('pearl', stop('0%', '#F4F6F7', .95) + stop('30%', '#D3E7F6', .85) + stop('70%', '#6D95B8', .38) + stop('100%', '#1D3B55', 0)),
    radial('blush', stop('0%', '#C6B7B9', .48) + stop('60%', '#74717E', .20) + stop('100%', C.ink, 0)),
    radial('bottom', stop('0%', '#426986', .35) + stop('65%', '#1F3F5B', .16) + stop('100%', C.ink, 0)),
    tag('linearGradient', { id: 'shade' }, stop('0%', C.ink) + stop('44%', C.ink, .86) + stop('72%', C.ink, .20) + stop('100%', C.ink, 0)),
    tag('linearGradient', { id: 'fade', x1: '0', y1: '0', x2: '0', y2: '1' },
      stop('0%', C.ink, 0) + stop('56%', C.ink, 0) + stop('100%', C.ink)),
    tag('filter', { id: 'blur', x: '-30%', y: '-30%', width: '160%', height: '160%', 'color-interpolation-filters': 'sRGB' },
      tag('feGaussianBlur', { stdDeviation: 24 })),
    tag('filter', { id: 'scrim', x: '-30%', y: '-120%', width: '160%', height: '340%', 'color-interpolation-filters': 'sRGB' },
      tag('feGaussianBlur', { stdDeviation: 20 })),
    tag('filter', { id: 'grain', x: '0%', y: '0%', width: '100%', height: '100%' }, [
      tag('feTurbulence', { type: 'fractalNoise', baseFrequency: '.44', numOctaves: 2, stitchTiles: 'stitch', seed: 17 }),
      tag('feColorMatrix', { type: 'saturate', values: 0 }),
      tag('feComponentTransfer', {}, tag('feFuncA', { type: 'linear', slope: .7 })),
    ].join('')),
    tag('clipPath', { id: 'canvas' }, path({ d: clip })),
    tag('clipPath', { id: 'tile', clipPathUnits: 'objectBoundingBox' }, rect({ width: 1, height: 1, rx: .24 })),
  ].join(''));
}

/** The grainy mesh gradient in the panel's virtual coordinates. */
const mesh = placement => group({ transform: placement }, [
  tag('ellipse', { cx: 870, cy: 300, rx: 610, ry: 430, fill: 'url(#atmosphere)' }),
  group({ filter: 'url(#blur)' }, [
    tag('ellipse', { cx: 1105, cy: 245, rx: 405, ry: 450, transform: 'rotate(36 1105 245)', fill: 'url(#powder)' }),
    tag('ellipse', { cx: 995, cy: 300, rx: 165, ry: 345, transform: 'rotate(43 995 300)', fill: 'url(#pearl)' }),
    tag('ellipse', { cx: 1240, cy: 70, rx: 350, ry: 210, fill: 'url(#blush)' }),
    tag('ellipse', { cx: 1080, cy: 600, rx: 410, ry: 150, transform: 'rotate(-28 1080 600)', fill: C.ink, opacity: .94 }),
    path({ d: 'M1040 -100C710 62 832 232 1033 306C1180 360 1330 288 1360 560L1550 560L1550 -100Z', fill: C.ink, opacity: .94 }),
    tag('ellipse', { cx: 860, cy: 490, rx: 175, ry: 100, fill: 'url(#powder)', opacity: .50 }),
  ].join('')),
].join(''));

/** One painting for the whole panel; each slice shows its own window of it. */
function painting(P, win) {
  const m = P.mobile;
  return [
    rect({ x: win.x0, y: win.y0, width: win.w, height: win.h, fill: C.ink }),
    mesh(m ? 'translate(-250 20) scale(.94)' : 'translate(40 -190)'),
    rect({ width: P.W, height: m ? 658 : 420, fill: 'url(#shade)', opacity: m ? .68 : .74 }),
    rect({ width: P.W, height: m ? 678 : 440, fill: 'url(#fade)' }),
    ...(P.scrims || []).map(k => rect({ x: k.x, y: k.y, width: k.w, height: k.h, rx: k.h / 2, fill: C.ink, opacity: k.opacity, filter: 'url(#scrim)' })),
    // a second, calmer glow behind the open-source rows, mirrored so its core sits mid-row where the
    // name cell is a single image: the narrow pill slices (cut at fractional pixels) stay on a dark ground
    group({ opacity: .46 }, mesh('translate(' + P.W + ' 0) scale(-1 1) translate(' + Math.round(P.W * (m ? .76 : .66) - 1105 * (m ? .8 : 1)) + ' ' + (P.rowsTop + (m ? 60 : 30)) + ') scale(' + (m ? .8 : 1) + ')')),
    rect({ x: 0, y: P.rowsTop - 40, width: P.W, height: P.H - P.rowsTop + 40, fill: 'url(#shade)', opacity: m ? .3 : .22 }),
    tag('ellipse', { cx: P.W * .89, cy: P.H + 40, rx: P.W * .65, ry: 330, fill: 'url(#bottom)' }),
    // The grain must be generated for the SAME rectangle in every slice (the noise is stitched to the
    // size of its region); a per-slice rectangle gives each slice a different texture, which soft-light
    // makes visible as rectangles on the bright glow.
    rect({ x: 0, y: 0, width: P.W, height: P.H, filter: 'url(#grain)', opacity: .52, style: 'mix-blend-mode:soft-light' }),
    rect({ x: 0, y: 0, width: P.W, height: P.H, filter: 'url(#grain)', opacity: .07 }),
  ].join('');
}

/** A seamless slice (x0, y0, w, h) of the panel, with its share of the outline and its content. */
function slice(P, win, items, { label: aria = '', desc = '', fullFont = false } = {}) {
  const { x0, y0, w, h } = win;
  const R = 24, s = .5;
  const left = x0 === 0, right = Math.abs(x0 + w - P.W) < .01, top = y0 === 0, bottom = Math.abs(y0 + h - P.H) < .01;
  const corners = { tl: top && left, tr: top && right, bl: bottom && left, br: bottom && right };
  const outline = [
    left ? 'M' + s + ' ' + (corners.tl ? R : 0) + 'V' + num(h - (corners.bl ? R : 0)) : '',
    right ? 'M' + num(w - s) + ' ' + (corners.tr ? R : 0) + 'V' + num(h - (corners.br ? R : 0)) : '',
    top ? 'M' + (corners.tl ? R : 0) + ' ' + s + 'H' + num(w - (corners.tr ? R : 0)) : '',
    bottom ? 'M' + (corners.bl ? R : 0) + ' ' + num(h - s) + 'H' + num(w - (corners.br ? R : 0)) : '',
    corners.tl ? 'M' + s + ' ' + R + 'A' + (R - s) + ' ' + (R - s) + ' 0 0 1 ' + R + ' ' + s : '',
    corners.tr ? 'M' + num(w - R) + ' ' + s + 'A' + (R - s) + ' ' + (R - s) + ' 0 0 1 ' + num(w - s) + ' ' + R : '',
    corners.br ? 'M' + num(w - s) + ' ' + num(h - R) + 'A' + (R - s) + ' ' + (R - s) + ' 0 0 1 ' + num(w - R) + ' ' + num(h - s) : '',
    corners.bl ? 'M' + R + ' ' + num(h - s) + 'A' + (R - s) + ' ' + (R - s) + ' 0 0 1 ' + s + ' ' + num(h - R) : '',
  ].join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: num(w), height: num(h), viewBox: '0 0 ' + num(w) + ' ' + num(h),
    ...(aria ? { role: 'img', 'aria-label': aria } : { 'aria-hidden': 'true' }),
  }, [
    desc ? tag('title', {}, escape(aria)) + tag('desc', {}, escape(desc)) : '',
    defs(w, h, corners, items.includes('<text') ? (fullFont ? fonts.full : fonts.panel) : null),
    group({ 'clip-path': 'url(#canvas)' }, group({ transform: 'translate(' + num(-x0) + ' ' + num(-y0) + ')' }, painting(P, win) + items)),
    path({ d: outline, fill: 'none', stroke: C.cloud, 'stroke-opacity': .10 }),
  ].join('\n')) + '\n';
}

const arrow = (x, y, size, color = C.powder) => path({
  d: 'M' + x + ' ' + (y + size) + 'L' + (x + size) + ' ' + y + 'M' + (x + size * .12) + ' ' + y + 'H' + (x + size) + 'V' + (y + size * .88),
  fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
});

/** A project logo as a rounded tile with a hairline ring. */
const logoTile = (project, x, y, size) => tag('image', {
  href: 'data:image/webp;base64,' + project.logoData, x, y, width: size, height: size, 'clip-path': 'url(#tile)',
}) + rect({ x: x + .5, y: y + .5, width: size - 1, height: size - 1, rx: size * .24, fill: 'none', stroke: C.cloud, 'stroke-opacity': .22 });

// ---- Top block: the one-piece composition ---------------------------------------------------

function toolkit(width, mobile, labelY, iconY, nameY) {
  const inset = mobile ? 40 : 64;
  const iconSize = mobile ? 44 : 46;
  const span = (width - inset * 2) / icons.length;
  return label(inset, labelY, 'A FOCUSED TOOLKIT', mobile ? 20 : 17) + icons.map((icon, i) => {
    const center = inset + span * (i + .5);
    const size = iconSize * (icon.opticalScale || 1);
    const top = iconY + (iconSize - size) / 2;
    return group({ 'aria-label': icon.name }, [
      group({ transform: 'translate(' + (center - size / 2) + ' ' + top + ') scale(' + size / 24 + ')' },
        path({ d: icon.d, fill: '#FFFFFF' })),
      text(center, nameY, icon.name, mobile ? 19 : 20, {
        'text-anchor': 'middle', fill: C.muted, 'font-weight': 500,
      }),
    ].join(''));
  }).join('');
}

function calendar(x, y, width, mobile) {
  const gap = mobile ? 3 : 4.5;
  const step = (width + gap) / activity.weeks.length;
  const size = step - gap;
  const colors = ['#152736', '#355574', '#6286A8', '#8AB1D2', '#D0E8F8'];
  const nonzero = activity.weeks.flatMap(w => w.contributionDays).map(d => d.contributionCount)
    .filter(n => n > 0).sort((a, b) => a - b);
  const quantile = p => nonzero[Math.min(nonzero.length - 1, Math.floor(nonzero.length * p))] || 1;
  const thresholds = [.25, .5, .75].map(quantile);
  const level = n => n === 0 ? 0 : 1 + thresholds.filter(t => n > t).length;
  const cells = activity.weeks.map((week, wi) => week.contributionDays.map(day => {
    return tag('rect', {
      x: (x + wi * step).toFixed(2), y: (y + day.weekday * step).toFixed(2),
      width: size.toFixed(2), height: size.toFixed(2), rx: mobile ? 1.3 : 2.2,
      fill: colors[level(day.contributionCount)],
    }, tag('title', {}, day.date + ': ' + day.contributionCount + ' contributions'));
  }).join('')).join('');
  const legendY = y + step * 7 + (mobile ? 30 : 32);
  const square = mobile ? 12 : 13;
  const legendX = x + width - (5 * (square + 6) + (mobile ? 59 : 48));
  const legend = text(legendX - 12, legendY + square - 2, 'Less', mobile ? 19 : 16, { 'text-anchor': 'end', fill: C.muted })
    + colors.map((color, i) => rect({ x: legendX + i * (square + 6), y: legendY, width: square, height: square, rx: 2, fill: color })).join('')
    + text(x + width, legendY + square - 2, 'More', mobile ? 19 : 16, { 'text-anchor': 'end', fill: C.muted });
  return { svg: cells + legend, bottom: legendY + square };
}

/** "Full Stack Developer at" + the company wordmark on one baseline. */
function roleLine(x, baseline, size, logoHeight) {
  const lead = config.role + ' at';
  const textWidth = measure(lead, size, 500);
  return text(x, baseline, lead, size, { fill: C.powder, 'font-weight': 500, ...NOKERN })
    + wordmark(x + textWidth + size * .34, baseline + logoHeight * .04, logoHeight);
}

/** Total width of the role line (text + gap + wordmark), to right-align it. */
const roleWidth = (size, logoHeight) => measure(config.role + ' at', size, 500) + size * .34 + wordmarkWidth(logoHeight);

function topBlock(P) {
  const { W, mobile: m, inset } = P;
  const cal = calendar(inset, m ? 986 : 758, W - 2 * inset, m);
  const lowest = cal.bottom + (m ? 42 : 40);
  const header = lowest + (m ? 38 : 37); // divider
  const items = m ? [
    label(inset, 58, config.credential.toUpperCase(), 19),
    text(inset - 4, 178, nameLines[0], 108, { 'font-weight': 650, 'letter-spacing': -4.5 }),
    text(inset - 4, 296, nameLines[1] + '.', 108, { 'font-weight': 650, 'letter-spacing': -4.5 }),
    roleLine(inset, 350, 24, 22),
    text(inset, 390, config.location, 21, { fill: C.muted }),
    text(inset, 466, config.headline[0], 34, { 'font-weight': 500, 'letter-spacing': -1.1 }),
    text(inset, 512, config.headline[1], 34, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.1 }),
    ...config.bio.map((value, i) => text(inset, 570 + i * 33, value, 23, { fill: C.muted })),
    line(648, W, inset),
    toolkit(W, true, 694, 724, 802),
    line(844, W, inset),
    label(inset, 890, 'GITHUB ACTIVITY', 19),
    text(inset - 2, 954, count, Math.min(64, 150 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + 168, 930, 'contributions', 22, { fill: C.muted }),
    text(inset + 168, 960, 'last 365 days', 22, { fill: C.muted }),
    cal.svg,
    text(inset, lowest, 'Updated ' + formatDate(activity.updatedAt) + ' · ' + activity.updatedAt.slice(11, 16) + ' UTC', 20, { fill: C.muted }),
  ] : [
    label(inset, 66, config.credential.toUpperCase(), 17),
    label(W - inset, 66, config.location.toUpperCase(), 17, { 'text-anchor': 'end' }),
    text(inset - 5, 202, config.name + '.', 128, { 'font-weight': 650, 'letter-spacing': -6 }),
    roleLine(W - inset - roleWidth(23, 21), 202, 23, 21),
    text(inset, 288, config.headline[0], 39, { 'font-weight': 500, 'letter-spacing': -1.2 }),
    text(inset, 337, config.headline[1], 39, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.2 }),
    ...config.bio.map((value, i) => text(W - inset, 298 + i * 30, value, 20, { 'text-anchor': 'end', fill: C.muted })),
    line(396, W, inset),
    toolkit(W, false, 446, 480, 566),
    line(606, W, inset),
    label(inset, 656, 'GITHUB ACTIVITY', 17),
    text(W - inset, 656, 'UPDATED ' + updated, 15, { 'text-anchor': 'end', fill: C.muted }),
    text(inset - 2, 726, count, Math.min(58, 190 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + Math.max(139, Math.min(218, count.length * 38)), 718, 'contributions in the last 365 days', 21, { fill: C.muted }),
    cal.svg,
    text(inset, lowest, range, 15, { fill: C.muted }),
  ];
  items.push(
    line(header, W, inset),
    label(inset, header + (m ? 46 : 48), 'OPEN SOURCE · ' + prTotal + ' MERGED PRS · ' + projects.length + ' PROJECTS', 15),
    text(inset - 1, header + (m ? 94 : 98), 'Selected contributions', m ? 36 : 40, { 'font-weight': 650, 'letter-spacing': -1 }),
    text(inset, header + (m ? 126 : 132), 'Merged into projects beyond my own repositories.', m ? 18 : 19, { fill: C.muted, 'font-weight': 500 }),
    ...(m ? [] : [label(W - inset, header + 132, 'MERGED PULL REQUESTS', 13, { 'text-anchor': 'end', fill: C.powder })]),
  );
  return { items: items.join(''), height: Math.round(header + (m ? 158 : 166)) };
}

// ---- Rows, call to action, contact buttons --------------------------------------------------

// Merged-PR pill: a git-merge icon and the PR number. Its width comes from the grid cell it is
// cut from, so it is identical on desktop and mobile (the cells are percentages of the width).
// Open-source rows: the name cell on the left, then SLOTS equal pill cells, then a right edge, all
// percentages of the width so desktop and mobile cut the same cells. More PRs than slots wrap to
// further rows, split evenly (5 PRs become 3 + 2).
const SLOTS = 4, CELL = 13.5, EDGE = 5.6;
const mergeIcon = (x, y, size, color = C.powder) => group({ transform: 'translate(' + x + ' ' + y + ') scale(' + size / 16 + ')',
  fill: 'none', stroke: color, 'stroke-width': 1.7, 'stroke-linecap': 'round' }, [
  tag('circle', { cx: 4, cy: 3, r: 2 }), tag('circle', { cx: 4, cy: 13, r: 2 }), tag('circle', { cx: 12, cy: 8, r: 2 }),
  path({ d: 'M4 5V11M4 5C4 7.6 6.6 8 10 8' }),
].join(''));
function prPill(x, y, w, h, number, m) {
  const size = m ? 15 : 21, icon = m ? 11 : 16, gap = m ? 5 : 10, arrowSize = m ? 0 : 12;
  const content = icon + gap + measure('#' + number, size, 650) + (arrowSize ? 10 + arrowSize : 0);
  const left = x + (w - content) / 2, middle = y + h / 2;
  return rect({ x, y, width: w, height: h, rx: h / 2, fill: C.ink, 'fill-opacity': .62, stroke: C.cloud, 'stroke-opacity': .2 })
    + mergeIcon(left, middle - icon / 2, icon)
    + text(left + icon + gap, middle + size * .34, '#' + number, size, { 'font-weight': 650, ...NOKERN })
    + (arrowSize ? arrow(left + content - arrowSize, middle - arrowSize / 2, arrowSize) : '');
}
function contactButton(x, y, w, h, contact, m) {
  const size = m ? 19 : 21;
  const ink = contact.primary ? C.ink : C.cloud;
  const shell = contact.primary
    ? rect({ x, y, width: w, height: h, rx: h / 2, fill: C.cloud })
    : rect({ x, y, width: w, height: h, rx: h / 2, fill: C.ink, 'fill-opacity': .62, stroke: C.cloud, 'stroke-opacity': .22 });
  const content = contact.logo ? wordmarkWidth(size) : measure(contact.label, size, 600);
  const total = content + 12 + 14, left = x + (w - total) / 2;
  const middle = y + h / 2;
  return shell + (contact.logo
    ? wordmark(left, middle + size / 2, size, ink)
    : text(left, middle + size * .36, contact.label, size, { fill: ink, 'font-weight': 600, ...NOKERN }))
    + arrow(left + content + 12, middle - 7, 14, contact.primary ? C.ink : C.powder);
}

/** Plan the panel for one platform: every slice with its window, items and optional link. */
function plan(mobile) {
  const W = mobile ? 640 : 1200, inset = mobile ? 40 : 64;
  const P = { W, mobile, inset, H: 0, rowsTop: 0 };
  if (!mobile) {
    const role = roleWidth(23, 21);
    P.scrims = [
      { x: W - inset - role - 56, y: 166, w: role + 112, h: 62, opacity: .8 },
      { x: W - inset - 330, y: 268, w: 400, h: 78, opacity: .7 },
      { x: W - inset - 220, y: 38, w: 290, h: 44, opacity: .55 },
    ];
  }
  const top = topBlock(P);
  P.rowsTop = top.height;
  const slices = [{ name: 'profile', win: { x0: 0, y0: 0, w: W, h: top.height }, items: top.items, w: '100%',
    label: title, desc: description, daily: true }];
  let y = top.height;
  const tile = mobile ? 36 : 52, textX = inset + tile + (mobile ? 12 : 18), nameSize = mobile ? 17 : 24;
  const cellW = W * CELL / 100, edgeW = W * EDGE / 100, nameW = W - SLOTS * cellW - edgeW;
  const pillGap = mobile ? 6 : 10, pillH = mobile ? 34 : 42, pillW = cellW - pillGap, rowH = mobile ? 76 : 80;
  const pct = w => (100 * w / W).toFixed(4) + '%';
  let first = true;
  for (const p of projects) {
    const rowCount = Math.ceil(p.prs.length / SLOTS), per = Math.ceil(p.prs.length / rowCount);
    const nameLines = mobile ? wrap(p.name, nameSize, 600, nameW - textX - 8) : [p.name];
    for (let r = 0; r < rowCount; r++) {
      const chunk = p.prs.slice(r * per, (r + 1) * per), blank = SLOTS - chunk.length, infoW = nameW + blank * cellW;
      const rule = r === 0 && !first ? line(y, W, inset) : ''; // no rule under the header: the panel flows straight in
      const head = r === 0 ? logoTile(p, inset, y + (rowH - tile) / 2, tile)
        + nameLines.map((value, n) => text(textX, y + (nameLines.length > 1 ? 32 : (mobile ? 44 : 38)) + n * 22, value, nameSize, { 'font-weight': 600 })).join('')
        + (mobile ? '' : text(textX, y + 60, p.repository, 14.5, { fill: C.muted, 'font-weight': 500 })) : '';
      slices.push({ name: p.slug + '-r' + r, win: { x0: 0, y0: y, w: infoW, h: rowH }, w: pct(infoW),
        items: rule + head, label: r === 0 ? p.name + ' (' + p.repository + ')' : '' });
      chunk.forEach((pr, k) => {
        const x0 = infoW + k * cellW, w = k === chunk.length - 1 ? cellW + edgeW : cellW;
        slices.push({ name: p.slug + '-r' + r + '-pr' + k, win: { x0, y0: y, w, h: rowH }, w: pct(w),
          items: rule + prPill(x0 + pillGap / 2, y + (rowH - pillH) / 2, pillW, pillH, pr.number, mobile),
          href: pr.url, label: p.name + ' merged pull request #' + pr.number });
      });
      y += rowH;
    }
    first = false;
  }
  const browseH = mobile ? 68 : 76, browse = 'Browse all merged PRs on GitHub', bs = mobile ? 18 : 20;
  const browseX = (W - (measure(browse, bs, 600) + 14 + 14)) / 2; // text + gap + arrow, centred
  slices.push({ name: 'browse-all', win: { x0: 0, y0: y, w: W, h: browseH }, w: '100%', href: mergedSearchUrl, label: browse,
    items: line(y, W, inset) + text(browseX, y + browseH / 2 + bs * .42, browse, bs, { fill: C.powder, 'font-weight': 600, ...NOKERN })
      + arrow(browseX + measure(browse, bs, 600) + 14, y + browseH / 2 - 7, 14) });
  y += browseH;
  const ctaH = mobile ? 214 : 196;
  slices.push({ name: 'call-to-action', win: { x0: 0, y0: y, w: W, h: ctaH }, w: '100%', label: config.cta.eyebrow + ' ' + config.cta.title,
    items: line(y, W, inset) + text(inset, y + (mobile ? 54 : 56), config.cta.eyebrow, mobile ? 24 : 21, { fill: C.muted, 'font-weight': 500 })
      + text(inset - (mobile ? 2 : 3), y + 128, config.cta.title, mobile ? 62 : 66, { 'font-weight': 600, 'letter-spacing': mobile ? -2 : -2.2 })
      + (mobile ? text(inset, y + 172, config.cta.note, 16, { fill: C.powder, 'font-weight': 500, 'letter-spacing': 1 })
        : text(W - inset, y + 120, config.cta.note, 16, { 'text-anchor': 'end', fill: C.powder, 'font-weight': 500, 'letter-spacing': 1 })) });
  y += ctaH;
  const barH = mobile ? 104 : 130, bw = mobile ? 184 : 300, bh = mobile ? 52 : 56;
  contacts.forEach((contact, k) => {
    const cell = W / contacts.length, x0 = k * cell;
    slices.push({ name: 'contact-' + contact.key, win: { x0, y0: y, w: cell, h: barH }, w: '33.3333%', href: contact.href,
      label: contact.label, items: contactButton(x0 + (cell - bw) / 2, y + 8, bw, bh, contact, mobile) });
  });
  y += barH;
  P.H = y;
  return { P, slices };
}

// ---- Build ----------------------------------------------------------------------------------

const outputs = {};
const platforms = [false, true].map(plan);
// Content-hashed names: a file that changes gets a new URL, so GitHub's image caches (which
// ignore ?query strings) can never serve a stale slice next to fresh ones.
const hashed = {};
for (const { P, slices } of platforms) {
  hashed[P.mobile ? 'mobile' : 'desktop'] = {};
  for (const s of slices) {
    const svg = slice(P, s.win, s.items, { label: s.label, desc: s.desc, fullFont: !!s.daily });
    const file = (s.daily ? 'dist/' : 'dist/panel/') + s.name + (P.mobile ? '-mobile' : '') + '.'
      + createHash('sha256').update(svg).digest('hex').slice(0, 10) + '.svg';
    outputs[file] = svg;
    hashed[P.mobile ? 'mobile' : 'desktop'][s.name] = file;
  }
}
const picture = (s, alt) => '<picture><source media="(max-width: 680px)" srcset="./' + hashed.mobile[s.name]
  + '"><img src="./' + hashed.desktop[s.name] + '" alt="' + escape(alt) + '" width="' + s.w + '" align="top"></picture>';
// No whitespace between images and no blank lines inside the block: the slices must touch.
const panelHtml = platforms[0].slices.map(s => {
  const image = picture(s, s.label);
  return s.href ? '<a href="' + escape(s.href) + '">' + image + '</a>' : image;
}).join('');
const readme = [
  '<!-- Generated by scripts/build.mjs. Edit profile.config.json or the renderer. -->',
  '<div align="center">',
  panelHtml,
  '</div>', '',
  '<details>',
  '<summary>Profile in plain text</summary>', '',
  '**' + config.name + '** · ' + config.credential + ' · ' + config.location + '<br>',
  config.role + ' at [' + config.company + '](' + config.contact.website + ').', '',
  bio, '',
  '**A focused toolkit:** ' + config.tools.map(t => t.name).join(' · ') + '.', '',
  '**Selected open-source contributions:**', '',
  ...projects.map(p => '- [' + p.name + '](https://github.com/' + p.repository + ') - '
    + p.prs.map(pr => '[#' + pr.number + '](' + pr.url + ')').join(', ')),
  '',
  '**Contact:** [Let’s talk](' + config.contact.email + ') · [LinkedIn](' + config.contact.linkedin + ') · [' + config.company + '](' + config.contact.website + ')', '',
  '**GitHub activity:** ' + count + ' contributions from ' + activity.range.from + ' through ' + activity.range.to + '.<br>',
  'Last successful refresh: ' + updated + '. Activity refreshes daily.<br>',
  '[View activity on GitHub](https://github.com/' + config.login + '?tab=overview)', '',
  '</details>', '',
].join('\n');

// Prepare every output before touching a previous good render, then drop files that are no longer
// referenced (old hashes, removed projects).
outputs['README.md'] = readme;
for (const [relative, content] of Object.entries(outputs)) {
  const output = join(root, relative);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = output + '.tmp';
  writeFileSync(temporary, content);
  renameSync(temporary, output);
}
const walk = dir => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(dir + '/' + entry.name) : [dir + '/' + entry.name]);
for (const file of walk('dist')) if (!(file in outputs)) rmSync(join(root, file));
console.log('Built profile panel from ' + activity.updatedAt + ' (' + Object.keys(outputs).length + ' files).');
