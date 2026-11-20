#!/usr/bin/env node
// A validated snapshot of the profile owner's merged pull requests in the repositories marked
// `"dynamic": true` in profile.config.json (the ones with so many that listing them by hand
// would mean editing the config after every merge). Only PR numbers are stored.
// Import fetchMergedPullRequests(), or run: node scripts/contributions.mjs [data/contributions.json]
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = 100;
const MAX_PAGES = 10;

const validLogin = login => typeof login === 'string' && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login);
const validRepository = repository => typeof repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
const validNumber = value => Number.isSafeInteger(value) && value > 0;

function invalid(detail) {
  throw new Error(`Invalid merged pull request data: ${detail}.`);
}

/**
 * Every merged pull request `login` authored in `repository`, as ascending unique numbers.
 * Rejects (and changes nothing) if GitHub cannot return the complete list.
 */
export async function fetchMergedPullRequests({
  login,
  repository,
  token = process.env.GITHUB_TOKEN,
  request = fetch,
}) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('GITHUB_TOKEN is required to refresh contributions.');
  if (!validLogin(login)) throw new Error('A valid GitHub login is required.');
  if (!validRepository(repository)) throw new Error('A valid repository (owner/name) is required.');

  const numbers = new Set();
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({
      q: `author:${login} is:pr is:merged repo:${repository}`,
      per_page: String(PAGE),
      page: String(page),
    });
    let response;
    try {
      response = await request(`https://api.github.com/search/issues?${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `${login}-profile-artwork`,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error('Could not reach GitHub before the contributions request timed out.');
    }
    if (!response.ok) throw new Error(`GitHub contributions request failed (HTTP ${response.status}).`);
    let json;
    try {
      json = await response.json();
    } catch {
      throw new Error('GitHub contributions response was not valid JSON.');
    }
    if (!json || json.incomplete_results === true || !Number.isSafeInteger(json.total_count) || json.total_count < 0 || !Array.isArray(json.items)) {
      throw new Error('GitHub could not return a complete contributions response.');
    }
    total = json.total_count;
    for (const item of json.items) {
      if (!validNumber(item?.number) || !item.pull_request) invalid('an item is not a pull request');
      numbers.add(item.number);
    }
    if (numbers.size >= total || json.items.length < PAGE) break;
  }
  if (numbers.size !== total) invalid(`expected ${total} pull requests, received ${numbers.size}`);
  return [...numbers].sort((a, b) => a - b);
}

/** Validate a saved snapshot before rendering. Returns it unchanged, or throws. */
export function validateContributions(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1) invalid('unsupported snapshot schema');
  if (!validLogin(snapshot.login)) invalid('invalid snapshot login');
  if (typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))) invalid('invalid snapshot timestamp');
  if (!snapshot.repositories || typeof snapshot.repositories !== 'object') invalid('missing repositories');
  for (const [repository, prs] of Object.entries(snapshot.repositories)) {
    if (!validRepository(repository)) invalid('invalid repository');
    if (!Array.isArray(prs) || !prs.every(validNumber)) invalid('invalid pull request number');
    if (prs.some((n, i) => i > 0 && n <= prs[i - 1])) invalid('pull requests must be ascending and unique');
  }
  return snapshot;
}

async function main() {
  const [output = 'data/contributions.json', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Usage: node scripts/contributions.mjs [data/contributions.json]');
  const config = JSON.parse(await readFile(new URL('../profile.config.json', import.meta.url), 'utf8'));
  const login = process.env.PROFILE_LOGIN || config.login;
  const repositories = {};
  // Fetch and validate everything before touching the previous snapshot.
  for (const entry of config.openSource.filter(project => project.dynamic)) {
    repositories[entry.repository] = await fetchMergedPullRequests({ login, repository: entry.repository });
  }
  const snapshot = validateContributions({ schemaVersion: 1, login, updatedAt: new Date().toISOString(), repositories });
  const target = resolve(output);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Refreshed merged pull requests for ${Object.keys(repositories).length} repositories.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
