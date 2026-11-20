#!/usr/bin/env node
// Offline, deterministic artwork. Refresh data with activity.mjs before building.
//
// One continuous profile composition (desktop + mobile) plus a stack of open-source cards.
// GitHub renders SVGs through <img>, so text inside them is not selectable; the only parts that
// must be interactive are the merged-PR cards, and each of those is its own image wrapped in a
// native link. Text is measured with real Manrope advances (assets/fonts/manrope-metrics.json)
// so wrapping and the Webioo logo placement are exact without a browser.
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
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
const font = readFileSync(join(root, 'assets/fonts/manrope-latin.woff2')).toString('base64');
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
// The company wordmark replaces the company name in the role line (traced vector, assets/brand).
const brandSource = read('assets/brand/' + config.companyLogo + '.svg');
const brand = {
  d: brandSource.match(/ d="([^"]+)"/)[1],
  ratio: Number(brandSource.match(/viewBox="0 0 (\d+) (\d+)"/)[1]) / Number(brandSource.match(/viewBox="0 0 (\d+) (\d+)"/)[2]),
  box: brandSource.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1, 3).map(Number),
};
const wordmark = (x, baseline, height) => {
  const scale = height / brand.box[1];
  return group({ transform: 'translate(' + x.toFixed(2) + ' ' + (baseline - height).toFixed(2) + ') scale(' + scale.toFixed(5) + ')',
    'aria-label': config.company }, path({ d: brand.d, 'fill-rule': 'evenodd', fill: C.cloud }));
};

function defs(width, height) {
  const stop = (offset, color, opacity = 1) => tag('stop', {
    offset, 'stop-color': color, 'stop-opacity': opacity,
  });
  const radial = (id, stops) => tag('radialGradient', { id }, stops);
  return tag('defs', {}, [
    tag('style', {}, '@font-face{font-family:Manrope;src:url(data:font/woff2;base64,' + font
      + ') format("woff2");font-style:normal;font-weight:400 800;}text{font-kerning:normal;}'),
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
    tag('filter', { id: 'grain', x: '0%', y: '0%', width: '100%', height: '100%' }, [
      tag('feTurbulence', { type: 'fractalNoise', baseFrequency: '.44', numOctaves: 2, stitchTiles: 'stitch', seed: 17 }),
      tag('feColorMatrix', { type: 'saturate', values: 0 }),
      tag('feComponentTransfer', {}, tag('feFuncA', { type: 'linear', slope: .7 })),
    ].join('')),
    tag('clipPath', { id: 'canvas' }, rect({ width, height, rx: 24 })),
  ].join(''));
}

/**
 * The grainy mesh gradient: blurred powder / pearl / blush blobs on ink, a left shade, a soft
 * bottom glow and two grain layers. `tx`, `ty`, `scale` choose which part of the mesh shows and
 * `flip` mirrors it. `zone` is how far down the left shade reaches, `fadeZone` where the mesh
 * fades into ink, so text columns stay readable.
 */
function art(width, height, o = {}) {
  const { tx = 60, ty = -55, scale = 1, flip = false, shade = .78, zone = height, fade = 1, fadeZone = height, glow = 1 } = o;
  const place = (flip ? 'translate(' + width + ' 0) scale(-1 1) ' : '')
    + 'translate(' + tx + ' ' + ty + ') scale(' + scale + ')';
  const mesh = group({ transform: place }, [
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
  return group({ 'clip-path': 'url(#canvas)' }, [
    rect({ width, height, fill: C.ink }),
    mesh,
    shade ? rect({
      width, height: zone, fill: 'url(#shade)', opacity: shade,
      ...(flip ? { transform: 'translate(' + width + ' 0) scale(-1 1)' } : {}),
    }) : '',
    fade ? rect({ width, height: fadeZone, fill: 'url(#fade)', opacity: fade }) : '',
    glow ? tag('ellipse', { cx: width * .89, cy: height + 40, rx: width * .65, ry: 330, fill: 'url(#bottom)', opacity: glow }) : '',
    rect({ width, height, filter: 'url(#grain)', opacity: .52, style: 'mix-blend-mode:soft-light' }),
    rect({ width, height, filter: 'url(#grain)', opacity: .07 }),
  ].join(''));
}

/** An SVG document; `gap` adds transparent room below so stacked card images keep an even rhythm. */
function render(width, height, content, { label: aria = '', gap = 0, desc = '' } = {}) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height: height + gap, viewBox: '0 0 ' + width + ' ' + (height + gap),
    ...(aria ? { role: 'img', 'aria-label': aria } : { 'aria-hidden': 'true' }),
  }, [
    desc ? tag('title', {}, escape(aria)) + tag('desc', {}, escape(desc)) : '',
    defs(width, height),
    content,
    rect({ x: .5, y: .5, width: width - 1, height: height - 1, rx: 23.5,
      fill: 'none', stroke: C.cloud, 'stroke-opacity': .10 }),
  ].join('\n')) + '\n';
}

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

