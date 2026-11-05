import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoSnapshot } from '../fixtures/synthetic.mjs';
import { LIMITS, SnapshotError, parseSnapshot, normalizeSnapshot, buildReport, reportJSON, reportMarkdown } from '../src/core.mjs';
import { readLimitedFile } from '../src/local-io.mjs';

const HELP = `GitHub evidence board — development 0.1.0
Usage:
  node ./bin/evidence-board.mjs demo [options]
  node ./bin/evidence-board.mjs report FILE [options]
Options:
  --format json|markdown|both  Default: both for demo, json for report
  --search TEXT                Case-insensitive substring
  --status VERDICT             One contract verdict or all
  --language LANGUAGE          Case-insensitive exact match
  --at YYYY-MM-DDTHH:mm:ssZ     Explicit replacement evaluation time
No network requests are supported by this CLI.
`;
export async function run(argv, stdout = process.stdout, stderr = process.stderr) {
  try {
    if (argv.length === 1 && argv[0] === '--help') { stdout.write(HELP); return 0; }
    const command = argv[0];
    if (!['demo', 'report'].includes(command)) throw new Error(HELP);
    let index = 1;
    let filename;
    if (command === 'report') {
      filename = argv[index++];
      if (!filename || filename.startsWith('--')) throw new Error('report requires a local JSON filename.');
    }
    const options = { format: command === 'demo' ? 'both' : 'json', search: '', status: 'all', language: '' };
    const seen = new Set();
    for (; index < argv.length; index += 2) {
      const key = argv[index]?.replace(/^--/u, '');
      const value = argv[index + 1];
      if (!argv[index].startsWith('--') || !['format', 'search', 'status', 'language', 'at'].includes(key) || value === undefined || seen.has(key)) throw new Error('Invalid, duplicate, or missing option. Use --help for usage.');
      options[key] = value; seen.add(key);
    }
    if (!['json', 'markdown', 'both'].includes(options.format)) throw new Error('Format must be json, markdown, or both.');
    let snapshot;
    if (command === 'demo') snapshot = normalizeSnapshot(demoSnapshot);
    else {
      let bytes;
      try { bytes = await readLimitedFile(filename, LIMITS.snapshotBytes); }
      catch (error) {
        if (error.code === 'FILE_TOO_LARGE') throw new SnapshotError([{ path: '$', code: 'limit', message: `Snapshot JSON must not exceed ${LIMITS.snapshotBytes} UTF-8 bytes.` }]);
        throw new Error(`Cannot read a regular snapshot file (${error.code ?? 'IO_ERROR'}).`);
      }
      let input;
      try { input = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new SnapshotError([{ path: '$', code: 'encoding', message: 'Expected valid UTF-8.' }]); }
      snapshot = parseSnapshot(input);
    }
    if (options.at !== undefined) snapshot = normalizeSnapshot({ ...snapshot, evaluated_at_utc: options.at });
    const report = buildReport(snapshot, { search: options.search, status: options.status, language: options.language });
    if (options.format === 'both') stdout.write(`JSON\n${reportJSON(report)}\nMARKDOWN\n${reportMarkdown(report)}`);
    else stdout.write(options.format === 'json' ? reportJSON(report) : reportMarkdown(report));
    return 0;
  } catch (error) {
    if (error instanceof SnapshotError) {
      for (const diagnostic of error.diagnostics) stderr.write(`${diagnostic.path} [${diagnostic.code}]: ${diagnostic.message}\n`);
      return 2;
    }
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await run(process.argv.slice(2));
