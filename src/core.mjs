export const VERSION = '0.1.0';
export const LIMITS = Object.freeze({ snapshotBytes: 1048576, repositories: 100, workflows: 100, runs: 200, ttlSeconds: 2592000 });
export const VERDICTS = Object.freeze(['verified_passing', 'verified_failing', 'stale_snapshot', 'incomplete_metadata', 'unverified_offline', 'no_ci_configured']);
export const NOTICE = 'Snapshot assertions only; not independently authenticated. Point-in-time metadata does not certify quality, security, compliance, or contract eligibility.';
const PRESENCE = ['present', 'absent', 'unknown'];
const CONCLUSIONS = ['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'startup_failure', 'stale'];
const BAD = new Set(['failure', 'timed_out', 'startup_failure']);
const SESSION_VERIFIED = new WeakSet();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export class SnapshotError extends Error {
  constructor(diagnostics) {
    super(diagnostics.map(d => `${d.path}: ${d.message}`).join('\n'));
    this.name = 'SnapshotError';
    this.diagnostics = diagnostics;
  }
}
function fail(path, code, message) { throw new SnapshotError([{ path, code, message }]); }
function object(value, path, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'type', 'Expected an object.');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}[${JSON.stringify(key)}]`, 'unknown_field', 'Unknown field.');
  }
  return value;
}
function text(value, path, max, min = 0) {
  if (typeof value !== 'string') fail(path, 'type', 'Expected a string.');
  if (value.length < min || value.length > max) fail(path, 'length', `Expected ${min} to ${max} UTF-16 code units.`);
  if (/[\u0000-\u001f\u007f]/u.test(value)) fail(path, 'control_character', 'Control characters are not allowed.');
  return value;
}
function enumeration(value, path, choices) {
  if (!choices.includes(value)) fail(path, 'enum', `Expected one of: ${choices.join(', ')}.`);
  return value;
}
function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'type', 'Expected a boolean.');
  return value;
}
function integer(value, path, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, 'range', `Expected a safe integer from ${min} to ${max}.`);
  return value;
}
function list(value, path, max) {
  if (!Array.isArray(value)) fail(path, 'type', 'Expected an array.');
  if (value.length > max) fail(path, 'limit', `At most ${max} items are allowed.`);
  return value;
}
function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  if (Array.isArray(value)) value.forEach(item => freezeDeep(item, seen));
  else Object.values(value).forEach(item => freezeDeep(item, seen));
  return value;
}
export function markSessionVerified(repo) {
  if (!repo || typeof repo !== 'object' || repo.provenance !== 'github_api') fail('$', 'provenance', 'Only github_api repository records can be marked as session-verified.');
  freezeDeep(repo);
  SESSION_VERIFIED.add(repo);
  return repo;
}
export function isSessionVerified(repo) {
  return Boolean(repo && typeof repo === 'object' && repo.provenance === 'github_api' && SESSION_VERIFIED.has(repo));
}
export function timestamp(value, path = '$.evaluated_at_utc') {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/u.test(value) || Number(value.slice(0, 4)) < 1970) fail(path, 'timestamp', 'Expected a real UTC timestamp YYYY-MM-DDTHH:mm:ssZ, year 1970–9999.');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== value) fail(path, 'timestamp', 'Expected a real UTC timestamp YYYY-MM-DDTHH:mm:ssZ, year 1970–9999.');
  return value;
}
export function identity(owner, name, path = '$') {
  text(owner, `${path}.owner`, 39, 1);
  text(name, `${path}.name`, 100, 1);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(owner)) fail(`${path}.owner`, 'identity', 'Expected an ASCII GitHub owner with alphanumeric ends.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) fail(`${path}.name`, 'identity', 'Expected an ASCII repository name beginning with an alphanumeric character.');
  return { owner, name };
}
function sha(value, path, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) fail(path, 'sha', 'Expected a lowercase 40-character hexadecimal SHA.');
  return value;
}
function unique(items, key, path) {
  const seen = new Set();
  items.forEach((item, index) => {
    const value = key(item);
    if (seen.has(value)) fail(`${path}[${index}]`, 'duplicate', 'Duplicate identity.');
    seen.add(value);
  });
}
function repository(value, path) {
  const r = object(value, path, ['owner', 'name', 'description', 'language', 'source_sha', 'observed_at_utc', 'provenance', 'license', 'documentation', 'workflow_inventory', 'runs', 'claimed_verdict']);
  const id = identity(r.owner, r.name, path);
  const doc = object(r.documentation, `${path}.documentation`, ['readme', 'contributing', 'security']);
  const inv = object(r.workflow_inventory, `${path}.workflow_inventory`, ['complete', 'items']);
  const runs = object(r.runs, `${path}.runs`, ['complete', 'items']);
  const workflows = list(inv.items, `${path}.workflow_inventory.items`, LIMITS.workflows).map((item, i) => {
    const p = `${path}.workflow_inventory.items[${i}]`;
    object(item, p, ['id', 'name', 'state']);
    return { id: integer(item.id, `${p}.id`, 1), name: text(item.name, `${p}.name`, 120, 1), state: enumeration(item.state, `${p}.state`, ['active', 'disabled']) };
  });
  unique(workflows, item => item.id, `${path}.workflow_inventory.items`);
  const runItems = list(runs.items, `${path}.runs.items`, LIMITS.runs).map((item, i) => {
    const p = `${path}.runs.items[${i}]`;
    object(item, p, ['id', 'workflow_id', 'head_sha', 'status', 'conclusion', 'updated_at_utc']);
    const status = enumeration(item.status, `${p}.status`, ['queued', 'in_progress', 'completed', 'unknown']);
    const conclusion = item.conclusion === null ? null : enumeration(item.conclusion, `${p}.conclusion`, CONCLUSIONS);
    if (status !== 'completed' && conclusion !== null) fail(`${p}.conclusion`, 'inconsistent', 'A non-completed run must have a null conclusion.');
    return { id: integer(item.id, `${p}.id`, 1), workflow_id: integer(item.workflow_id, `${p}.workflow_id`, 1), head_sha: sha(item.head_sha, `${p}.head_sha`), status, conclusion, updated_at_utc: timestamp(item.updated_at_utc, `${p}.updated_at_utc`) };
  });
  unique(runItems, item => item.id, `${path}.runs.items`);
  const normalized = {
    ...id,
    description: text(r.description, `${path}.description`, 240),
    language: r.language === null ? null : text(r.language, `${path}.language`, 40, 1),
    source_sha: sha(r.source_sha, `${path}.source_sha`, true),
    observed_at_utc: timestamp(r.observed_at_utc, `${path}.observed_at_utc`),
    provenance: enumeration(r.provenance, `${path}.provenance`, ['synthetic', 'imported', 'github_api']),
    license: enumeration(r.license, `${path}.license`, PRESENCE),
    documentation: Object.fromEntries(['readme', 'contributing', 'security'].map(k => [k, enumeration(doc[k], `${path}.documentation.${k}`, PRESENCE)])),
    workflow_inventory: { complete: boolean(inv.complete, `${path}.workflow_inventory.complete`), items: workflows },
    runs: { complete: boolean(runs.complete, `${path}.runs.complete`), items: runItems },
    claimed_verdict: r.claimed_verdict === undefined || r.claimed_verdict === null ? null : enumeration(r.claimed_verdict, `${path}.claimed_verdict`, VERDICTS)
  };
  return isSessionVerified(value) ? markSessionVerified(normalized) : normalized;
}
export function normalizeSnapshot(value) {
  const root = object(value, '$', ['schema_version', 'evaluated_at_utc', 'ttl_seconds', 'repositories']);
  enumeration(root.schema_version, '$.schema_version', [VERSION]);
  const evaluated = timestamp(root.evaluated_at_utc);
  const ttl = integer(root.ttl_seconds, '$.ttl_seconds', 1, LIMITS.ttlSeconds);
  const repositories = list(root.repositories, '$.repositories', LIMITS.repositories).map((r, i) => repository(r, `$.repositories[${i}]`));
  unique(repositories, r => `${r.owner}/${r.name}`.toLowerCase(), '$.repositories');
  return { schema_version: VERSION, evaluated_at_utc: evaluated, ttl_seconds: ttl, repositories };
}
export function parseSnapshot(input) {
  if (typeof input !== 'string') fail('$', 'type', 'Expected JSON text.');
  if (input.length > LIMITS.snapshotBytes || new TextEncoder().encode(input).length > LIMITS.snapshotBytes) fail('$', 'limit', `Snapshot JSON must not exceed ${LIMITS.snapshotBytes} UTF-8 bytes.`);
  let value;
  try { value = JSON.parse(input); } catch { fail('$', 'json', 'Malformed JSON.'); }
  return normalizeSnapshot(value);
}
export function repositoryId(repo) { return `${repo.owner}/${repo.name}`.toLowerCase(); }
export function sourceURL(repo) {
  identity(repo.owner, repo.name);
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}
function normalizeContext(options = {}) {
  object(options, '$.context', ['allowSynthetic', 'allowImportedAsserted', 'allowUnauthenticatedGitHubApi']);
  return {
    allowSynthetic: options.allowSynthetic === undefined ? true : boolean(options.allowSynthetic, '$.context.allowSynthetic'),
    allowImportedAsserted: options.allowImportedAsserted === undefined ? false : boolean(options.allowImportedAsserted, '$.context.allowImportedAsserted'),
    allowUnauthenticatedGitHubApi: options.allowUnauthenticatedGitHubApi === undefined ? false : boolean(options.allowUnauthenticatedGitHubApi, '$.context.allowUnauthenticatedGitHubApi')
  };
}
function workflowOutcome(workflow, repo) {
  const wRuns = repo.runs.items.filter(r => r.workflow_id === workflow.id);
  if (!wRuns.length) return 'unverified';
  // Any non-completed run on the evaluated source SHA means current-source CI is still pending.
  if (wRuns.some(r => r.head_sha === repo.source_sha && r.status !== 'completed')) return 'unverified';
  const byTime = [...wRuns].sort((a, b) => compare(b.updated_at_utc, a.updated_at_utc) || b.id - a.id)[0];
  const byId = [...wRuns].sort((a, b) => b.id - a.id)[0];
  const tiedLatest = wRuns.filter(r => r.updated_at_utc === byTime.updated_at_utc);
  const candidates = [...new Set([...tiedLatest, byId])];
  for (const r of candidates) {
    if (r.head_sha !== repo.source_sha || r.status !== 'completed' || (r.conclusion !== 'success' && !BAD.has(r.conclusion))) return 'unverified';
  }
  const failed = candidates.some(r => BAD.has(r.conclusion));
  const passed = candidates.some(r => r.conclusion === 'success');
  if (failed && passed) return 'unverified';
  return failed ? 'failing' : 'passing';
}
function verdictFor(repo, evaluated, ttl, context) {
  const observed = Date.parse(repo.observed_at_utc);
  const age = (evaluated - observed) / 1000;
  if (age < 0 || repo.runs.items.some(r => Date.parse(r.updated_at_utc) > observed)) return ['incomplete_metadata', 'Evidence timestamps are inconsistent with observation or evaluation time.'];
  if (age > ttl) return ['stale_snapshot', 'Snapshot age exceeds the explicit TTL.'];
  if (!repo.source_sha || !repo.workflow_inventory.complete) return ['incomplete_metadata', 'Source SHA or complete workflow inventory is missing.'];
  if (repo.workflow_inventory.items.length > 0 && !repo.runs.complete) return ['incomplete_metadata', 'Run enumeration is incomplete.'];
  if (repo.provenance === 'github_api' && !isSessionVerified(repo) && !context.allowUnauthenticatedGitHubApi) {
    return ['unverified_offline', 'Declared github_api provenance in imported JSON is not authenticated by a live session fetch.'];
  }
  if (repo.provenance === 'imported' && !context.allowImportedAsserted) {
    return ['unverified_offline', 'Offline imported snapshot assertions are not independently verified; refresh from GitHub to verify live repository state.'];
  }
  if (repo.provenance === 'synthetic' && !context.allowSynthetic) {
    return ['unverified_offline', 'Synthetic fixture assertions are disabled in this evaluation context.'];
  }
  if (repo.workflow_inventory.items.length === 0) return ['no_ci_configured', 'The complete supplied workflow inventory explicitly contains zero workflows.'];
  const active = repo.workflow_inventory.items.filter(w => w.state === 'active');
  if (!active.length) return ['unverified_offline', 'Only disabled workflows are inventoried; no passing CI is established.'];
  const outcomes = active.map(w => workflowOutcome(w, repo));
  if (outcomes.some(outcome => outcome === 'unverified')) return ['unverified_offline', 'Every active workflow needs an unambiguous latest, SHA-matching, completed success or failure result.'];
  if (outcomes.some(outcome => outcome === 'failing')) return ['verified_failing', 'All active workflows have conclusive current-source runs; at least one failed.'];
  return ['verified_passing', 'All active workflows have latest completed successful runs matching the source SHA.'];
}
function verificationBasis(repo) {
  if (isSessionVerified(repo)) return 'session_github_api';
  if (repo.provenance === 'github_api') return 'unauthenticated_api_claim';
  if (repo.provenance === 'synthetic') return 'synthetic_scenario';
  return 'imported_assertion';
}
function assess(repo, snapshot, context) {
  const [verdict, reason] = verdictFor(repo, Date.parse(snapshot.evaluated_at_utc), snapshot.ttl_seconds, context);
  const gaps = [];
  if (verdict !== 'verified_passing') gaps.push(`ci.${verdict}`);
  if (repo.license !== 'present') gaps.push(`license.${repo.license}`);
  for (const key of ['readme', 'contributing', 'security']) if (repo.documentation[key] !== 'present') gaps.push(`documentation.${key}.${repo.documentation[key]}`);
  if (repo.claimed_verdict !== null && repo.claimed_verdict !== verdict) gaps.push('claimed_verdict_mismatch');
  return {
    id: repositoryId(repo),
    repo,
    verdict,
    reason,
    session_authenticated: isSessionVerified(repo),
    verification_basis: verificationBasis(repo),
    age_seconds: (Date.parse(snapshot.evaluated_at_utc) - Date.parse(repo.observed_at_utc)) / 1000,
    gaps: gaps.sort(compare)
  };
}
export function evaluateSnapshot(input, options = {}) {
  const snapshot = normalizeSnapshot(input);
  const context = normalizeContext(options);
  return snapshot.repositories.map(repo => assess(repo, snapshot, context)).sort((a, b) => compare(a.id, b.id));
}
export function normalizeFilters(filters = {}) {
  object(filters, '$.filters', ['search', 'status', 'language']);
  return {
    search: text(filters.search ?? '', '$.filters.search', 240).trim().toLowerCase(),
    status: enumeration(filters.status ?? 'all', '$.filters.status', ['all', ...VERDICTS]),
    language: text(filters.language ?? '', '$.filters.language', 40).trim().toLowerCase()
  };
}
export function filterEvidence(evidence, input = {}) {
  const filters = normalizeFilters(input);
  return evidence.filter(item => (filters.status === 'all' || item.verdict === filters.status) && (!filters.language || (item.repo.language ?? '').toLowerCase() === filters.language) && (!filters.search || `${item.id} ${item.repo.description} ${item.repo.language ?? ''}`.toLowerCase().includes(filters.search)));
}
export function buildReport(input, rawFilters = {}, options = {}) {
  const snapshot = normalizeSnapshot(input);
  const filters = normalizeFilters(rawFilters);
  const selected = filterEvidence(evaluateSnapshot(snapshot, options), filters);
  const counts = Object.fromEntries(VERDICTS.map(v => [v, 0]));
  const gaps = new Map();
  for (const item of selected) {
    counts[item.verdict]++;
    for (const gap of item.gaps) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
  }
  return {
    report_version: VERSION,
    evaluated_at_utc: snapshot.evaluated_at_utc,
    ttl_seconds: snapshot.ttl_seconds,
    notice: NOTICE,
    filters,
    count: selected.length,
    counts,
    repositories: selected.map(item => ({
      repository: item.id,
      source_url: item.repo.provenance === 'synthetic' ? null : sourceURL(item.repo),
      declared_provenance: item.repo.provenance,
      session_authenticated: item.session_authenticated,
      verification_basis: item.verification_basis,
      observed_at_utc: item.repo.observed_at_utc,
      source_sha: item.repo.source_sha,
      age_seconds: item.age_seconds,
      verdict: item.verdict,
      reason: item.reason,
      license: item.repo.license,
      documentation: item.repo.documentation,
      gaps: item.gaps
    })),
    gap_summary: [...gaps.entries()].sort(([a], [b]) => compare(a, b)).map(([gap, count]) => ({ gap, count }))
  };
}
export function reportJSON(report) { return `${JSON.stringify(report, null, 2)}\n`; }
export function reportMarkdown(report) {
  const lines = ['# Repository evidence audit', '', `Evaluated at: \`${report.evaluated_at_utc}\` · TTL: ${report.ttl_seconds} seconds.`, '', report.notice, '', `Filters: search=${JSON.stringify(report.filters.search)} status=${JSON.stringify(report.filters.status)} language=${JSON.stringify(report.filters.language)}.`, `Selected repositories: ${report.count}.`, '', '| Repository | Verdict | Evidence basis | Source SHA | Age (s) | Evidence gaps |', '| --- | --- | --- | --- | ---: | --- |'];
  // Filter strings are prose, not Markdown syntax. Escape their punctuation below.
  lines[6] = lines[6].replace(/[\\`*_{}[\]<>|]/gu, '\\$&');
  for (const item of report.repositories) lines.push(`| ${item.repository} | ${item.verdict} | ${item.verification_basis} | ${item.source_sha ?? 'unknown'} | ${item.age_seconds} | ${item.gaps.join(', ') || 'none'} |`);
  if (!report.count) lines.push('| No repositories match these filters | — | — | — | — | — |');
  lines.push('', '## Evidence gap summary', '');
  if (report.gap_summary.length) {
    for (const item of report.gap_summary) lines.push(`- ${item.gap}: ${item.count}`);
  } else lines.push('No evidence gaps in the selected view.');
  return `${lines.join('\n')}\n`;
}