function desktop() {
  const width = 1200, height = 1316, inset = 64;
  const cal = calendar(inset, 904, width - 2 * inset, false);
  return render(width, height, [
    art(width, height, { tx: 60, ty: -55, shade: .78, zone: 560, fadeZone: 590, glow: 1 }),
    label(inset, 66, config.credential.toUpperCase(), 17),
    label(width - inset, 66, config.location.toUpperCase(), 17, { 'text-anchor': 'end' }),
    text(inset - 5, 224, config.name + '.', 128, { 'font-weight': 650, 'letter-spacing': -6 }),
    roleLine(inset, 284, 23, 21),
    text(inset, 372, config.headline[0], 39, { 'font-weight': 500, 'letter-spacing': -1.2 }),
    text(inset, 421, config.headline[1], 39, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.2 }),
    text(inset, 484, bio, 20, { fill: C.muted }),
    line(542, width, inset),
    toolkit(width, false, 592, 626, 712),
    line(752, width, inset),
    label(inset, 802, 'GITHUB ACTIVITY', 17),
    text(width - inset, 802, 'UPDATED ' + updated, 15, { 'text-anchor': 'end', fill: C.muted }),
    text(inset - 2, 872, count, Math.min(58, 190 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + Math.max(139, Math.min(218, count.length * 38)), 864, 'contributions in the last 365 days', 21, { fill: C.muted }),
    cal.svg,
    text(inset, cal.bottom + 40, range, 15, { fill: C.muted }),
    line(1138, width, inset),
    text(inset, 1190, config.cta.eyebrow, 21, { fill: C.muted }),
    text(inset - 3, 1262, config.cta.title, 66, { 'font-weight': 600, 'letter-spacing': -2.2 }),
    text(width - inset, 1256, config.cta.note, 16, {
      'text-anchor': 'end', fill: C.powder, 'letter-spacing': 1,
    }),
  ].join(''), { label: title, desc: description });
}

function mobile() {
  const width = 640, height = 1374, inset = 40, d = 18; // d: extra room under the two-line name
  const cal = calendar(inset, 968 + d, width - 2 * inset, true);
  return render(width, height, [
    art(width, height, { tx: -250, ty: 20, scale: .94, shade: .68, zone: 658, fadeZone: 678, glow: 1 }),
    label(inset, 58, config.credential.toUpperCase(), 19),
    text(inset - 4, 178, nameLines[0], 108, { 'font-weight': 650, 'letter-spacing': -4.5 }),
    text(inset - 4, 178 + 118, nameLines[1] + '.', 108, { 'font-weight': 650, 'letter-spacing': -4.5 }),
    roleLine(inset, 332 + d, 24, 22),
    text(inset, 372 + d, config.location, 21, { fill: C.muted }),
    text(inset, 448 + d, config.headline[0], 34, { 'font-weight': 500, 'letter-spacing': -1.1 }),
    text(inset, 494 + d, config.headline[1], 34, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.1 }),
    ...config.bio.map((value, i) => text(inset, 552 + d + i * 33, value, 23, { fill: C.muted })),
    line(630 + d, width, inset),
    toolkit(width, true, 676 + d, 706 + d, 784 + d),
    line(826 + d, width, inset),
    label(inset, 872 + d, 'GITHUB ACTIVITY', 19),
    text(inset - 2, 936 + d, count, Math.min(64, 150 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + 168, 912 + d, 'contributions', 22, { fill: C.muted }),
    text(inset + 168, 942 + d, 'last 365 days', 22, { fill: C.muted }),
    cal.svg,
    text(inset, cal.bottom + 42, 'Updated ' + formatDate(activity.updatedAt) + ' · ' + activity.updatedAt.slice(11, 16) + ' UTC', 20, { fill: C.muted }),
    line(1182 + d, width, inset),
    text(inset, 1234 + d, config.cta.eyebrow, 24, { fill: C.muted }),
    text(inset - 2, 1308 + d, config.cta.title, 62, { 'font-weight': 600, 'letter-spacing': -2 }),
  ].join(''), { label: title, desc: description });
}

// ---- Open-source cards: every merged PR is one image wrapped in a native link. ----------------

