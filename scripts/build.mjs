#!/usr/bin/env node
// Offline, deterministic artwork. Refresh data with activity.mjs before building.
//
// Design rule: GitHub renders SVGs through <img>, so text inside an SVG can be neither selected
// nor copied. Everything a reader may want to copy (name, role, bio, links, contribution list,
// activity numbers) is therefore real README text. The SVGs are pure art: grainy mesh-gradient
// bands, the toolkit logos and the contribution calendar.
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateActivity } from './activity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const config = JSON.parse(read('profile.config.json'));
const bio = config.bio.join(' ');
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
const formatDate = date => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(date)).toUpperCase();
const updated = formatDate(activity.updatedAt) + ' · ' + activity.updatedAt.slice(11, 16) + ' UTC';
const range = formatDate(activity.range.from) + ' — ' + formatDate(activity.range.to);
const count = new Intl.NumberFormat('en-US').format(activity.totalContributions);
const icons = config.tools.map(tool => {
  if (!/^[a-z0-9-]+$/.test(tool.slug)) throw new Error('Invalid icon slug.');
  const source = read('assets/icons/' + tool.slug + '.svg');
  const match = source.match(/<path d="([^"]+)"/);
  if (!match) throw new Error('Missing icon path: ' + tool.slug);
  return { ...tool, d: match[1] };
});

function defs(width, height, { withFont = false } = {}) {
  const stop = (offset, color, opacity = 1) => tag('stop', {
    offset, 'stop-color': color, 'stop-opacity': opacity,
  });
  const radial = (id, stops) => tag('radialGradient', { id }, stops);
  return tag('defs', {}, [
    withFont ? tag('style', {}, '@font-face{font-family:Manrope;src:url(data:font/woff2;base64,' + font
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
 * bottom glow and two grain layers. `tx`, `ty` and `scale` choose which part of the mesh shows,
 * `flip` mirrors it, so every band is the same material cut differently.
 */
function art(width, height, { tx = 60, ty = -55, scale = 1, flip = false, shade = .5, fade = 0, glow = 1 } = {}) {
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
      width, height, fill: 'url(#shade)', opacity: shade,
      ...(flip ? { transform: 'translate(' + width + ' 0) scale(-1 1)' } : {}),
    }) : '',
    fade ? rect({ width, height, fill: 'url(#fade)', opacity: fade }) : '',
    glow ? tag('ellipse', { cx: width * .89, cy: height + 40, rx: width * .65, ry: 330, fill: 'url(#bottom)', opacity: glow }) : '',
    rect({ width, height, filter: 'url(#grain)', opacity: .52, style: 'mix-blend-mode:soft-light' }),
    rect({ width, height, filter: 'url(#grain)', opacity: .07 }),
  ].join(''));
}

function render(width, height, content, { label = '', withFont = false } = {}) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: '0 0 ' + width + ' ' + height,
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }),
  }, [
    defs(width, height, { withFont }),
    content,
    rect({ x: .5, y: .5, width: width - 1, height: height - 1, rx: 23.5,
      fill: 'none', stroke: C.cloud, 'stroke-opacity': .10 }),
  ].join('\n')) + '\n';
}

// Pure art, no text: the names are real README text next to the images.
const hero = () => render(1200, 380, art(1200, 380, { tx: 20, ty: -70, shade: .2, fade: .5 }));
const band = () => render(1200, 120, art(1200, 120, { tx: -140, ty: -190, scale: 1.1, flip: true, shade: .3, glow: .6 }));
const closing = () => render(1200, 180, art(1200, 180, { tx: -20, ty: -150, scale: 1.05, flip: true, shade: .3, fade: .5 }));

function toolkit(width, height, mobile) {
  const inset = mobile ? 40 : 64;
  const iconSize = mobile ? 49 : 52;
  const span = (width - inset * 2) / icons.length;
  const logos = icons.map((icon, i) => {
    const center = inset + span * (i + .5);
    const size = iconSize * (icon.opticalScale || 1);
    return group({ 'aria-label': icon.name, transform: 'translate(' + (center - size / 2) + ' ' + ((height - size) / 2) + ') scale(' + size / 24 + ')' },
      path({ d: icon.d, fill: '#FFFFFF' }));
  }).join('');
  return render(width, height, art(width, height, { tx: mobile ? -330 : -80, ty: -230, scale: mobile ? 1 : 1.15, shade: .55, glow: .7 }) + logos,
    { label: 'Toolkit: ' + icons.map(i => i.name).join(', ') + '.' });
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
  const legendY = y + step * 7 + (mobile ? 22 : 30);
  const square = mobile ? 12 : 13;
  const legendX = x + width - (5 * (square + 6) + (mobile ? 59 : 48));
  const legend = text(legendX - 12, legendY + square - 2, 'Less', mobile ? 20 : 17, { 'text-anchor': 'end', fill: C.muted })
    + colors.map((color, i) => rect({ x: legendX + i * (square + 6), y: legendY, width: square, height: square, rx: 2, fill: color })).join('')
    + text(x + width, legendY + square - 2, 'More', mobile ? 20 : 17, { 'text-anchor': 'end', fill: C.muted });
  return { svg: cells + legend, bottom: legendY + square };
}

