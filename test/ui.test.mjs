import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { demoSnapshot } from '../fixtures/synthetic.mjs';
import { evaluateSnapshot, buildReport, reportJSON, reportMarkdown } from '../src/core.mjs';
import { filterState, openDetail, closeDetail } from '../src/ui-state.mjs';

const evidence = evaluateSnapshot(demoSnapshot);
test('filter intersections and explicit empty state use the same selection as export', () => {
  const filters = { search: 'CHECKS', status: 'verified_failing', language: 'go' };
  const view = filterState(evidence, filters);
  assert.equal(view.empty, false);
  assert.deepEqual(view.rows.map(r => r.repo.name), ['failed-checks']);
  assert.equal(buildReport(demoSnapshot, filters).count, 1);
  const empty = filterState(evidence, { ...filters, language: 'Python' });
  assert.equal(empty.empty, true);
  assert.equal(empty.announcement, '0 of 8 repositories match.');
});
test('detail closure restores the opener or a focusable results heading after filtering', () => {
  const opened = openDetail('synthetic-evidence/complete-checks', 'opener');
  assert.deepEqual(closeDetail(opened, ['opener']), { state: { selectedId: null, openerId: null }, focusId: 'opener' });
  assert.equal(closeDetail(opened, ['other']).focusId, 'results-title');
});
test('JSON and Markdown are deterministic with stable ordering and final newline', () => {
  const snapshot = structuredClone(demoSnapshot);
  const filters = { status: 'verified_passing' };
  const report = buildReport(snapshot, filters);
  const expected = `# Repository evidence audit

Evaluated at: \`2026-01-15T12:00:00Z\` · TTL: 3600 seconds.

Snapshot assertions only; not independently authenticated. Point-in-time metadata does not certify quality, security, compliance, or contract eligibility.

Filters: search="" status="verified_passing" language="".
Selected repositories: 1.

| Repository | Verdict | Evidence basis | Source SHA | Age (s) | Evidence gaps |
| --- | --- | --- | --- | ---: | --- |
| synthetic-evidence/complete-checks | verified_passing | synthetic_scenario | 1111111111111111111111111111111111111111 | 1800 | none |

## Evidence gap summary

No evidence gaps in the selected view.
`;
  // Verdict identifiers in filter prose are escaped; table identifiers are fixed contract data.
  assert.equal(reportMarkdown(report), expected.replace('status="verified_passing"', 'status="verified\\_passing"'));
  const first = reportJSON(buildReport(snapshot));
  snapshot.repositories.reverse();
  snapshot.repositories.forEach(r => { r.runs.items.reverse(); r.workflow_inventory.items.reverse(); });
  assert.equal(reportJSON(buildReport(snapshot)), first);
  assert.ok(first.endsWith('\n'));
  assert.equal(JSON.parse(first).counts.unverified_offline, 3);
  assert.deepEqual(JSON.parse(first).gap_summary, [
    { gap: 'ci.incomplete_metadata', count: 1 }, { gap: 'ci.no_ci_configured', count: 1 },
    { gap: 'ci.stale_snapshot', count: 1 }, { gap: 'ci.unverified_offline', count: 3 },
    { gap: 'ci.verified_failing', count: 1 }, { gap: 'documentation.contributing.absent', count: 1 },
    { gap: 'documentation.readme.unknown', count: 1 }, { gap: 'documentation.security.unknown', count: 1 },
    { gap: 'license.absent', count: 1 }, { gap: 'license.unknown', count: 1 }
  ]);
  const hostile = reportMarkdown(buildReport(demoSnapshot, { search: '<img|x>' }));
  assert.ok(hostile.includes('\\<img\\|x\\>'));
});

// Deliberately small DOM model: logic/interaction checks, not a browser or accessibility engine.
class Element {
  constructor(tag, doc) { this.tagName = tag; this.doc = doc; this.children = []; this.attributes = {}; this.listeners = {}; this.value = ''; this.id = ''; this.hidden = false; this.disabled = false; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
  replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(event, callback) { (this.listeners[event] ??= []).push(callback); }
  async emit(event) { for (const callback of this.listeners[event] ?? []) await callback({ preventDefault() {}, target: this }); }
  focus() { this.doc.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; void this.emit('close'); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  click() { return this.emit('click'); }
}
function modelDocument(html) {
  const doc = { activeElement: null };
  doc.createElement = tag => new Element(tag, doc);
  doc.body = doc.createElement('body');
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gu)) {
    const node = doc.createElement(match[1]); node.id = match[2]; node.hidden = /\bhidden\b/u.test(match[0]); doc.body.append(node);
  }
  const all = () => { const nodes = []; const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(doc.body); return nodes; };
  doc.getElementById = id => all().find(n => n.id === id);
  doc.querySelectorAll = selector => {
    assert.equal(selector, '[data-repository]');
    return all().filter(n => n.getAttribute('data-repository') !== undefined);
  };
  doc.getElementById('status-filter').value = 'all';
  return doc;
}
test('static assets and initial UI load are offline; modeled interactions retain evidence on errors', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../assets/style.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../assets/app.mjs', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/api.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<(?:script|img|link)\b[^>]*(?:src|href)=["']https?:/iu);
  assert.doesNotMatch(css, /@import|url\s*\(/iu);
  assert.match(css, /:focus-visible/u);
  assert.match(html, /aria-live="polite"/u);
  for (const source of [html, css, app, api]) {
    assert.doesNotMatch(source, /sendBeacon|XMLHttpRequest|WebSocket|EventSource|github_pat_|gh[pousr]_[A-Za-z0-9]{20}/u);
  }
  assert.doesNotMatch(app, /innerHTML|fetch\s*\(/u);
  const doc = modelDocument(html);
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.document = doc;
  globalThis.fetch = async () => { requests++; return new Response('', { status: 403 }); };
  try {
    await import('../assets/app.mjs');
    const $ = id => doc.getElementById(id);
    assert.equal(requests, 0, 'module initialization must never refresh');
    assert.equal($('results-body').children.length, 8);
    assert.match($('origin').textContent, /Synthetic demo/u);
    $('status-filter').value = 'verified_passing'; $('language-filter').value = 'python';
    await $('language-filter').emit('change');
    assert.equal($('empty').hidden, false);
    assert.match($('announcements').textContent, /0 of 8/u);
    await $('clear-filters').click();
    let opener = doc.querySelectorAll('[data-repository]')[0];
    await opener.click(); assert.equal($('detail').open, true);
    await $('close-detail').click(); assert.equal(doc.activeElement.id, opener.id);
    const saved = $('editor').value;
    $('editor').value = '{'; await $('snapshot-form').emit('submit');
    assert.equal($('editor').getAttribute('aria-invalid'), 'true');
    assert.match($('error-list').textContent, /\$ \[json\]/u);
    assert.equal($('results-body').children.length, 8);
    const imported = JSON.parse(saved); imported.repositories[0].provenance = 'imported';
    $('editor').value = JSON.stringify(imported); await $('snapshot-form').emit('submit');
    const beforeRefresh = $('editor').value;
    opener = doc.querySelectorAll('[data-repository]')[0];
    await opener.click();
    assert.equal($('refresh').disabled, false);
    await $('refresh').click();
    assert.equal(requests, 1);
    assert.equal($('editor').value, beforeRefresh);
    assert.match($('detail-status').textContent, /403/u);
    await $('close-detail').click();
    assert.equal(doc.activeElement.id, opener.id);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