const pullRequests = config.openSource.flatMap(entry => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository)
    || !entry.name || !entry.summary || !Array.isArray(entry.prs) || !entry.prs.length
    || !entry.prs.every(n => Number.isInteger(n) && n > 0)) {
    throw new Error('Invalid open-source contribution in profile.config.json.');
  }
  return entry.prs.map(number => ({
    name: entry.name, summary: entry.summary, number,
    slug: entry.repository.replace('/', '-').toLowerCase() + '-' + number,
    url: 'https://github.com/' + entry.repository + '/pull/' + number,
  }));
});
const projectCount = new Set(config.openSource.map(e => e.repository)).size;
const mergedSearchUrl = 'https://github.com/search?q='
  + encodeURIComponent('author:' + config.login + ' is:pr is:merged -user:' + config.login)
  + '&type=pullrequests';
const arrow = (x, y, size) => path({
  d: 'M' + x + ' ' + (y + size) + 'L' + (x + size) + ' ' + y + 'M' + (x + size * .12) + ' ' + y + 'H' + (x + size) + 'V' + (y + size * .88),
  fill: 'none', stroke: C.powder, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
});
// Each card shows another part of the same mesh, always with the glow to the right so the text
// column stays dark; only height, size and the exact spot vary.
const cut = (i, width) => ({ tx: Math.round(width * (width < 800 ? 1.04 : .8) - 1105 + ((i * 83) % 120) - 60), ty: -230 - ((i * 53) % 120), scale: 1 + (i % 3) * .07 });

function prCard(pr, i, mobile) {
  const width = mobile ? 640 : 1200, pad = mobile ? 28 : 40;
  const pill = (x, y, h) => {
    const tracking = 2;
    const merged = measure('MERGED', 12, 500, tracking);
    const number = measure('#' + pr.number, mobile ? 19 : 21, 650);
    const w = 20 + merged + 14 + number + 12 + 12 + 20;
    const left = x - w;
    return rect({ x: left, y, width: w, height: h, rx: h / 2, fill: C.ink, 'fill-opacity': .66,
      stroke: C.cloud, 'stroke-opacity': .16 })
      + label(left + 20, y + h / 2 + 4.5, 'MERGED', 12, { 'letter-spacing': tracking, ...NOKERN })
      + text(left + 20 + merged + 14, y + h / 2 + 7, '#' + pr.number, mobile ? 19 : 21, { 'font-weight': 650, ...NOKERN })
      + arrow(left + w - 20 - 12, y + h / 2 - 6, 12);
  };
  const alt = pr.name + ' — ' + pr.summary + ' Merged pull request #' + pr.number + '.';
  if (!mobile) {
    const height = 96;
    return { alt, svg: render(width, height, [
      art(width, height, { ...cut(i, width), shade: .96, glow: .3 }),
      text(pad, 41, pr.name, 24, { 'font-weight': 600 }),
      text(pad, 71, pr.summary, 18.5, { fill: C.muted, 'font-weight': 500 }),
      pill(width - pad, 26, 44),
    ].join(''), { label: alt, gap: 8 }) };
  }
  const lines = wrap(pr.summary, 17, 500, width - pad * 2 - 90); // keep text clear of the glow
  const height = 78 + lines.length * 25 + 14;
  return { alt, svg: render(width, height, [
    art(width, height, { ...cut(i, width), shade: .97, glow: .3 }),
    text(pad, 44, pr.name, 22, { 'font-weight': 600 }),
    pill(width - pad, 18, 38),
    ...lines.map((value, n) => text(pad, 82 + n * 25, value, 17, { fill: C.muted, 'font-weight': 500 })),
  ].join(''), { label: alt, gap: 8 }) };
}

function ossHeader(mobile) {
  const width = mobile ? 640 : 1200, height = mobile ? 150 : 148, pad = mobile ? 28 : 40;
  const alt = 'Selected open-source contributions: ' + pullRequests.length + ' merged pull requests across '
    + projectCount + ' projects.';
  return { alt, svg: render(width, height, [
    art(width, height, { tx: mobile ? -300 : -60, ty: -140, scale: 1.1, shade: .66, glow: .5 }),
    label(pad, mobile ? 50 : 56, 'OPEN SOURCE', mobile ? 15 : 16),
    text(pad - 1, mobile ? 94 : 104, 'Selected contributions', mobile ? 33 : 40, { 'font-weight': 650, 'letter-spacing': -1 }),
    text(pad, mobile ? 125 : 134, 'Merged into projects beyond my own repositories.', mobile ? 17 : 18.5, { fill: C.muted, 'font-weight': 500 }),
    ...(mobile ? [] : [
      text(width - pad, 100, String(pullRequests.length), 56, { 'text-anchor': 'end', 'font-weight': 600, 'letter-spacing': -1.5 }),
      label(width - pad, 128, 'MERGED PRS · ' + projectCount + ' PROJECTS', 13, { 'text-anchor': 'end' }),
    ]),
  ].join(''), { label: alt, gap: 8 }) };
}

