#!/usr/bin/env node
// Profile artwork generator.
//   node scripts/build.mjs static        -> assets/*.svg (hero, work, projects, toolkit, footer)
//   node scripts/build.mjs stats [dir]   -> <dir>/stats.svg from the GitHub GraphQL API (needs GITHUB_TOKEN)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USER = 'emreocell';
const W = 1600;

// Palette ------------------------------------------------------------------
const C = {
  jet: '#0A0A0B', obsidian: '#0D0E10', onyx: '#121316', matte: '#1A1B1E',
  gunmetal: '#2C3137', storm: '#4B525A', frost: '#E4EBF0', chalk: '#F3F1EC',
  mute: '#9AA2AA', dim: '#6B737B', line: '#FFFFFF',
};
const SANS = "'Inter','Segoe UI Variable Display','Segoe UI','SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono','SF Mono','Cascadia Code',Menlo,Consolas,monospace";
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Shared building blocks ---------------------------------------------------
function frame(h, { seed = 4, blobs, vignette = 0.55, body, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.jet}"/><stop offset=".55" stop-color="${C.obsidian}"/><stop offset="1" stop-color="${C.onyx}"/></linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.chalk}"/><stop offset="1" stop-color="#C3CAD0"/></linearGradient>
  <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${vignette}"/></radialGradient>
  <filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${Math.round(h / 7 + 40)}"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="3" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".62"/></feComponentTransfer></filter>
</defs>
<style>
  .s{font-family:${SANS}} .m{font-family:${MONO};letter-spacing:.22em;text-transform:uppercase}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
  @keyframes ring{0%{r:6;opacity:.7}100%{r:22;opacity:0}}
  @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
  .pulse{animation:pulse 2.4s ease-in-out infinite} .ring{animation:ring 2.4s ease-out infinite} .blink{animation:blink 1.1s step-end infinite}
</style>
<rect width="${W}" height="${h}" fill="url(#base)"/>
<g filter="url(#blur)">${blobs.map(([cx, cy, rx, ry, fill, o]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${o}"/>`).join('')}</g>
<rect width="${W}" height="${h}" fill="url(#vig)"/>
<rect width="${W}" height="${h}" filter="url(#grain)" opacity=".5" style="mix-blend-mode:overlay"/>
<rect width="${W}" height="${h}" filter="url(#grain)" opacity=".06"/>
${body}
</svg>
`;
}
const rule = (y, x1 = 64, x2 = W - 64, o = 0.12) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.line}" stroke-opacity="${o}"/>`;
const cross = (x, y) => `<path d="M${x - 9} ${y}h18M${x} ${y - 9}v18" stroke="${C.frost}" stroke-opacity=".38"/>`;
const meta = (x, y, t, anchor = 'start', fill = C.mute, size = 15) => `<text class="m" x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`;
function header(num, title, aside, y = 196) {
  return `${meta(64, 70, `( ${num} )`, 'start', C.dim)}${meta(W - 64, 70, aside, 'end', C.dim)}${rule(96)}
<text class="s" x="58" y="${y + 24}" font-size="96" font-weight="700" letter-spacing="-3" fill="url(#ink)">${esc(title)}</text>`;
}

// Static artwork -----------------------------------------------------------
function hero() {
  const h = 900;
  const col = (x, label, value, extra = '') => `${meta(x, 834, label, 'start', C.dim, 13)}<text class="s" x="${x}" y="870" font-size="23" fill="${C.chalk}">${extra}${esc(value)}</text>`;
  return frame(h, {
    title: 'Emre Öcel — Full stack engineer', seed: 7,
    blobs: [
      [1260, 110, 560, 300, '#3A4048', .95], [1480, 800, 420, 250, C.frost, .30], [760, 1000, 640, 230, C.gunmetal, 1],
      [110, 60, 400, 210, '#24282D', .9], [1060, 480, 220, 130, '#F1F5F8', .13], [420, 520, 320, 200, C.jet, .9],
    ],
    body: `
${cross(32, 32)}${cross(W - 32, 32)}${cross(32, h - 32)}${cross(W - 32, h - 32)}
${meta(64, 82, 'Emre Öcel — Portfolio')}${meta(W / 2, 82, 'Index · 2026', 'middle')}${meta(W - 64, 82, 'Samsun, TR · 41.29°N 36.33°E', 'end')}
${rule(112)}
<text class="s" x="50" y="430" font-size="300" font-weight="800" letter-spacing="-14" fill="url(#ink)">Emre</text>
<text class="s" x="50" y="738" font-size="300" font-weight="800" letter-spacing="-14" fill="none" stroke="${C.frost}" stroke-opacity=".85" stroke-width="2">Öcel</text>
${meta(1010, 206, '( 01 )  About', 'start', C.dim, 14)}
<g class="s" font-size="33" fill="${C.chalk}">
  <text x="1008" y="268">Full stack engineer building</text>
  <text x="1008" y="316">local-first AI tools, real-time</text>
  <text x="1008" y="364">communication and fast,</text>
  <text x="1008" y="412">search-friendly web products.</text>
</g>
${meta(1010, 480, 'Now → Praxi-Bot · JARVIS', 'start', C.mute, 14)}<rect class="blink" x="1294" y="466" width="9" height="17" fill="${C.frost}"/>
${rule(792)}
${col(64, 'Role', 'Full Stack Engineer')}
${col(450, 'Focus', 'AI agents · Realtime · Web')}
${col(836, 'Education', 'Computer Eng. — Fırat Univ.')}
${meta(1222, 834, 'Status', 'start', C.dim, 13)}
<circle class="ring" cx="1230" cy="862" r="6" fill="none" stroke="${C.frost}"/><circle class="pulse" cx="1230" cy="862" r="5" fill="${C.frost}"/>
<text class="s" x="1250" y="870" font-size="23" fill="${C.chalk}">Open to collaborate</text>`,
  });
}

function work() {
  return frame(270, {
    title: 'Selected work', seed: 9,
    blobs: [[1300, 40, 520, 160, '#3A4048', .8], [200, 260, 460, 140, C.gunmetal, .9]],
    body: header('02', 'Selected Work', '04 featured repositories', 170),
  });
}

const PROJECTS = [
  { n: '01', slug: 'praxi-bot', repo: 'Praxi-Bot', name: 'Praxi-Bot', kind: 'AI agent platform · Open source',
    lines: ['Local-first AI agent platform for desktop automation and', 'multi-agent workflows, with permission controls and local or cloud LLMs.'],
    tags: ['Rust', 'Tauri', 'Multi-agent', 'Local-first'],
    blobs: [[1350, 60, 480, 220, '#3A4048', .9], [1500, 380, 300, 160, C.frost, .22], [260, 400, 520, 160, C.gunmetal, .8]] },
  { n: '02', slug: 'jarvis', repo: 'JARVIS', name: 'JARVIS', kind: 'Personal AI assistant · Windows',
    lines: ['Windows-focused personal AI assistant with voice, a desktop UI,', 'long-term memory, routines and local automation.'],
    tags: ['Python', 'Voice', 'Memory', 'Automation'],
    blobs: [[300, 0, 520, 200, '#383E46', .9], [1450, 360, 460, 170, C.gunmetal, .9], [1100, 120, 240, 120, C.frost, .12]] },
  { n: '03', slug: 'open-translate-meet', repo: 'Open-Translate-Meet', name: 'Open Translate Meet', kind: 'Realtime video · Apache-2.0',
    lines: ['Self-hosted video meetings with real-time AI speech translation,', 'multilingual captions, chat and optional AI summaries.'],
    tags: ['PHP', 'JavaScript', 'LiveKit', 'WebRTC', 'Gemini'],
    blobs: [[1250, 380, 560, 200, '#3A4048', .9], [1520, 20, 300, 150, C.frost, .24], [200, 40, 460, 150, C.gunmetal, .8]] },
  { n: '04', slug: 'healtchain', repo: 'HealtChain', name: 'HealtChain', kind: 'Graduation thesis · Blockchain',
    lines: ['Medical records stored securely on the Ethereum blockchain,', 'with AI-assisted health recommendations.'],
    tags: ['JavaScript', 'Ethereum', 'Smart contracts', 'AI'],
    blobs: [[800, 420, 640, 180, '#383E46', .9], [140, 40, 380, 160, C.gunmetal, .9], [1450, 60, 320, 150, C.frost, .16]] },
];
function project(p) {
  const h = 360;
  return frame(h, {
    title: `${p.name} — ${p.lines.join(' ')}`, seed: Number(p.n) + 20, blobs: p.blobs, vignette: .5,
    body: `
${rule(1, 0, W, .08)}
<text class="s" x="44" y="292" font-size="250" font-weight="800" letter-spacing="-12" fill="none" stroke="${C.frost}" stroke-opacity=".22" stroke-width="1.5">${p.n}</text>
${meta(340, 82, `${p.n} / 04`, 'start', C.dim, 14)}${meta(W - 64, 82, p.kind, 'end', C.dim, 14)}
<text class="s" x="336" y="168" font-size="72" font-weight="700" letter-spacing="-2" fill="url(#ink)">${esc(p.name)}</text>
<g class="s" font-size="25" fill="${C.mute}"><text x="340" y="218">${esc(p.lines[0])}</text><text x="340" y="254">${esc(p.lines[1])}</text></g>
${meta(340, 308, p.tags.join('  /  '), 'start', '#828A92', 14)}
${meta(W - 64, 308, 'View repository  ↗', 'end', C.chalk, 14)}${rule(320, W - 330, W - 64, .35)}`,
  });
}

function toolkit() {
  const cols = [
    ['Languages', ['Rust', 'Python', 'TypeScript', 'JavaScript', 'PHP', 'Java · C#']],
    ['Web & Systems', ['HTML & CSS', 'Bootstrap', 'MySQL', 'Technical SEO', 'Core Web Vitals', 'E-commerce']],
    ['Realtime & AI', ['LiveKit', 'WebRTC', 'Gemini Live', 'LLM agents', 'Local models', 'Ethereum']],
    ['Tooling', ['Git', 'GitHub Actions', 'Docker', 'Tauri', 'Nginx & Apache', 'Linux']],
  ];
  const x0 = 64, cw = (W - 128) / 4;
  const body = cols.map(([label, items], i) => {
    const x = x0 + i * cw;
    return `${meta(x, 300, `${String(i + 1).padStart(2, '0')} — ${label}`, 'start', C.dim, 13)}
<line x1="${x}" y1="322" x2="${x + cw - 40}" y2="322" stroke="${C.line}" stroke-opacity=".1"/>
<g class="s" font-size="29" fill="${C.chalk}">${items.map((t, j) => `<text x="${x}" y="${376 + j * 50}" ${j > 3 ? `fill="${C.mute}"` : ''}>${esc(t)}</text>`).join('')}</g>`;
  }).join('\n');
  return frame(700, {
    title: 'Toolkit', seed: 13,
    blobs: [[1350, 120, 520, 260, '#3A4048', .85], [180, 700, 520, 220, C.gunmetal, .95], [1500, 640, 320, 180, C.frost, .18]],
    body: header('03', 'Toolkit', 'Tools I reach for', 170) + body,
  });
}

function footer() {
  const h = 640;
  return frame(h, {
    title: "Let's build something that lasts.", seed: 17, vignette: .45,
    blobs: [[800, 700, 760, 260, '#3D434B', 1], [1400, 640, 400, 220, C.frost, .32], [200, 100, 420, 200, C.gunmetal, .7], [900, 300, 260, 120, C.frost, .08]],
    body: `
${meta(64, 70, '( 05 )', 'start', C.dim)}${meta(W - 64, 70, 'Contact', 'end', C.dim)}${rule(96)}
<text class="s" x="56" y="270" font-size="132" font-weight="800" letter-spacing="-5" fill="url(#ink)">Let’s build something</text>
<text class="s" x="56" y="410" font-size="132" font-weight="800" letter-spacing="-5" fill="none" stroke="${C.frost}" stroke-opacity=".85" stroke-width="2">that lasts.</text>
${rule(500)}
${meta(64, 548, 'emreocell1219@gmail.com', 'start', C.chalk, 15)}
${meta(560, 548, 'linkedin / emreocell', 'start', C.mute, 15)}
${meta(980, 548, 'emreocell.github.io', 'start', C.mute, 15)}
${meta(W - 64, 548, '© 2026 Emre Öcel', 'end', C.dim, 15)}
${cross(32, h - 32)}${cross(W - 32, h - 32)}`,
  });
}

// Generated statistics -----------------------------------------------------
async function stats() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const query = `query($login:String!){ user(login:$login){
    followers{totalCount}
    repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){ totalCount nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } } } }
    contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } } } } }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': USER },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const u = json.data.user;
  const repos = u.repositories.nodes;
  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const langs = {};
  for (const r of repos) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  const totalBytes = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, s]) => [n, (s / totalBytes) * 100]);
  const cal = u.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap(w => w.contributionDays);
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else if (i === days.length - 1) continue; // today may still be empty
    else break;
  }
  const fmt = n => n.toLocaleString('en-US');
  const h = 920;
  const dy = 50;

  const small = [['Public repos', u.repositories.totalCount], ['Stars earned', stars], ['Current streak', `${current}d`], ['Longest streak', `${longest}d`]];
  const smallSvg = small.map(([l, v], i) => {
    const x = 64 + i * 215;
    return `${meta(x, 420 + dy, l, 'start', C.dim, 12)}<text class="s" x="${x - 2}" y="520" font-size="46" font-weight="700" letter-spacing="-1" fill="${C.chalk}">${esc(typeof v === 'number' ? fmt(v) : v)}</text>`;
  }).join('');

  const shades = ['#16181B', '#2C3137', '#4B525A', '#8C949C', C.chalk];
  const nz = days.map(d => d.contributionCount).filter(c => c > 0).sort((a, b) => a - b);
  const q = f => nz[Math.min(nz.length - 1, Math.floor(nz.length * f))] ?? 1;
  const cuts = [q(.25), q(.5), q(.75)];
  const level = c => (c === 0 ? 0 : 1 + cuts.filter(t => c > t).length);

  const gap = 6, gx = 64, gy = 640;
  const cell = (W - 128 - gap * (cal.weeks.length - 1)) / cal.weeks.length;
  const heat = cal.weeks.map((w, wi) => w.contributionDays.map(d => {
    const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
    return `<rect x="${(gx + wi * (cell + gap)).toFixed(1)}" y="${(gy + wd * (cell + gap)).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${shades[level(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
  }).join('')).join('');

  const lgx = W - 64 - 60 - 5 * 26;
  const legend = `${meta(lgx - 14, 610, 'Less', 'end', C.dim, 12)}${shades.map((s, i) => `<rect x="${lgx + i * 26}" y="597" width="16" height="16" fill="${s}"/>`).join('')}${meta(W - 64, 610, 'More', 'end', C.dim, 12)}`;

  const lx = 1000, lw = W - 64 - lx;
  const langSvg = `${meta(lx, 278, 'Languages · by code size', 'start', C.dim, 12)}` + top.map(([n, p], i) => {
    const y = 328 + i * 54;
    return `<text class="s" x="${lx}" y="${y}" font-size="22" fill="${C.chalk}">${esc(n)}</text>${meta(lx + lw, y, `${p.toFixed(1)}%`, 'end', C.mute, 13)}
<rect x="${lx}" y="${y + 12}" width="${lw}" height="2" fill="${C.line}" fill-opacity=".1"/><rect x="${lx}" y="${y + 12}" width="${Math.max(2, (lw * p) / 100).toFixed(1)}" height="2" fill="${shades[4 - Math.min(i, 3)]}"/>`;
  }).join('');

  const updated = new Date().toISOString().slice(0, 10);
  return frame(h, {
    title: `GitHub activity: ${cal.totalContributions} contributions in the last year`, seed: 21,
    blobs: [[1300, 100, 520, 260, '#3A4048', .85], [300, 860, 600, 220, C.gunmetal, 1], [1480, 820, 320, 160, C.frost, .2]],
    body: `${header('04', 'Activity', `Updated ${updated}`, 170)}
${meta(64, 288, 'Contributions · last 12 months', 'start', C.dim, 12)}
<text class="s" x="52" y="420" font-size="150" font-weight="800" letter-spacing="-7" fill="url(#ink)">${fmt(cal.totalContributions)}</text>
${smallSvg}${langSvg}
${rule(570)}${meta(64, 610, 'Contribution calendar', 'start', C.dim, 12)}${legend}
${heat}`,
  });
}

// CLI -----------------------------------------------------------------------
const [mode = 'static', outArg] = process.argv.slice(2);
if (mode === 'static') {
  const dir = 'assets'; mkdirSync(dir, { recursive: true });
  const files = { 'hero.svg': hero(), 'work.svg': work(), 'toolkit.svg': toolkit(), 'footer.svg': footer() };
  for (const p of PROJECTS) files[`project-${p.slug}.svg`] = project(p);
  for (const [f, s] of Object.entries(files)) writeFileSync(join(dir, f), s);
  console.log('wrote', Object.keys(files).join(', '));
} else if (mode === 'stats') {
  const dir = outArg || 'dist'; mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stats.svg'), await stats());
  console.log('wrote', join(dir, 'stats.svg'));
} else {
  console.error('usage: build.mjs static | stats [dir]'); process.exit(1);
}
