#!/usr/bin/env node
// A validated snapshot of the profile owner's GitHub contribution calendar.
// Import fetchActivity(), or run: node scripts/activity.mjs [data/activity.json]
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const QUERY = `query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
  }
}`;

function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validLogin(login) {
  return typeof login === 'string' && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login);
}

function invalid(detail) {
  throw new Error(`Invalid GitHub activity response: ${detail}.`);
}

/**
 * Fetch 365 calendar days, including today, using UTC dates throughout.
 * No repository names, private activity details, or credentials are retained.
 * A failed request rejects without modifying any files.
 */
export async function fetchActivity({
  login = 'emreocell',
  token = process.env.GITHUB_TOKEN,
  now = new Date(),
} = {}) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('GITHUB_TOKEN is required to refresh activity.');
  }
  if (!validLogin(login)) {
    throw new Error('A valid GitHub login is required.');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('A valid refresh date is required.');
  }

  const updatedAt = now.toISOString();
  const to = updatedAt.slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00.000Z`) - 364 * DAY)
    .toISOString().slice(0, 10);

  let response;
  try {
    response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': `${login}-profile-artwork`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { login, from: `${from}T00:00:00.000Z`, to: updatedAt },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach GitHub before the activity request timed out.');
  }
  if (!response.ok) {
    throw new Error(`GitHub activity request failed (HTTP ${response.status}).`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error('GitHub activity response was not valid JSON.');
  }
  if (!json || typeof json !== 'object' || (json.errors && (!Array.isArray(json.errors) || json.errors.length))) {
    throw new Error('GitHub could not return a complete activity response.');
  }
  const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar || !validCount(calendar.totalContributions)) invalid('missing contribution total');
  if (!Array.isArray(calendar.weeks) || !calendar.weeks.length || calendar.weeks.length > 54) {
    invalid('missing or oversized calendar');
  }

  const weeks = calendar.weeks.map(week => {
    if (!Array.isArray(week?.contributionDays) || !week.contributionDays.length || week.contributionDays.length > 7) {
      invalid('invalid calendar week');
    }
    const contributionDays = week.contributionDays.filter(day => {
      if (!validDate(day?.date)) invalid('invalid day');
      if (!validCount(day.contributionCount)) invalid('invalid contribution count');
      if (day.weekday !== new Date(`${day.date}T00:00:00.000Z`).getUTCDay()) invalid('invalid weekday');
      // GitHub can pad partial weeks. Never render dates outside our request.
      return day.date >= from && day.date <= to;
    }).map(({ date, contributionCount, weekday }) => ({ date, contributionCount, weekday }));
    return { contributionDays };
  }).filter(week => week.contributionDays.length);

  return validateActivity({
    schemaVersion: 1,
    login,
    updatedAt,
    range: { from, to },
    totalContributions: calendar.totalContributions,
    weeks,
  });
}

/** Validate a saved snapshot before rendering. Returns it unchanged, or throws. */
export function validateActivity(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1) invalid('unsupported snapshot schema');
  if (!validLogin(snapshot.login)) invalid('invalid snapshot login');
  if (typeof snapshot.updatedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot.updatedAt)
    || !Number.isFinite(Date.parse(snapshot.updatedAt))
    || new Date(snapshot.updatedAt).toISOString() !== snapshot.updatedAt) invalid('invalid snapshot timestamp');
  const { from, to } = snapshot.range || {};
  if (!validDate(from) || !validDate(to)) invalid('invalid snapshot range');
  if (to !== snapshot.updatedAt.slice(0, 10)) invalid('range does not end on the snapshot date');
  if (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`) !== 364 * DAY) {
    invalid('range must contain exactly 365 days');
  }
  if (!validCount(snapshot.totalContributions)) invalid('missing contribution total');
  if (!Array.isArray(snapshot.weeks) || !snapshot.weeks.length || snapshot.weeks.length > 54) {
    invalid('missing or oversized calendar');
  }

  let expectedDate = from;
  let total = 0;
  for (const [index, week] of snapshot.weeks.entries()) {
    if (!Array.isArray(week?.contributionDays) || !week.contributionDays.length || week.contributionDays.length > 7) {
      invalid('invalid calendar week');
    }
    if (index > 0 && week.contributionDays[0]?.weekday !== 0) invalid('invalid week boundary');
    for (const day of week.contributionDays) {
      if (!validDate(day?.date) || day.date < from || day.date > to) invalid('invalid or out-of-range day');
      if (day.date !== expectedDate) invalid('missing, duplicate, or unordered calendar day');
      if (!validCount(day.contributionCount)) invalid('invalid contribution count');
      if (day.weekday !== new Date(`${day.date}T00:00:00.000Z`).getUTCDay()) invalid('invalid weekday');
      expectedDate = new Date(Date.parse(`${day.date}T00:00:00.000Z`) + DAY).toISOString().slice(0, 10);
      total += day.contributionCount;
      if (!validCount(total)) invalid('oversized contribution total');
    }
  }
  const tomorrow = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY).toISOString().slice(0, 10);
  if (expectedDate !== tomorrow) invalid('incomplete date range');
  if (total !== snapshot.totalContributions) invalid('contribution total does not match the calendar');
  return snapshot;
}

async function main() {
  const [output = 'data/activity.json', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Usage: node scripts/activity.mjs [data/activity.json]');
  // Fetch and validate everything before touching the previous snapshot.
  const config = JSON.parse(await readFile(new URL('../profile.config.json', import.meta.url), 'utf8'));
  const snapshot = await fetchActivity({ login: process.env.PROFILE_LOGIN || config.login });
  const target = resolve(output);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Refreshed activity through ${snapshot.range.to}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