function ossFooter(mobile) {
  const width = mobile ? 640 : 1200, height = mobile ? 64 : 72;
  const words = 'Browse all merged PRs on GitHub';
  const size = mobile ? 18 : 20, w = measure(words, size, 600), x = (width - (w + 30)) / 2;
  return { alt: words, svg: render(width, height, [
    art(width, height, { tx: mobile ? -260 : 120, ty: -300, scale: 1.2, flip: true, shade: .55, glow: .4 }),
    text(x, height / 2 + size * .36, words, size, { fill: C.powder, 'font-weight': 600, ...NOKERN }),
    arrow(x + w + 14, height / 2 - 7, 14),
  ].join(''), { label: words, gap: 8 }) };
}

const outputs = { 'dist/profile.svg': desktop(), 'dist/profile-mobile.svg': mobile() };
const cards = [];
const addCard = (name, make, href) => {
  const desktopCard = make(false), mobileCard = make(true);
  outputs['dist/open-source/' + name + '.svg'] = desktopCard.svg;
  outputs['dist/open-source/' + name + '-mobile.svg'] = mobileCard.svg;
  cards.push({ name, alt: desktopCard.alt, href });
};
addCard('header', mobileFlag => ossHeader(mobileFlag));
pullRequests.forEach((pr, i) => addCard(pr.slug, mobileFlag => prCard(pr, i, mobileFlag), pr.url));
addCard('browse-all', mobileFlag => ossFooter(mobileFlag), mergedSearchUrl);

const version = createHash('sha256').update(Object.values(outputs).join('\n')).digest('hex').slice(0, 12);
const picture = (name, alt, width = '100%') => '<picture>\n'
  + '  <source media="(max-width: 680px)" srcset="./dist/' + name + '-mobile.svg?v=' + version + '">\n'
  + '  <img src="./dist/' + name + '.svg?v=' + version + '" alt="' + escape(alt) + '" width="' + width + '">\n</picture>';
const cardMarkup = cards.map(card => {
  const image = picture('open-source/' + card.name, card.alt);
  return card.href ? '<a href="' + escape(card.href) + '">\n' + image + '\n</a>' : image;
}).join('\n');
const readme = [
  '<!-- Generated by scripts/build.mjs. Edit profile.config.json or the renderer. -->',
  '<div align="center">', '',
  picture('profile', title + '. ' + description), '',
  '<p align="center"><a href="' + escape(config.contact.email) + '"><strong>Let’s talk</strong></a>'
    + '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + escape(config.contact.linkedin) + '">LinkedIn</a>'
    + '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + escape(config.contact.website) + '">' + escape(config.company) + '</a></p>', '',
  cardMarkup, '',
  '</div>', '',
  '<details>',
  '<summary>Profile in plain text</summary>', '',
  '**' + config.name + '** · ' + config.credential + ' · ' + config.location + '<br>',
  config.role + ' at [' + config.company + '](' + config.contact.website + ').', '',
  bio, '',
  '**A focused toolkit:** ' + config.tools.map(t => t.name).join(' · ') + '.', '',
  '**Selected open-source contributions:**', '',
  ...config.openSource.map(e => '- [' + e.name + '](https://github.com/' + e.repository + ') — ' + e.summary + ' '
    + e.prs.map(n => '[#' + n + '](https://github.com/' + e.repository + '/pull/' + n + ')').join(', ')),
  '',
  '**GitHub activity:** ' + count + ' contributions from ' + activity.range.from + ' through ' + activity.range.to + '.<br>',
  'Last successful refresh: ' + updated + '. Activity refreshes daily.<br>',
  '[View activity on GitHub](https://github.com/' + config.login + '?tab=overview)', '',
  '</details>', '',
].join('\n');

// Prepare every output before touching a previous good render.
outputs['README.md'] = readme;
for (const [relative, content] of Object.entries(outputs)) {
  const output = join(root, relative);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = output + '.tmp';
  writeFileSync(temporary, content);
  renameSync(temporary, output);
}
console.log('Built profile artwork from ' + activity.updatedAt + ' (' + Object.keys(outputs).length + ' files).');
