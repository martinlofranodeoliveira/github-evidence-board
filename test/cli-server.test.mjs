import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createStaticServer } from '../scripts/serve.mjs';
import { demoSnapshot } from '../fixtures/synthetic.mjs';
import { LIMITS } from '../src/core.mjs';

const exec = promisify(execFile);
const cli = (...args) => exec(process.execPath, ['./bin/evidence-board.mjs', ...args], { maxBuffer: 2097152 });
test('offline CLI demo prints deterministic machine and human reports', async () => {
  const first = await cli('demo'); const second = await cli('demo');
  assert.equal(first.stderr, ''); assert.equal(first.stdout, second.stdout);
  assert.ok(first.stdout.startsWith('JSON\n{'));
  assert.match(first.stdout, /\nMARKDOWN\n# Repository evidence audit/u);
  const machine = JSON.parse((await cli('demo', '--format', 'json')).stdout);
  assert.equal(machine.count, 8);
  assert.deepEqual(machine.counts, { verified_passing: 1, verified_failing: 1, stale_snapshot: 1, incomplete_metadata: 1, unverified_offline: 3, no_ci_configured: 1 });
  assert.equal(JSON.parse((await cli('demo', '--format', 'json', '--at', '2026-01-15T12:30:01Z')).stdout).counts.stale_snapshot, 8);
});
test('local reports reject invalid, oversized and non-UTF-8 input without partial output', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'evidence-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'snapshot.json');
  await writeFile(file, JSON.stringify(demoSnapshot));
  const selected = JSON.parse((await cli('report', file, '--status', 'verified_failing')).stdout);
  assert.equal(selected.count, 1);
  assert.equal(selected.repositories[0].repository, 'synthetic-evidence/failed-checks');
  await writeFile(file, '{');
  await assert.rejects(cli('report', file), error => error.code === 2 && error.stdout === '' && error.stderr === '$ [json]: Malformed JSON.\n');
  await writeFile(file, Buffer.alloc(LIMITS.snapshotBytes + 1, 32));
  await assert.rejects(cli('report', file), error => error.code === 2 && error.stderr.startsWith('$ [limit]:'));
  await writeFile(file, Buffer.from([0xff]));
  await assert.rejects(cli('report', file), error => error.code === 2 && error.stderr === '$ [encoding]: Expected valid UTF-8.\n');
  await assert.rejects(cli('demo', '--status', 'green'), error => error.code === 2 && error.stderr.startsWith('$.filters.status [enum]:'));
});
async function listening(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
}
test('loopback static server has MIME types, an allowlist and traversal rejection', async t => {
  const server = createStaticServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = await listening(server);
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal((await get(port, '/')).status, 200);
  assert.equal((await get(port, '/src/core.mjs')).headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await get(port, '/assets/style.css')).headers['content-type'], 'text/css; charset=utf-8');
  assert.equal((await get(port, '/index.html', 'HEAD')).body, '');
  for (const path of ['/%2e%2e/package.json', '/assets/../index.html', '/assets%5capp.mjs', '/%00', '/%zz']) assert.equal((await get(port, path)).status, 400);
  assert.equal((await get(port, '/package.json')).status, 404);
  assert.equal((await get(port, '/index.html', 'POST')).status, 405);
});
test('static allowlisted symlinks cannot escape the serving root', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'evidence-server-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'site'); await mkdir(root);
  const outside = join(dir, 'outside.html'); await writeFile(outside, 'outside');
  await symlink(outside, join(root, 'index.html'));
  const server = createStaticServer(root);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = await listening(server);
  assert.equal((await get(port, '/')).status, 403);
});
