import { LIMITS, VERDICTS, SnapshotError, parseSnapshot, normalizeSnapshot, evaluateSnapshot, buildReport, reportJSON, reportMarkdown, sourceURL } from '../src/core.mjs';
import { filterState, openDetail, closeDetail } from '../src/ui-state.mjs';
import { refreshRepository } from '../src/api.mjs';
import { demoSnapshot } from '../fixtures/synthetic.mjs';

const labels = { verified_passing: 'Verified passing', verified_failing: 'Verified failing', stale_snapshot: 'Stale snapshot', incomplete_metadata: 'Incomplete metadata', unverified_offline: 'Unverified offline', no_ci_configured: 'No CI configured' };
const basisLabels = {
  session_github_api: 'Session GitHub API fetch',
  unauthenticated_api_claim: 'Unauthenticated github_api claim',
  imported_assertion: 'Imported snapshot assertion',
  synthetic_scenario: 'Synthetic scenario fixture'
};
const $ = id => document.getElementById(id);
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
let snapshot;
let evidence = [];
let generation = 0;
let detail = { selectedId: null, openerId: null };
let refreshing = false;
const filters = () => ({ search: $('search').value, status: $('status-filter').value, language: $('language-filter').value });
function clearError() {
  $('errors').hidden = true;
  $('error-list').replaceChildren();
  $('editor').setAttribute('aria-invalid', 'false');
  $('editor-error').textContent = '';
}
function showError(error, isEditor = false) {
  const diagnostics = error instanceof SnapshotError ? error.diagnostics : [{ path: '$', code: error.code ?? 'error', message: error.message ?? 'The operation failed.' }];
  $('error-list').replaceChildren(...diagnostics.map(d => el('li', `${d.path} [${d.code}]: ${d.message}`)));
  $('errors').hidden = false;
  if (isEditor) {
    $('editor').setAttribute('aria-invalid', 'true');
    $('editor-error').textContent = 'Snapshot was not applied. See the field diagnostics in the error banner.';
  }
  $('announcements').textContent = 'Operation failed. Loaded evidence is unchanged. Field diagnostics are available.';
  if ($('detail').open) {
    $('detail-status').textContent = diagnostics.map(d => d.message).join(' ');
    $('detail-status').focus();
  } else $('errors').focus();
}
function render(message = '') {
  const view = filterState(evidence, filters());
  $('results-body').replaceChildren();
  for (const item of view.rows) {
    const tr = el('tr');
    const identityCell = el('td');
    const inspect = el('button', item.id, 'repository-button');
    inspect.id = `inspect-${item.id.replace('/', '--')}`;
    inspect.setAttribute('data-repository', item.id);
    inspect.setAttribute('aria-haspopup', 'dialog');
    inspect.addEventListener('click', () => inspectRepository(item.id, inspect.id));
    identityCell.append(inspect, el('small', item.repo.language ?? 'Language unknown'));
    if (item.repo.description) identityCell.append(el('small', item.repo.description));
    const status = el('td');
    status.append(el('span', labels[item.verdict], `verdict ${item.verdict}`), el('small', basisLabels[item.verification_basis]));
    const metadata = el('td');
    metadata.append(
      el('span', `License: ${item.repo.license}`),
      el('small', `README: ${item.repo.documentation.readme} · CONTRIBUTING: ${item.repo.documentation.contributing} · SECURITY: ${item.repo.documentation.security}`)
    );
    tr.append(identityCell, status, el('td', `${item.age_seconds}s`), metadata);
    $('results-body').append(tr);
  }
  $('empty').hidden = !view.empty;
  $('result-count').textContent = view.announcement;
  $('evaluation').textContent = `Evaluated ${snapshot.evaluated_at_utc} · TTL ${snapshot.ttl_seconds}s`;
  $('state-counts').textContent = VERDICTS.map(v => `${labels[v]}: ${view.rows.filter(r => r.verdict === v).length}`).join(' · ');
  $('announcements').textContent = message ? `${message} ${view.announcement}` : view.announcement;
}
function updateLanguages() {
  const previous = $('language-filter').value;
  const names = [...new Set(snapshot.repositories.map(r => r.language).filter(Boolean))].sort();
  $('language-filter').replaceChildren();
  const all = el('option', 'All languages'); all.value = ''; $('language-filter').append(all);
  for (const name of names) { const option = el('option', name); option.value = name.toLowerCase(); $('language-filter').append(option); }
  $('language-filter').value = names.some(n => n.toLowerCase() === previous) ? previous : '';
}
function load(value, origin) {
  const next = normalizeSnapshot(value);
  snapshot = next;
  evidence = evaluateSnapshot(next);
  generation++;
  $('editor').value = JSON.stringify(next, null, 2);
  $('origin').textContent = origin;
  clearError();
  updateLanguages();
  render('Snapshot applied.');
  if (detail.selectedId) {
    const current = evidence.find(item => item.id === detail.selectedId);
    if (current) detailContent(current);
    else if ($('detail').open) $('detail').close();
  }
}
function detailContent(item) {
  $('detail-title').textContent = item.id;
  const body = $('detail-body');
  body.replaceChildren(el('p', `${labels[item.verdict]} — ${item.reason}`, `detail-verdict ${item.verdict}`));
  const facts = el('dl', undefined, 'facts');
  for (const [label, value] of [
    ['Scenario / description', item.repo.description || 'None supplied'],
    ['Verification basis', `${basisLabels[item.verification_basis]} (${item.session_authenticated ? 'fetched in this browser session' : 'not fetched in this session'})`],
    ['Declared provenance', `${item.repo.provenance} (JSON field; not independent authentication)`],
    ['Observed at UTC', item.repo.observed_at_utc], ['Evaluated at UTC', snapshot.evaluated_at_utc],
    ['Source SHA', item.repo.source_sha ?? 'Unknown'],
    ['License presence', item.repo.license],
    ['Documentation presence', `README: ${item.repo.documentation.readme}, CONTRIBUTING: ${item.repo.documentation.contributing}, SECURITY: ${item.repo.documentation.security}`],
    ['Workflow inventory', `${item.repo.workflow_inventory.complete ? 'Complete' : 'Incomplete'}; ${item.repo.workflow_inventory.items.length} workflows`],
    ['Run enumeration', item.repo.runs.complete ? 'Complete' : 'Incomplete'],
    ['Evidence gaps', item.gaps.join(', ') || 'None in this documented subset']
  ]) { facts.append(el('dt', label), el('dd', value)); }
  body.append(facts);
  if (item.repo.provenance === 'synthetic') body.append(el('p', 'Synthetic fixture: no source repository is asserted. Import a real repository snapshot to enable public API refresh.'));
  else {
    const link = el('a', 'Inspect the source repository on GitHub');
    link.href = sourceURL(item.repo); link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link);
  }
  body.append(el('h3', 'Supplied workflow inventory'));
  const inventory = el('ul');
  for (const workflow of item.repo.workflow_inventory.items) inventory.append(el('li', `${workflow.name} — ${workflow.state} (ID ${workflow.id})`));
  if (!inventory.children.length) inventory.append(el('li', 'Zero supplied workflows; completeness determines what this means.'));
  body.append(inventory, el('h3', 'Auditable repository JSON'), el('pre', JSON.stringify(item.repo, null, 2)));
  $('refresh').disabled = refreshing || item.repo.provenance === 'synthetic';
}
function inspectRepository(id, openerId) {
  const item = evidence.find(r => r.id === id);
  if (!item) return;
  detail = openDetail(id, openerId);
  $('detail-status').textContent = '';
  detailContent(item);
  $('detail').showModal();
  $('close-detail').focus();
}
$('close-detail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => {
  const result = closeDetail(detail, [...document.querySelectorAll('[data-repository]')].map(node => node.id));
  detail = result.state;
  $(result.focusId)?.focus();
});
$('refresh').addEventListener('click', async () => {
  const item = evidence.find(r => r.id === detail.selectedId);
  if (!item || refreshing || item.repo.provenance === 'synthetic') return;
  const startedGeneration = generation;
  const selectedId = item.id;
  const at = new Date().toISOString().replace(/\.[0-9]{3}Z$/u, 'Z');
  refreshing = true;
  $('refresh').disabled = true;
  $('detail-status').textContent = 'Requesting public GitHub metadata. Loaded evidence remains available.';
  $('announcements').textContent = 'Public GitHub refresh started by user.';
  try {
    const refreshed = await refreshRepository({ owner: item.repo.owner, name: item.repo.name, evaluated_at_utc: at });
    if (generation !== startedGeneration) return;
    const next = { ...snapshot, evaluated_at_utc: at, repositories: snapshot.repositories.map(r => `${r.owner}/${r.name}`.toLowerCase() === selectedId ? refreshed : r) };
    load(next, 'Session includes user-triggered GitHub API metadata; saved provenance remains a declaration, not authentication.');
    $('detail-status').textContent = `Refresh applied for ${selectedId}. Documentation presence is unknown; no file contents were fetched.`;
    $('announcements').textContent = 'Public metadata applied. Evaluation time changed for the entire snapshot.';
  } catch (error) {
    if (generation !== startedGeneration) return;
    showError(Object.assign(new Error(`Refresh for ${selectedId}: ${error.message}`), { code: error.code }));
  } finally {
    refreshing = false;
    const current = evidence.find(r => r.id === detail.selectedId);
    $('refresh').disabled = !current || current.repo.provenance === 'synthetic';
  }
});
for (const id of ['search', 'status-filter', 'language-filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => render());
$('clear-filters').addEventListener('click', () => {
  $('search').value = ''; $('status-filter').value = 'all'; $('language-filter').value = ''; render('Filters cleared.'); $('search').focus();
});
$('snapshot-form').addEventListener('submit', event => {
  event.preventDefault();
  try { load(parseSnapshot($('editor').value), 'Imported snapshot assertions. Declared provenance does not authenticate this input.'); }
  catch (error) { showError(error, true); }
});
$('editor').addEventListener('input', () => {
  generation++;
  $('announcements').textContent = 'Snapshot edits are not applied. Use Apply snapshot to validate them.';
});
$('file').addEventListener('change', async () => {
  const file = $('file').files?.[0];
  if (!file) return;
  const startedGeneration = ++generation;
  try {
    if (file.size > LIMITS.snapshotBytes) throw new SnapshotError([{ path: '$', code: 'limit', message: `Snapshot JSON must not exceed ${LIMITS.snapshotBytes} UTF-8 bytes.` }]);
    const bytes = await file.arrayBuffer();
    if (startedGeneration !== generation) return;
    if (bytes.byteLength > LIMITS.snapshotBytes) throw new SnapshotError([{ path: '$', code: 'limit', message: `Snapshot JSON must not exceed ${LIMITS.snapshotBytes} UTF-8 bytes.` }]);
    $('editor').value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    $('announcements').textContent = 'Local file copied into the editor. Use Apply snapshot to validate it.';
    $('editor').focus();
  } catch (error) {
    if (startedGeneration === generation) showError(error instanceof SnapshotError ? error : new Error('Local file could not be read as UTF-8.'), true);
  }
  finally { if (startedGeneration === generation) $('file').value = ''; }
});
$('demo').addEventListener('click', () => load(demoSnapshot, 'Synthetic demo — fictional repositories; no API request has occurred for this dataset.'));
function download(format) {
  const report = buildReport(snapshot, filters());
  const content = format === 'json' ? reportJSON(report) : reportMarkdown(report);
  const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = el('a'); anchor.href = url; anchor.download = `evidence-report.${format === 'json' ? 'json' : 'md'}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('announcements').textContent = `Filtered ${format.toUpperCase()} audit report exported locally.`;
}
$('export-json').addEventListener('click', () => download('json'));
$('export-markdown').addEventListener('click', () => download('markdown'));
for (const verdict of VERDICTS) { const option = el('option', labels[verdict]); option.value = verdict; $('status-filter').append(option); }
load(demoSnapshot, 'Synthetic demo — fictional repositories; no API request has occurred for this dataset.');
