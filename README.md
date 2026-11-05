# GitHub evidence board

Development version **0.1.0** — an offline-first browser workbench and Node CLI by [Lofrano Tecnologia](https://lofranotecnologia.com.br).

Inspect engineering evidence across public GitHub repositories using explicit, auditable snapshot assertions. The tool separates CI verdicts, age, license metadata and documentation presence. It does **not** authenticate imported snapshots, certify security or compliance, or establish commercial or tender eligibility. Synthetic demo names are fictional and are not claims about real repositories or users.

## Run locally

Requires Node **22 or later**. There are no runtime or development dependencies, build step, model calls, API keys, or installation scripts. After obtaining the project files:

```sh
node --test
node ./bin/evidence-board.mjs demo
node ./scripts/serve.mjs
```

Open `http://127.0.0.1:4173`. An alternative unprivileged port can be supplied, for example `node ./scripts/serve.mjs 4180`. Stop the server with Ctrl+C. ES modules must be served over HTTP; `file://` loading is not supported. The server binds only to loopback and serves an explicit asset allowlist. It is a development preview server, not an internet-facing service.

Equivalent package scripts are `npm test`, `npm run demo`, and `npm run serve`. No package installation is needed. Tests use fake GitHub responses and a loopback HTTP server, never the public API.

## Browser workflow

1. The first view contains **Synthetic demo** evidence: eight fictional repositories, fixed evaluation time and no API requests. Normal local HTML/CSS/module asset loads are required; there are no programmatic data requests at startup.
2. Search by identity, description or language; combine CI verdict and language filters. A zero-result view is explicit and recoverable with **Clear filters**.
3. Inspect a repository to open its native modal detail drawer. Source SHA, declared provenance, observation time, inventory completeness and raw repository JSON are visible. Escape or **Close detail** closes the drawer and restores focus to its repository button, or to the results heading if that button no longer exists.
4. Open a local UTF-8 JSON file to fill the editor, then choose **Apply snapshot**. You can also edit JSON directly. Errors include an exact JSON path and leave the previously loaded data intact. Files are not uploaded or persisted.
5. Export the filtered view and evidence gap summary as **JSON** or **Markdown**. These reports are not snapshot backups; to retain all raw workflow/run data, save the editor contents separately.
6. For a non-synthetic repository, **Refresh this repository from GitHub** explicitly contacts the unauthenticated public API. It checks the default-branch head, workflow inventory and current-head runs with bounded pagination. This changes evaluation time for the whole snapshot; other rows can therefore become stale. Failures preserve the loaded data. Documentation files are not fetched, so their refreshed presence is unknown.

All controls use native keyboard behavior. Focus outlines, a skip link, live filter/error announcements, associated editor error text and the native dialog support keyboard use. The automated interaction tests use a small DOM model; they are not real-browser accessibility or visual QA results. See the manual checklist in [design notes](docs/design.md).

### Importing actual evidence

The source identity is `owner` plus `name`; arbitrary URLs are not accepted. The complete [0.1.0 contract](docs/contract.md) lists every field and limit. A minimal non-synthetic snapshot with **no proof of CI** is:

```json
{
  "schema_version": "0.1.0",
  "evaluated_at_utc": "2026-01-15T12:00:00Z",
  "ttl_seconds": 3600,
  "repositories": [
    {
      "owner": "example-owner",
      "name": "example-repository",
      "description": "Synthetic import example; replace identity and evidence deliberately.",
      "language": null,
      "source_sha": null,
      "observed_at_utc": "2026-01-15T11:30:00Z",
      "provenance": "imported",
      "license": "unknown",
      "documentation": { "readme": "unknown", "contributing": "unknown", "security": "unknown" },
      "workflow_inventory": { "complete": false, "items": [] },
      "runs": { "complete": false, "items": [] }
    }
  ]
}
```

The example yields `incomplete_metadata`, not passing or no CI. It asserts no real repository exists at that name. Replace the example identity with a public repository you intend to inspect before opting into refresh. Imported `github_api` provenance is still merely a declaration, not proof that this session fetched it.


Session evidence is runtime-only. A successful explicit API refresh carries its collector mark through normalization, filtering and export. Saving/reapplying JSON removes that mark: even `provenance: "github_api"` with a passing claim becomes unverified by default. Reports name their evidence basis and source SHA; exported session booleans are not signed or portable proof. Synthetic verdicts remain fictional scenarios. The library offers explicit assertion contexts, documented in the contract; the UI/CLI do not enable those overrides.

## CLI

```sh
node ./bin/evidence-board.mjs --help
node ./bin/evidence-board.mjs demo --format json
node ./bin/evidence-board.mjs demo --status verified_passing --format markdown
node ./bin/evidence-board.mjs report snapshot.json --language JavaScript --format markdown
node ./bin/evidence-board.mjs report snapshot.json --at 2026-01-15T13:00:00Z
```

The `report` examples assume you saved your own JSON snapshot as `snapshot.json`. The CLI never performs network requests. Evaluation time comes from the input or explicit `--at`; the wall clock is never consulted. `demo` defaults to labeled JSON followed by Markdown, while `report` defaults to JSON only. Use `--format json` for machine parsing. Exit status is 0 on success, 2 on snapshot/filter validation failure and 1 on usage or file I/O failure. Diagnostics go to stderr, with no partial report on failure.

Example output from the filtered Markdown command:

```text
# Repository evidence audit

Evaluated at: `2026-01-15T12:00:00Z` · TTL: 3600 seconds.

Snapshot assertions only; not independently authenticated. Point-in-time metadata does not certify quality, security, compliance, or contract eligibility.

Filters: search="" status="verified\_passing" language="".
Selected repositories: 1.

| Repository | Verdict | Evidence basis | Source SHA | Age (s) | Evidence gaps |
| --- | --- | --- | --- | ---: | --- |
| synthetic-evidence/complete-checks | verified_passing | synthetic_scenario | 1111111111111111111111111111111111111111 | 1800 | none |

## Evidence gap summary

No evidence gaps in the selected view.
```

The full demo has 1 passing, 1 failing, 1 stale, 1 incomplete, 3 unverified and 1 explicitly empty workflow inventory. All are synthetic.

## Why these boundaries?

- A successful run cannot stand for every configured workflow. Verification requires complete inventory and run enumeration, plus the latest conclusive run for **each active workflow**, matching the evaluated SHA.
- No runs does not mean no CI. Only a complete, explicitly empty GitHub Actions inventory yields `no_ci_configured`.
- A timestamp exactly at the TTL is still fresh; one second past it is stale. Time never advances silently.
- Presence is a three-state assertion, not a content or legal assessment. GitHub license metadata does not validate license text. `unknown` is different from `absent`.
- Pure shared modules avoid browser/CLI drift. Sorting, gap counts and serialization are deterministic; no local timezone or locale sorting affects reports.

## Limits

Only a documented subset of GitHub Actions metadata is interpreted, not every CI provider, event, matrix requirement, branch-protection rule or required check. Disabled workflows are excluded from passing/failing evaluation but are not treated as an empty configured inventory. Run-level success does not independently validate job contents. A refresh is several API reads, not an atomic or cryptographically signed observation; head changes are checked, but other concurrent changes remain possible. Unauthenticated API limits, missing access, pagination caps and network failures can prevent verification.

Snapshots are capped at 1 MiB, 100 repositories, 100 workflows and 200 runs per repository. UTC timestamps use the strict seconds-only subset documented in the contract. There is no storage, service worker, telemetry, credential handling, token support, automatic refresh, deployment workflow or publishing workflow. Current browser modules, native dialog, fetch streams and Blob downloads are required. This is development software, not a production-readiness claim.

## Project information

- [Contract](docs/contract.md), [design and review checklist](docs/design.md), [changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md)
- [Português brasileiro](README.pt-BR.md)
- Repository: https://github.com/martinlofranodeoliveira/github-evidence-board
- General contact: [official homepage](https://lofranotecnologia.com.br)

MIT license. Copyright 2026 Lofrano Tecnologia.
