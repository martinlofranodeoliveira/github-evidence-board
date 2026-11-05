import { identity, timestamp, normalizeSnapshot, markSessionVerified, VERSION } from './core.mjs';

export const GITHUB_API_VERSION = '2026-03-10';
export const API_LIMITS = Object.freeze({ responseBytes: 524288, workflowPages: 2, runPages: 4, pageSize: 50, maxRequests: 9, timeoutMs: 15000 });
export class RefreshError extends Error {
  constructor(code, message) { super(message); this.name = 'RefreshError'; this.code = code; }
}
const invalid = () => { throw new RefreshError('invalid_response', 'GitHub returned unsupported or inconsistent metadata. Loaded evidence was not changed.'); };
function record(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value; }
function count(value) { if (!Number.isSafeInteger(value) || value < 0) invalid(); return value; }
function short(value, max) { if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid(); return value; }
function commitSHA(data) {
  const value = record(data).sha;
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) invalid();
  return value;
}
function licensePresence(rawLicense) {
  if (rawLicense === null) return 'unknown';
  const license = record(rawLicense);
  const spdx = typeof license.spdx_id === 'string' ? license.spdx_id.trim() : '';
  const key = typeof license.key === 'string' ? license.key.trim() : '';
  if ((spdx && spdx !== 'NOASSERTION') || (key && key !== 'other')) return 'present';
  return 'unknown';
}
async function boundedJSON(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/u.test(length) || Number(length) > API_LIMITS.responseBytes)) throw new RefreshError('response_limit', 'GitHub response exceeded the byte limit. Loaded evidence was not changed.');
  if (!response.body || typeof response.body.getReader !== 'function') invalid();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > API_LIMITS.responseBytes) {
        await reader.cancel();
        throw new RefreshError('response_limit', 'GitHub response exceeded the byte limit. Loaded evidence was not changed.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); } catch { invalid(); }
}

// No request is made until this function is explicitly called. The caller supplies evaluation time.
export async function refreshRepository({ owner, name, evaluated_at_utc }, { fetchImpl = globalThis.fetch } = {}) {
  identity(owner, name);
  timestamp(evaluated_at_utc);
  if (typeof fetchImpl !== 'function') throw new RefreshError('unsupported', 'This environment does not provide fetch.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_LIMITS.timeoutMs);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  let requests = 0;
  async function get(suffix) {
    if (++requests > API_LIMITS.maxRequests) throw new RefreshError('request_limit', 'Refresh request budget exhausted.');
    const response = await fetchImpl(`${base}${suffix}`, {
      method: 'GET', credentials: 'omit', redirect: 'error', mode: 'cors', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GITHUB_API_VERSION }
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => {});
      if (response.status === 403 || response.status === 429) throw new RefreshError('rate_limited', `GitHub returned HTTP ${response.status}: rate limited or access restricted. Try again manually later; loaded evidence was not changed.`);
      throw new RefreshError('http', `GitHub returned HTTP ${response.status}. Loaded evidence was not changed.`);
    }
    return boundedJSON(response);
  }
  async function collection(path, key, maxPages, query = '') {
    const items = [];
    let expected = null;
    let stable = true;
    const ids = new Set();
    for (let page = 1; page <= maxPages; page++) {
      const data = record(await get(`${path}?per_page=50&page=${page}${query}`));
      const total = count(data.total_count);
      if (expected === null) expected = total;
      else if (expected !== total) stable = false;
      const batch = data[key];
      if (!Array.isArray(batch) || batch.length > API_LIMITS.pageSize) invalid();
      for (const item of batch) {
        record(item);
        if (!Number.isSafeInteger(item.id) || item.id < 1) invalid();
        if (ids.has(item.id)) { stable = false; continue; }
        ids.add(item.id);
        items.push(item);
      }
      if (batch.length < API_LIMITS.pageSize || items.length >= total) return { complete: stable && items.length === total, items };
    }
    return { complete: false, items };
  }
  try {
    const meta = record(await get(''));
    if (meta.private !== false || typeof meta.name !== 'string' || typeof meta.owner?.login !== 'string' || `${meta.owner.login}/${meta.name}`.toLowerCase() !== `${owner}/${name}`.toLowerCase()) invalid();
    const branch = short(meta.default_branch, 200);
    const commitPath = `/commits/${encodeURIComponent(branch)}`;
    const sourceSHA = commitSHA(await get(commitPath));
    const inventory = await collection('/actions/workflows', 'workflows', API_LIMITS.workflowPages);
    const runs = await collection('/actions/runs', 'workflow_runs', API_LIMITS.runPages, `&branch=${encodeURIComponent(branch)}&head_sha=${sourceSHA}`);
    const finalSHA = commitSHA(await get(commitPath));
    if (sourceSHA !== finalSHA) throw new RefreshError('head_changed', 'The default-branch head changed during refresh. Retry explicitly; loaded evidence was not changed.');
    const workflows = inventory.items.map(item => {
      const state = short(item.state, 40);
      if (!['active', 'disabled_manually', 'disabled_inactivity', 'disabled_fork', 'deleted'].includes(state)) invalid();
      return { id: item.id, name: short(item.name, 120), state: state === 'active' ? 'active' : 'disabled' };
    });
    const runItems = runs.items.map(item => {
      const rawStatus = short(item.status, 40);
      // Unknown new statuses cannot become a passing verdict.
      const status = ['queued', 'in_progress', 'completed'].includes(rawStatus) ? rawStatus : 'unknown';
      const conclusion = status === 'completed' ? item.conclusion : null;
      if (item.head_sha !== sourceSHA) invalid();
      return { id: item.id, workflow_id: item.workflow_id, head_sha: item.head_sha, status, conclusion, updated_at_utc: item.updated_at };
    });
    const repo = {
      owner, name,
      description: typeof meta.description === 'string' ? meta.description.slice(0, 240).replace(/[\u0000-\u001f\u007f]/gu, ' ') : '',
      language: meta.language === null ? null : short(meta.language, 40),
      source_sha: sourceSHA, observed_at_utc: evaluated_at_utc, provenance: 'github_api',
      license: licensePresence(meta.license ?? null),
      documentation: { readme: 'unknown', contributing: 'unknown', security: 'unknown' },
      workflow_inventory: { complete: inventory.complete, items: workflows },
      runs: { complete: runs.complete, items: runItems }, claimed_verdict: null
    };
    try {
      const normalized = normalizeSnapshot({ schema_version: VERSION, evaluated_at_utc, ttl_seconds: 3600, repositories: [repo] }).repositories[0];
      return markSessionVerified(normalized);
    } catch { invalid(); }
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    if (controller.signal.aborted) throw new RefreshError('timeout', 'GitHub refresh timed out after 15 seconds. Loaded evidence was not changed.');
    throw new RefreshError('network', 'GitHub refresh failed because of a network or browser access error. Loaded evidence was not changed.');
  } finally { clearTimeout(timer); }
}
