#!/usr/bin/env node
// Offline, deterministic artwork. Refresh data with activity.mjs before building.
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

function background(width, height, mobile) {
  const mesh = group({ transform: mobile ? 'translate(-250 20) scale(.94)' : 'translate(60 -55)' }, [
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
    rect({ width, height: mobile ? 730 : 650, fill: 'url(#shade)', opacity: mobile ? .68 : .78 }),
    rect({ width, height: mobile ? 740 : 690, fill: 'url(#fade)' }),
    tag('ellipse', { cx: width * .89, cy: height + 40, rx: width * .65, ry: 330, fill: 'url(#bottom)' }),
    rect({ width, height, filter: 'url(#grain)', opacity: .52, style: 'mix-blend-mode:soft-light' }),
    rect({ width, height, filter: 'url(#grain)', opacity: .07 }),
  ].join(''));
}

function toolkit(width, mobile) {
  const inset = mobile ? 40 : 64;
  const labelY = mobile ? 767 : 672;
  const iconY = mobile ? 817 : 718;
  const iconSize = mobile ? 49 : 52;
  const nameY = mobile ? 902 : 807;
  const span = (width - inset * 2) / icons.length;
  return label(inset, labelY, 'A FOCUSED TOOLKIT', mobile ? 24 : 20) + icons.map((icon, i) => {
    const center = inset + span * (i + .5);
    const size = iconSize * (icon.opticalScale || 1);
    const top = iconY + (iconSize - size) / 2;
    return group({ 'aria-label': icon.name }, [
      group({ transform: 'translate(' + (center - size / 2) + ' ' + top + ') scale(' + size / 24 + ')' },
        path({ d: icon.d, fill: '#FFFFFF' })),
      text(center, nameY, icon.name, mobile ? 21 : 23, {
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
  const legendY = y + step * 7 + (mobile ? 35 : 38);
  const square = mobile ? 12 : 13;
  const legendX = x + width - (5 * (square + 6) + (mobile ? 59 : 48));
  const legend = text(legendX - 12, legendY + square - 2, 'Less', mobile ? 20 : 17, { 'text-anchor': 'end', fill: C.muted })
    + colors.map((color, i) => rect({ x: legendX + i * (square + 6), y: legendY, width: square, height: square, rx: 2, fill: color })).join('')
    + text(x + width, legendY + square - 2, 'More', mobile ? 20 : 17, { 'text-anchor': 'end', fill: C.muted });
  return cells + legend;
}

function desktop() {
  const width = 1200, height = 1440, inset = 64;
  return render(width, height, false, [
    label(inset, 70, config.credential.toUpperCase(), 19),
    label(width - inset, 70, config.location.toUpperCase(), 19, { 'text-anchor': 'end' }),
    text(57, 254, config.name + '.', 146, { 'font-weight': 650, 'letter-spacing': -7 }),
    text(inset, 314, config.role + ' at ' + config.company, 26, { fill: C.powder, 'font-weight': 500 }),
    text(inset, 413, config.headline[0], 45, { 'font-weight': 500, 'letter-spacing': -1.4 }),
    text(inset, 470, config.headline[1], 45, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.4 }),
    text(inset, 544, bio, 23, { fill: C.muted }),
    line(615, width, inset),
    toolkit(width, false),
    line(848, width, inset),
    label(inset, 906, 'GITHUB ACTIVITY', 20),
    text(width - inset, 906, 'UPDATED ' + updated, 17, { 'text-anchor': 'end', fill: C.muted }),
    text(inset - 2, 996, count, Math.min(66, 210 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + Math.max(153, Math.min(240, count.length * 42)), 986, 'contributions in the last 365 days', 24, { fill: C.muted }),
    calendar(inset, 1031, width - 2 * inset, false),
    text(inset, 1222, range, 17, { fill: C.muted }),
    line(1258, width, inset),
    text(inset, 1312, config.cta.eyebrow, 24, { fill: C.muted }),
    text(inset - 3, 1390, config.cta.title, 76, { 'font-weight': 600, 'letter-spacing': -2.5 }),
    text(width - inset, 1383, config.cta.note, 18, {
      'text-anchor': 'end', fill: C.powder, 'letter-spacing': 1,
    }),
  ].join(''));
}

function mobile() {
  const width = 640, height = 1600, inset = 40;
  return render(width, height, true, [
    label(inset, 62, config.credential.toUpperCase(), 23),
    text(inset - 5, 205, nameLines[0], 125, { 'font-weight': 650, 'letter-spacing': -5 }),
    text(inset - 5, 331, nameLines[1] + '.', 125, { 'font-weight': 650, 'letter-spacing': -5 }),
    text(inset, 393, config.role, 29, { fill: C.powder, 'font-weight': 500 }),
    text(inset, 435, 'at ' + config.company + ' · ' + config.location, 25, { fill: C.muted }),
    text(inset, 525, config.headline[0], 39, { 'font-weight': 500, 'letter-spacing': -1.3 }),
    text(inset, 579, config.headline[1], 39, { fill: C.powder, 'font-weight': 500, 'letter-spacing': -1.3 }),
    ...config.bio.map((value, i) => text(inset, 644 + i * 38, value, 27, { fill: C.muted })),
    line(718, width, inset),
    toolkit(width, true),
    line(947, width, inset),
    label(inset, 1006, 'GITHUB ACTIVITY', 24),
    text(inset - 2, 1099, count, Math.min(76, 158 / (count.length * .66)), { 'font-weight': 600, 'letter-spacing': -1 }),
    text(inset + 185, 1066, 'contributions', 25, { fill: C.muted }),
    text(inset + 185, 1103, 'last 365 days', 25, { fill: C.muted }),
    calendar(inset, 1146, width - 2 * inset, true),
    text(inset, 1300, 'Updated ' + formatDate(activity.updatedAt) + ' · ' + activity.updatedAt.slice(11, 16) + ' UTC', 23, { fill: C.muted }),
    text(inset, 1336, 'Daily refresh · GitHub', 23, { fill: C.muted }),
    line(1374, width, inset),
    text(inset, 1434, config.cta.eyebrow, 28, { fill: C.muted }),
    text(inset - 2, 1520, config.cta.title, 72, { 'font-weight': 600, 'letter-spacing': -2.4 }),
  ].join(''));
}

function render(width, height, mobile, content) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: '0 0 ' + width + ' ' + height,
    role: 'img', 'aria-labelledby': 'title description',
  }, [
    tag('title', { id: 'title' }, escape(title)),
    tag('desc', { id: 'description' }, escape(description)),
    defs(width, height),
    background(width, height, mobile),
    content,
    rect({ x: .5, y: .5, width: width - 1, height: height - 1, rx: 23.5,
      fill: 'none', stroke: C.cloud, 'stroke-opacity': .10 }),
  ].join('\n')) + '\n';
}

const desktopSvg = desktop();
const mobileSvg = mobile();
const version = createHash('sha256').update(desktopSvg).update(mobileSvg).digest('hex').slice(0, 12);
const readme = [
  '<!-- Generated by scripts/build.mjs. Edit profile.config.json or the renderer. -->',
  '<div align="center">', '',
  '<picture>',
  '  <source media="(max-width: 680px)" srcset="./dist/profile-mobile.svg?v=' + version + '">',
  '  <img src="./dist/profile.svg?v=' + version + '" alt="' + escape(title + '. ' + description) + '" width="100%">',
  '</picture>', '',
  '<p align="center"><a href="' + escape(config.contact.email) + '"><strong>Let’s talk</strong></a>'
    + '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + escape(config.contact.linkedin) + '">LinkedIn</a>'
    + '&nbsp;&nbsp;·&nbsp;&nbsp;<a href="' + escape(config.contact.website) + '">Webioo</a></p>', '',
  '</div>', '',
  '<details>',
  '<summary>Profile in plain text</summary>', '',
  '**' + config.name + '** · ' + config.credential + ' · ' + config.location + '<br>',
  config.role + ' at [' + config.company + '](' + config.contact.website + ').', '',
  bio, '',
  '**A focused toolkit:** ' + config.tools.map(t => t.name).join(' · ') + '.', '',
  '**GitHub activity:** ' + count + ' contributions from ' + activity.range.from + ' through ' + activity.range.to + '.<br>',
  'Last successful refresh: ' + updated + '. Activity refreshes daily.<br>',
  '[View activity on GitHub](https://github.com/' + config.login + '?tab=overview)', '',
  '</details>', '',
].join('\n');

// Prepare every output before touching a previous good render.
const outputs = {
  'dist/profile.svg': desktopSvg,
  'dist/profile-mobile.svg': mobileSvg,
  'README.md': readme,
};
for (const [relative, content] of Object.entries(outputs)) {
  const output = join(root, relative);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = output + '.tmp';
  writeFileSync(temporary, content);
  renameSync(temporary, output);
}
console.log('Built desktop and mobile profile artwork from ' + activity.updatedAt + '.');
