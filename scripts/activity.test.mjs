import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fetchActivity } from './activity.mjs';

const NOW = new Date('2026-11-11T22:30:00.000Z');
const DAY = 86_400_000;

function responseData() {
  const start = new Date('2025-11-12T00:00:00.000Z');
  const weeks = [];
  for (let i = 0; i < 365; i++) {
    const date = new Date(start.getTime() + i * DAY);
    const weekday = date.getUTCDay();
    if (!weeks.length || weekday === 0) weeks.push({ contributionDays: [] });
    weeks.at(-1).contributionDays.push({
      date: date.toISOString().slice(0, 10),
      weekday,
      contributionCount: i === 364 ? 4 : 0,
    });
  }
  return { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 4, weeks } } } } };
}

function mockResponse(data, status = 200) {
  return mock.method(globalThis, 'fetch', async () => ({ ok: status >= 200 && status < 300, status, json: async () => data }));
}

afterEach(() => mock.restoreAll());

test('fetches a bounded UTC calendar and returns only the approved snapshot fields', async () => {
  const request = mockResponse(responseData());
  const snapshot = await fetchActivity({ token: 'test-only', now: NOW });
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.login, 'emreocell');
  assert.equal(snapshot.updatedAt, NOW.toISOString());
  assert.deepEqual(snapshot.range, { from: '2025-11-12', to: '2026-11-11' });
  assert.equal(snapshot.totalContributions, 4);
  assert.equal(snapshot.weeks.flatMap(w => w.contributionDays).length, 365);
  const { variables } = JSON.parse(request.mock.calls[0].arguments[1].body);
  assert.equal(variables.from, '2025-11-12T00:00:00.000Z');
  assert.equal(variables.to, NOW.toISOString());
  assert.ok(!JSON.stringify(snapshot).includes('test-only'));
});

test('trims padded calendar dates and never publishes a future day', async () => {
  const data = responseData();
  const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks;
  weeks[0].contributionDays.unshift({ date: '2025-11-11', weekday: 2, contributionCount: 0 });
  weeks.at(-1).contributionDays.push({ date: '2026-11-12', weekday: 4, contributionCount: 0 });
  mockResponse(data);
  const snapshot = await fetchActivity({ token: 'test-only', now: NOW });
  const days = snapshot.weeks.flatMap(w => w.contributionDays);
  assert.equal(days.length, 365);
  assert.equal(days[0].date, snapshot.range.from);
  assert.equal(days.at(-1).date, snapshot.range.to);
});

test('rejects partial, inconsistent, and malformed calendars', async () => {
  const mutations = [
    c => { c.totalContributions = 3; },
    c => { c.weeks[1].contributionDays.splice(2, 1); },
    c => { c.weeks[1].contributionDays[1].date = c.weeks[1].contributionDays[0].date; },
    c => { c.weeks[1].contributionDays[0].contributionCount = -1; },
    c => { c.weeks[1].contributionDays[0].contributionCount = 1.5; },
    c => { c.weeks[1].contributionDays[0].weekday = 7; },
    c => { c.weeks[1].contributionDays[0].date = '2026-02-30'; },
    c => { c.weeks.at(-1).contributionDays.pop(); },
  ];
  for (const mutate of mutations) {
    const data = responseData();
    mutate(data.data.user.contributionsCollection.contributionCalendar);
    mockResponse(data);
    await assert.rejects(fetchActivity({ token: 'test-only', now: NOW }), /Invalid GitHub activity response/);
    mock.restoreAll();
  }
});

test('HTTP and GraphQL errors fail without printing provider response details', async () => {
  mockResponse({ message: 'sensitive-provider-detail' }, 403);
  await assert.rejects(fetchActivity({ token: 'test-only', now: NOW }), error => error.message === 'GitHub activity request failed (HTTP 403).');
  mock.restoreAll();
  mockResponse({ errors: [{ message: 'sensitive-provider-detail' }] });
  await assert.rejects(fetchActivity({ token: 'test-only', now: NOW }), error => error.message === 'GitHub could not return a complete activity response.');
});

test('missing credentials cannot overwrite the last good snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profile-activity-'));
  const output = join(directory, 'activity.json');
  const original = '{"lastGood":true}\n';
  try {
    await writeFile(output, original);
    const result = spawnSync(process.execPath, [new URL('./activity.mjs', import.meta.url).pathname, output], {
      env: { ...process.env, GITHUB_TOKEN: '' }, encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GITHUB_TOKEN is required/);
    assert.equal(await readFile(output, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
