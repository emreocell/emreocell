import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMergedPullRequests, validateContributions } from './contributions.mjs';

const item = number => ({ number, pull_request: { url: 'x' } });
const reply = (items, total = items.length, extra = {}) => async () => ({
  ok: true, status: 200, json: async () => ({ total_count: total, incomplete_results: false, items, ...extra }),
});
const base = { login: 'octocat', repository: 'acme/widget', token: 't' };

test('returns the merged pull requests ascending and unique', async () => {
  const prs = await fetchMergedPullRequests({ ...base, request: reply([item(9), item(2), item(2), item(5)], 3) });
  assert.deepEqual(prs, [2, 5, 9]);
});

test('follows pagination until the reported total is complete', async () => {
  const pages = [Array.from({ length: 100 }, (_, i) => item(i + 1)), [item(101), item(102)]];
  let call = 0;
  const prs = await fetchMergedPullRequests({ ...base, request: async () => reply(pages[call++], 102)() });
  assert.equal(prs.length, 102);
  assert.equal(call, 2);
});

test('rejects an incomplete or malformed response without returning data', async () => {
  await assert.rejects(fetchMergedPullRequests({ ...base, request: reply([item(1)], 2) }), /expected 2 pull requests/);
  await assert.rejects(fetchMergedPullRequests({ ...base, request: reply([item(1)], 1, { incomplete_results: true }) }), /complete/);
  await assert.rejects(fetchMergedPullRequests({ ...base, request: reply([{ number: 1 }]) }), /not a pull request/);
  await assert.rejects(fetchMergedPullRequests({ ...base, request: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('requires a token, a login and a repository', async () => {
  await assert.rejects(fetchMergedPullRequests({ ...base, token: '' }), /GITHUB_TOKEN/);
  await assert.rejects(fetchMergedPullRequests({ ...base, login: '-bad' }), /login/);
  await assert.rejects(fetchMergedPullRequests({ ...base, repository: 'nope' }), /repository/);
});

test('validates saved snapshots', () => {
  const good = { schemaVersion: 1, login: 'octocat', updatedAt: '2026-11-20T10:00:00.000Z', repositories: { 'acme/widget': [1, 4] } };
  assert.equal(validateContributions(good), good);
  assert.throws(() => validateContributions({ ...good, repositories: { 'acme/widget': [4, 1] } }), /ascending/);
  assert.throws(() => validateContributions({ ...good, schemaVersion: 2 }), /schema/);
});