function activityCard(mobile) {
  const width = mobile ? 640 : 1200;
  const inset = mobile ? 32 : 56;
  const top = mobile ? 30 : 42;
  const cal = calendar(inset, top, width - inset * 2, mobile);
  const height = Math.round(cal.bottom + (mobile ? 30 : 42));
  return render(width, height, art(width, height, { tx: mobile ? -420 : -190, ty: -330, scale: mobile ? .9 : 1.1, shade: .82, glow: .3 }) + cal.svg, {
    label: 'GitHub contribution calendar: ' + count + ' contributions from ' + range + '.',
    withFont: true,
  });
}

const outputs = {
  'dist/hero.svg': hero(),
  'dist/toolkit.svg': toolkit(1200, 170, false),
  'dist/toolkit-mobile.svg': toolkit(640, 150, true),
  'dist/band-open-source.svg': band(),
  'dist/profile.svg': activityCard(false),
  'dist/profile-mobile.svg': activityCard(true),
  'dist/closing.svg': closing(),
};
const version = createHash('sha256').update(Object.values(outputs).join('\n')).digest('hex').slice(0, 12);
const src = name => './dist/' + name + '.svg?v=' + version;
const picture = (desktopName, mobileName, alt) => '<picture>\n'
  + (mobileName ? '  <source media="(max-width: 680px)" srcset="' + src(mobileName) + '">\n' : '')
  + '  <img src="' + src(desktopName) + '" alt="' + escape(alt) + '" width="100%">\n</picture>';

const link = (label, href) => '<a href="' + escape(href) + '">' + label + '</a>';
const dot = '&nbsp;&nbsp;·&nbsp;&nbsp;';
const selectedContributions = config.openSource.map(entry => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.repository)
    || !entry.name || !entry.summary || !Array.isArray(entry.prs) || !entry.prs.length
    || !entry.prs.every(n => Number.isInteger(n) && n > 0)) {
    throw new Error('Invalid open-source contribution in profile.config.json.');
  }
  const url = 'https://github.com/' + entry.repository;
  const prs = entry.prs.map(n => link('#' + n, url + '/pull/' + n)).join(' ');
  return '<p><strong>' + link(escape(entry.name), url) + '</strong>' + dot + escape(entry.summary)
    + '<br><sub>MERGED&nbsp;' + prs + '</sub></p>';
}).join('\n');
const mergedSearchUrl = 'https://github.com/search?q='
  + encodeURIComponent('author:' + config.login + ' is:pr is:merged -user:' + config.login)
  + '&type=pullrequests';

const readme = [
  '<!-- Generated by scripts/build.mjs. Edit profile.config.json or the renderer. -->',
  '<div align="center">', '',
  picture('hero', null, ''), '',
  '<h1>' + escape(config.name) + '.</h1>', '',
  '<p><strong>' + escape(config.role) + ' at ' + link(escape(config.company), config.contact.website) + '</strong><br>'
    + '<sub>' + escape(config.credential.toUpperCase()) + dot + escape(config.location.toUpperCase()) + '</sub></p>', '',
  '<h3>' + config.headline.map(escape).join('<br>') + '</h3>', '',
  '<p>' + escape(bio) + '</p>', '',
  '<p>' + link('<strong>Let’s talk</strong>', config.contact.email) + dot
    + link('LinkedIn', config.contact.linkedin) + dot + link('Webioo', config.contact.website) + '</p>', '',
  '<br>', '',
  '<sub>A FOCUSED TOOLKIT</sub>', '',
  picture('toolkit', 'toolkit-mobile', 'Toolkit: ' + icons.map(i => i.name).join(', ') + '.'), '',
  '<p>' + icons.map(i => escape(i.name)).join(dot) + '</p>', '',
  '<br>', '',
  picture('band-open-source', null, ''), '',
  '<h3>Selected open-source contributions</h3>', '',
  '<p><sub>Merged into projects outside my own repositories.</sub></p>', '',
  selectedContributions, '',
  '<p><sub>' + link('Browse all merged PRs', mergedSearchUrl) + '</sub></p>', '',
  '<br>', '',
  '<sub>GITHUB ACTIVITY</sub>', '',
  '<p><strong>' + count + '</strong> contributions in the last 365 days<br>'
    + '<sub>' + range + dot + 'UPDATED ' + updated + '</sub></p>', '',
  picture('profile', 'profile-mobile', 'GitHub contribution calendar: ' + count + ' contributions from '
    + activity.range.from + ' through ' + activity.range.to + '.'), '',
  '<p><sub>' + link('View activity on GitHub', 'https://github.com/' + config.login + '?tab=overview')
    + dot + 'Refreshes daily</sub></p>', '',
  '<br>', '',
  picture('closing', null, ''), '',
  '<sub>' + escape(config.cta.eyebrow.toUpperCase()) + '</sub>', '',
  '<h2>' + escape(config.cta.title) + '</h2>', '',
  '<p>' + link('<strong>Let’s talk</strong>', config.contact.email) + dot
    + link('LinkedIn', config.contact.linkedin) + dot + link('Webioo', config.contact.website) + '</p>', '',
  '<sub>' + escape(config.cta.note) + '</sub>', '',
  '</div>', '',
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
console.log('Built profile artwork and README from ' + activity.updatedAt + '.');
