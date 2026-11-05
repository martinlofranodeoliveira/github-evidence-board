import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshot } from '../fixtures/synthetic.mjs';
import { LIMITS, SnapshotError, parseSnapshot, normalizeSnapshot, evaluateSnapshot, sourceURL, buildReport, markSessionVerified, isSessionVerified } from '../src/core.mjs';

const copy = () => structuredClone(demoSnapshot);
function one(change = () => {}) {
  const snapshot = copy(); snapshot.repositories = [snapshot.repositories[0]]; change(snapshot.repositories[0], snapshot); return snapshot;
}
const verdict = (snapshot, options) => evaluateSnapshot(snapshot, options)[0].verdict;
function rejects(input, path, code) {
  assert.throws(() => parseSnapshot(typeof input === 'string' ? input : JSON.stringify(input)), error => {
    assert.ok(error instanceof SnapshotError);
    assert.equal(error.diagnostics.length, 1);
    assert.equal(error.diagnostics[0].path, path);
    assert.equal(error.diagnostics[0].code, code);
    return true;
  });
}
test('synthetic cases establish all six distinct verdicts with explicit scenario labels', () => {
  const evaluated = evaluateSnapshot(demoSnapshot);
  const actual = Object.fromEntries(evaluated.map(r => [r.repo.name, r.verdict]));
  assert.deepEqual(actual, {
    'complete-checks': 'verified_passing', 'failed-checks': 'verified_failing', 'inventory-missing': 'incomplete_metadata',
    'no-workflows': 'no_ci_configured', 'pending-check': 'unverified_offline', 'sha-mismatch': 'unverified_offline',
    'stale-copy': 'stale_snapshot', 'zero-runs': 'unverified_offline'
  });
  for (const item of evaluated) {
    assert.match(item.repo.description, /^Synthetic scenario \(/u);
    assert.equal(item.verification_basis, 'synthetic_scenario');
    assert.equal(item.session_authenticated, false);
  }
});
test('TTL is inclusive at the exact second and stale one second later', () => {
  const snapshot = one((r, s) => { s.evaluated_at_utc = '2026-01-15T12:30:00Z'; });
  assert.equal(verdict(snapshot), 'verified_passing');
  snapshot.evaluated_at_utc = '2026-01-15T12:30:01Z';
  assert.equal(verdict(snapshot), 'stale_snapshot');
});
test('zero runs are not proof of zero configured workflows', () => {
  const snapshot = one(r => { r.runs.items = []; });
  assert.equal(verdict(snapshot), 'unverified_offline');
  snapshot.repositories[0].workflow_inventory.items = [];
  snapshot.repositories[0].workflow_inventory.complete = false;
  assert.equal(verdict(snapshot), 'incomplete_metadata');
  snapshot.repositories[0].workflow_inventory.complete = true;
  assert.equal(verdict(snapshot), 'no_ci_configured');
});
test('all active workflows, latest results and current SHA are required', () => {
  const snapshot = one(r => { r.runs.items.pop(); });
  assert.equal(verdict(snapshot), 'unverified_offline', 'one successful workflow cannot stand for two');
  snapshot.repositories[0].runs.items[0].conclusion = 'failure';
  assert.equal(verdict(snapshot), 'unverified_offline', 'partial failure is not an all-workflow verified verdict');
  const newest = one(r => {
    r.runs.items.push({ ...r.runs.items[0], id: 8, updated_at_utc: '2026-01-15T11:25:00Z', status: 'queued', conclusion: null });
  });
  assert.equal(verdict(newest), 'unverified_offline');
  newest.repositories[0].runs.items.at(-1).status = 'completed';
  newest.repositories[0].runs.items.at(-1).conclusion = 'success';
  newest.repositories[0].runs.items.at(-1).head_sha = '2'.repeat(40);
  assert.equal(verdict(newest), 'unverified_offline', 'a newer head cannot borrow an old successful run');
});
test('repeated, rerun, same-second and out-of-order workflow runs never misclassify as passing', () => {
  // Valid rerun where newer run ID at later timestamp succeeds after older failure.
  const validRerun = one(r => {
    r.runs.items[0].conclusion = 'failure';
    r.runs.items.push({ ...r.runs.items[0], id: 9, updated_at_utc: '2026-01-15T11:25:00Z', conclusion: 'success' });
  });
  assert.equal(verdict(validRerun), 'verified_passing');
  // Same-second timestamp tie where an in-place rerun (lower ID) failed while a higher ID passed.
  const sameSecondConflict = one(r => {
    r.runs.items[0].conclusion = 'failure';
    r.runs.items.push({ ...r.runs.items[0], id: 9, conclusion: 'success' });
  });
  assert.equal(verdict(sameSecondConflict), 'unverified_offline');
  // Out-of-order completion: older run ID finishes later with success after a newer run ID failed fast.
  const outOfOrder = one(r => {
    r.runs.items[0].id = 10;
    r.runs.items[0].updated_at_utc = '2026-01-15T11:25:00Z';
    r.runs.items[0].conclusion = 'success';
    r.runs.items.push({ ...r.runs.items[0], id: 11, updated_at_utc: '2026-01-15T11:21:00Z', conclusion: 'failure' });
  });
  assert.equal(verdict(outOfOrder), 'unverified_offline');
  // Active in-progress run on the same source SHA alongside a completed successful run.
  const concurrentPending = one(r => {
    r.runs.items.push({ ...r.runs.items[0], id: 12, updated_at_utc: '2026-01-15T11:15:00Z', status: 'in_progress', conclusion: null });
  });
  assert.equal(verdict(concurrentPending), 'unverified_offline');
});
test('forged github_api provenance or unverified imported provenance cannot masquerade as verified evidence', () => {
  const forgedText = JSON.stringify(one(r => {
    r.provenance = 'github_api';
    r.claimed_verdict = 'verified_passing';
  }));
  const parsedForged = parseSnapshot(forgedText);
  assert.equal(isSessionVerified(parsedForged.repositories[0]), false);
  const forgedEval = evaluateSnapshot(parsedForged)[0];
  assert.equal(forgedEval.verdict, 'unverified_offline');
  assert.equal(forgedEval.session_authenticated, false);
  assert.equal(forgedEval.verification_basis, 'unauthenticated_api_claim');
  assert.ok(forgedEval.gaps.includes('claimed_verdict_mismatch'));
  // Forged github_api with empty inventory also cannot claim no_ci_configured without session authentication.
  const forgedNoCi = parseSnapshot(JSON.stringify(one(r => {
    r.provenance = 'github_api';
    r.workflow_inventory.items = [];
    r.runs.items = [];
  })));
  assert.equal(verdict(forgedNoCi), 'unverified_offline');
  // Genuine session-verified github_api record is preserved across normalizeSnapshot but stripped on JSON round-trip.
  const sessionSnap = one(r => { r.provenance = 'github_api'; });
  markSessionVerified(sessionSnap.repositories[0]);
  const sessionEval = evaluateSnapshot(sessionSnap)[0];
  assert.equal(sessionEval.verdict, 'verified_passing');
  assert.equal(sessionEval.session_authenticated, true);
  assert.equal(sessionEval.verification_basis, 'session_github_api');
  const roundTripped = parseSnapshot(JSON.stringify(sessionSnap));
  assert.equal(verdict(roundTripped), 'unverified_offline');
  // Offline imported provenance is unverified by default, preserves stale/incomplete precedence, and requires explicit context to evaluate asserted runs.
  const importedSnap = one(r => { r.provenance = 'imported'; });
  assert.equal(verdict(importedSnap), 'unverified_offline');
  assert.equal(verdict(importedSnap, { allowImportedAsserted: true }), 'verified_passing');
  assert.equal(verdict(one((r, s) => { r.provenance = 'imported'; s.evaluated_at_utc = '2026-01-15T12:30:01Z'; })), 'stale_snapshot');
  assert.equal(verdict(one(r => { r.provenance = 'imported'; r.runs.complete = false; })), 'incomplete_metadata');
  assert.equal(verdict(one(), { allowSynthetic: false }), 'unverified_offline');
});
test('session marking freezes descendants even if a trusted collector already froze the outer record', () => {
  const snapshot = one(r => { r.provenance = 'github_api'; });
  const repo = snapshot.repositories[0];
  Object.freeze(repo);
  markSessionVerified(repo);
  assert(Object.isFrozen(repo.runs));
  assert(Object.isFrozen(repo.runs.items));
  assert(Object.isFrozen(repo.runs.items[0]));
  assert.throws(() => { repo.runs.items[0].conclusion = 'failure'; }, TypeError);
  assert.equal(verdict(snapshot), 'verified_passing');
});
test('skipped, neutral, cancelled and non-completed results never imply passing', () => {
  for (const conclusion of ['skipped', 'neutral', 'cancelled', 'action_required', 'stale', null]) {
    assert.equal(verdict(one(r => { r.runs.items[0].conclusion = conclusion; })), 'unverified_offline');
  }
  assert.equal(verdict(one(r => { r.runs.complete = false; })), 'incomplete_metadata');
  assert.equal(verdict(one(r => { r.workflow_inventory.items.forEach(w => { w.state = 'disabled'; }); })), 'unverified_offline');
});
test('clock inconsistencies cannot become verified evidence', () => {
  assert.equal(verdict(one((r, s) => { s.evaluated_at_utc = '2026-01-15T11:29:59Z'; })), 'incomplete_metadata');
  assert.equal(verdict(one(r => { r.runs.items[0].updated_at_utc = '2026-01-15T11:30:01Z'; })), 'incomplete_metadata');
});
test('schema diagnostics have exact JSON paths and reject adversarial input', () => {
  rejects('{', '$', 'json');
  for (const value of ['2026-01-15T12:00:00+00:00', '2026-02-30T12:00:00Z', '2026-01-15T12:00:00.000Z', '2026-01-15T12:00:60Z']) {
    const snapshot = one(); snapshot.evaluated_at_utc = value; rejects(snapshot, '$.evaluated_at_utc', 'timestamp');
  }
  rejects(one(r => { r.claimed_verdict = 'green'; }), '$.repositories[0].claimed_verdict', 'enum');
  rejects(one(r => { r.description = 'a'.repeat(241); }), '$.repositories[0].description', 'length');
  rejects(one(r => { r.owner = '../outside'; }), '$.repositories[0].owner', 'identity');
  rejects(one(r => { r.html_url = 'javascript:alert(1)'; }), '$.repositories[0]["html_url"]', 'unknown_field');
  rejects(one(r => { r.runs.items[0].status = 'queued'; }), '$.repositories[0].runs.items[0].conclusion', 'inconsistent');
  rejects(one(r => { r.workflow_inventory.items[1].id = 1; }), '$.repositories[0].workflow_inventory.items[1]', 'duplicate');
  const excessive = one(); excessive.repositories = Array.from({ length: LIMITS.repositories + 1 }, () => excessive.repositories[0]);
  rejects(excessive, '$.repositories', 'limit');
  rejects(' '.repeat(LIMITS.snapshotBytes + 1), '$', 'limit');
  rejects('"' + 'é'.repeat(600000) + '"', '$', 'limit');
});
test('normalization clones input and ignores a valid but misleading claim', () => {
  const input = one(r => { r.claimed_verdict = 'verified_failing'; });
  const before = JSON.stringify(input);
  const normalized = normalizeSnapshot(input);
  normalized.repositories[0].description = 'changed';
  assert.equal(JSON.stringify(input), before);
  const report = buildReport(input);
  assert.equal(report.repositories[0].verdict, 'verified_passing');
  assert.deepEqual(report.repositories[0].gaps, ['claimed_verdict_mismatch']);
  assert.equal(report.repositories[0].source_url, null);
  assert.equal(sourceURL({ owner: 'Safe-Owner', name: 'safe.repo' }), 'https://github.com/Safe-Owner/safe.repo');
  assert.throws(() => sourceURL({ owner: 'https://evil.invalid', name: 'repo' }), SnapshotError);
});
