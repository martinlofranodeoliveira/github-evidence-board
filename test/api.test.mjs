import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshRepository, RefreshError, API_LIMITS, GITHUB_API_VERSION } from '../src/api.mjs';
import { evaluateSnapshot, parseSnapshot, normalizeSnapshot, buildReport, isSessionVerified } from '../src/core.mjs';

const SHA = '1'.repeat(40);
const at = '2026-01-15T12:00:00Z';
const input = { owner: 'fixture-owner', name: 'fixture-repo', evaluated_at_utc: at };
const meta = { private: false, owner: { login: input.owner }, name: input.name, default_branch: 'main', language: 'JavaScript', description: 'Synthetic API response', license: { spdx_id: 'MIT' }, html_url: 'javascript:untrusted()' };
const run = { id: 1, workflow_id: 1, head_sha: SHA, status: 'completed', conclusion: 'success', updated_at: '2026-01-15T11:59:00Z' };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fake(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url); calls.push({ parsed, options });
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-GitHub-Api-Version'], GITHUB_API_VERSION);
    assert.equal(GITHUB_API_VERSION, '2026-03-10');
    if (parsed.pathname.endsWith('/actions/workflows')) return json(overrides.workflows ?? { total_count: 1, workflows: [{ id: 1, name: 'Checks', state: 'active' }] });
    if (parsed.pathname.endsWith('/actions/runs')) {
      assert.equal(parsed.searchParams.get('head_sha'), SHA);
      assert.equal(parsed.searchParams.get('branch'), 'main');
      return json(overrides.runs ?? { total_count: 1, workflow_runs: [run] });
    }
    if (parsed.pathname.endsWith('/commits/main')) return json({ sha: SHA });
    return json(overrides.meta ?? meta);
  };
  return { calls, fetchImpl };
}
function verdict(repo) { return evaluateSnapshot({ schema_version: '0.1.0', evaluated_at_utc: at, ttl_seconds: 3600, repositories: [repo] })[0].verdict; }
test('explicit public refresh reads inventory and current-head runs; marks session authentication and ignores upstream URLs', async () => {
  const mock = fake();
  const repo = await refreshRepository(input, mock);
  assert.equal(mock.calls.length, 5);
  assert.equal(repo.provenance, 'github_api');
  assert.equal(isSessionVerified(repo), true);
  assert.equal(Object.isFrozen(repo), true);
  assert.equal(repo.source_sha, SHA);
  assert.equal(repo.observed_at_utc, at);
  assert.equal(repo.html_url, undefined);
  assert.deepEqual(repo.documentation, { readme: 'unknown', contributing: 'unknown', security: 'unknown' });
  assert.equal(verdict(repo), 'verified_passing');
  // Serializing and re-importing via parseSnapshot strips session authentication.
  const reimported = parseSnapshot(JSON.stringify({ schema_version: '0.1.0', evaluated_at_utc: at, ttl_seconds: 3600, repositories: [repo] }));
  assert.equal(isSessionVerified(reimported.repositories[0]), false);
  assert.equal(evaluateSnapshot(reimported)[0].verdict, 'unverified_offline');
  // NOASSERTION license metadata is never claimed present.
  const noAssertionLicense = await refreshRepository(input, fake({ meta: { ...meta, license: { spdx_id: 'NOASSERTION', key: 'other' } } }));
  assert.equal(noAssertionLicense.license, 'unknown');
});
test('collector session evidence survives the full normalize/evaluate/filter/report path but never JSON import', async () => {
  const repo = await refreshRepository(input, fake());
  let snapshot = { schema_version: '0.1.0', evaluated_at_utc: at, ttl_seconds: 3600, repositories: [repo] };
  for (let index = 0; index < 3; index++) snapshot = normalizeSnapshot(snapshot);
  const filters = { search: 'FIXTURE', status: 'verified_passing', language: 'javascript' };
  const report = buildReport(snapshot, filters);
  assert.equal(report.count, 1);
  assert.equal(report.repositories[0].session_authenticated, true);
  assert.equal(report.repositories[0].verification_basis, 'session_github_api');
  assert(Object.isFrozen(snapshot.repositories[0].runs.items[0]));
  const reimported = parseSnapshot(JSON.stringify(snapshot));
  assert.equal(buildReport(reimported, filters).count, 0);
  assert.equal(buildReport(reimported).repositories[0].session_authenticated, false);
  assert.equal(buildReport(reimported).repositories[0].verdict, 'unverified_offline');
});
test('zero API runs are unverified; only complete empty inventory proves no workflows', async () => {
  const noRuns = { total_count: 0, workflow_runs: [] };
  assert.equal(verdict(await refreshRepository(input, fake({ runs: noRuns }))), 'unverified_offline');
  assert.equal(verdict(await refreshRepository(input, fake({ workflows: { total_count: 0, workflows: [] }, runs: noRuns }))), 'no_ci_configured');
  const pending = { ...run, status: 'in_progress', conclusion: null };
  assert.equal(verdict(await refreshRepository(input, fake({ runs: { total_count: 1, workflow_runs: [pending] } }))), 'unverified_offline');
});
test('403, 429 and network failures have actionable non-secret diagnostics', async () => {
  for (const status of [403, 429]) {
    await assert.rejects(refreshRepository(input, { fetchImpl: async () => new Response('denied', { status }) }), error => error instanceof RefreshError && error.code === 'rate_limited' && error.message.includes(String(status)));
  }
  await assert.rejects(refreshRepository(input, { fetchImpl: async () => { throw new TypeError('offline'); } }), error => error.code === 'network');
});
test('unsafe identities never reach fetch and response bytes are capped', async () => {
  let requests = 0;
  await assert.rejects(refreshRepository({ ...input, owner: 'evil.invalid/path' }, { fetchImpl: async () => { requests++; } }));
  assert.equal(requests, 0);
  await assert.rejects(refreshRepository(input, { fetchImpl: async () => new Response(' '.repeat(API_LIMITS.responseBytes + 1)) }), error => error.code === 'response_limit');
  await assert.rejects(refreshRepository(input, { fetchImpl: async () => new Response('{}', { headers: { 'content-length': '9999999' } }) }), error => error.code === 'response_limit');
});
test('bounded workflow pagination cannot yield a passing verdict from a partial inventory', async () => {
  let pages = 0;
  const base = fake();
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/actions/workflows')) {
      pages++;
      const page = Number(parsed.searchParams.get('page'));
      return json({ total_count: 101, workflows: Array.from({ length: 50 }, (_, i) => ({ id: (page - 1) * 50 + i + 1, name: 'Synthetic check', state: 'active' })) });
    }
    return base.fetchImpl(url, options);
  };
  const repo = await refreshRepository(input, { fetchImpl });
  assert.equal(pages, 2);
  assert.equal(repo.workflow_inventory.items.length, 100);
  assert.equal(repo.workflow_inventory.complete, false);
  assert.equal(verdict(repo), 'incomplete_metadata');
});
test('bounded run pagination, duplicate pages and moving heads stay conservative', async () => {
  const base = fake();
  let pages = 0;
  const repo = await refreshRepository(input, { fetchImpl: async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/actions/runs')) {
      pages++;
      const page = Number(parsed.searchParams.get('page'));
      return json({ total_count: 201, workflow_runs: Array.from({ length: 50 }, (_, i) => ({ ...run, id: (page - 1) * 50 + i + 1 })) });
    }
    return base.fetchImpl(url, options);
  } });
  assert.equal(pages, 4);
  assert.equal(repo.runs.complete, false);
  assert.equal(verdict(repo), 'incomplete_metadata');
  const repeated = await refreshRepository(input, fake({ workflows: { total_count: 2, workflows: [{ id: 1, name: 'Check', state: 'active' }, { id: 1, name: 'Check', state: 'active' }] } }));
  assert.equal(repeated.workflow_inventory.complete, false);
  let commits = 0;
  await assert.rejects(refreshRepository(input, { fetchImpl: async (url, options) => {
    if (new URL(url).pathname.endsWith('/commits/main') && ++commits === 2) return json({ sha: '2'.repeat(40) });
    return base.fetchImpl(url, options);
  } }), error => error.code === 'head_changed');
});
test('API shape and SHA mismatches cannot silently become passing evidence', async () => {
  await assert.rejects(refreshRepository(input, fake({ runs: { total_count: 1, workflow_runs: [{ ...run, head_sha: '2'.repeat(40) }] } })), error => error.code === 'invalid_response');
  await assert.rejects(refreshRepository(input, fake({ runs: { total_count: 1, workflow_runs: [{ ...run, status: null }] } })), error => error.code === 'invalid_response');
  await assert.rejects(refreshRepository(input, fake({ meta: { ...meta, private: true } })), error => error.code === 'invalid_response');
});
