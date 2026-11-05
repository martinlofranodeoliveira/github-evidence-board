# Development 0.1.0 contract

This document defines the implemented snapshot, classification, refresh and report contract. Version `0.1.0` is a development version. The schema and report versions are exact strings, not semver ranges. No broader JSON Schema, accessibility, GitHub CI-policy or compliance conformance is claimed.

## Snapshot syntax and normalization

Input is UTF-8 JSON, at most **1,048,576 bytes**. CLI and browser file readers reject invalid UTF-8. The pure text parser receives a JavaScript string and measures its UTF-8 encoding. `normalizeSnapshot` accepts an already-parsed plain object and enforces structural limits; callers with untrusted bytes must use the bounded text/file path. It returns a new object containing only known fields. Input is not mutated. Unknown object fields are rejected, including URL fields. JSON duplicate keys have ordinary `JSON.parse` last-key-wins semantics; this format is not a canonical signing format.

All listed fields are required except `claimed_verdict`. Empty repository arrays are valid. Array identities must be unique: repository identity is case-insensitive owner/name; workflow and run IDs are unique within their respective repository arrays. Run references to workflows no longer in the inventory are allowed and are not evaluated as active workflows.

Validation stops at the first deterministic diagnostic. `SnapshotError.diagnostics` is an array containing `{path, code, message}`. Known fields use paths such as `$.repositories[0].observed_at_utc`. Unknown keys use JSON-quoted brackets, such as `$.repositories[0]["html_url"]`. Invalid JSON uses `$` with code `json`. Repository count violations use `$.repositories` with code `limit`. CLI and browser expose these field paths. Parser engine messages are not exposed.

Strings use UTF-16 code-unit length bounds and reject U+0000 through U+001F and U+007F. Timestamps must be real calendar timestamps exactly `YYYY-MM-DDTHH:mm:ssZ`, year 1970–9999. Offsets, lowercase z, fractional seconds, leap seconds and impossible dates are rejected. This is a deliberately narrow ISO-8601 UTC subset. SHA strings are exactly 40 lowercase hexadecimal characters.

### Root

| Field | Contract |
| --- | --- |
| `schema_version` | Exactly `0.1.0` |
| `evaluated_at_utc` | Explicit caller-supplied timestamp; no core or CLI wall-clock default |
| `ttl_seconds` | Safe integer, 1–2,592,000 inclusive |
| `repositories` | Array, 0–100 repository objects |

### Repository

| Field | Contract |
| --- | --- |
| `owner` | 1–39 ASCII alphanumeric/hyphen characters, alphanumeric ends |
| `name` | 1–100 ASCII alphanumeric/dot/underscore/hyphen characters, alphanumeric first character |
| `description` | String, 0–240 code units |
| `language` | Null or string, 1–40 code units |
| `source_sha` | Null or SHA of the source being evaluated |
| `observed_at_utc` | Observation timestamp asserted by supplier |
| `provenance` | `synthetic`, `imported`, or `github_api`; a declaration, never authentication |
| `license` | `present`, `absent`, or `unknown` |
| `documentation` | Object with `readme`, `contributing`, `security`, each a presence enum |
| `workflow_inventory` | Object with boolean `complete` and `items` array, at most 100 workflows |
| `runs` | Object with boolean `complete` and `items` array, at most 200 runs |
| `claimed_verdict` | Optional null or one of the six verdict enums; normalized to null if omitted; never trusted for classification |

Identity validation is a path-safe subset, not a claim to model every GitHub naming rule. No input supplies a fetch URL. Source links are constructed only from validated identity. Synthetic report source URLs are null and the synthetic browser detail has no source link.

Presence states are assertions about existence, not content validity. Unknown is not absent. None of these fields verifies license permissions, README accuracy, security policy quality or contractual requirements.

### Workflow item

`id`: positive safe integer. `name`: string, 1–120 code units. `state`: `active` or `disabled`.

`workflow_inventory.complete: true` asserts that the full configured GitHub Actions inventory for the evaluated source was inspected. This does not cover external CI providers. Disabled items remain in the inventory but are excluded from passing/failing evaluation. Only a truly empty complete inventory establishes `no_ci_configured` in this subset.

### Run item

| Field | Contract |
| --- | --- |
| `id` | Positive safe integer |
| `workflow_id` | Positive safe integer |
| `head_sha` | SHA |
| `status` | `queued`, `in_progress`, `completed`, `unknown` |
| `conclusion` | Null or `success`, `failure`, `cancelled`, `timed_out`, `action_required`, `neutral`, `skipped`, `startup_failure`, `stale` |
| `updated_at_utc` | Timestamp |

A non-completed run must have null conclusion. A completed run may have null conclusion, but is then unverified. `runs.complete: true` asserts the supplied relevant run enumeration is sufficient to determine the latest run for every active inventoried workflow at the evaluated source. It is not a claim to include the entire lifetime run history.

## CI verdict algorithm and precedence

Age is `(evaluation time − observation time)` in integer seconds. The core never consults the wall clock.

1. A future observation or a run updated after observation gives `incomplete_metadata`.
2. Age greater than TTL gives `stale_snapshot`; equality is fresh.
3. Missing source SHA or incomplete workflow inventory gives `incomplete_metadata`.
4. Nonempty workflow inventory with incomplete run enumeration gives `incomplete_metadata`.
5. Apply the evaluation context and session-evidence gate below. An untrusted provenance declaration cannot establish passing, failing or absence of workflows.
6. A permitted complete inventory with zero items gives `no_ci_configured`, limited to GitHub Actions. A nonempty inventory containing only disabled workflows is unverified.
7. For each active workflow, any non-completed current-SHA run makes its outcome unverified. Inspect all runs tied for latest `updated_at_utc` and also the greatest run ID. Every such candidate must match the evaluated SHA, be completed, and conclude success or a recognized failure. Disagreement between success and failure is unverified. This conservative rule covers same-second ties, reruns and out-of-order completion; it does not simply break timestamp ties by ID.
8. Every active workflow must have a conclusive outcome. At least one `failure`, `timed_out` or `startup_failure` gives `verified_failing`; all successes give `verified_passing`. Missing, pending, skipped, neutral, cancelled, action-required, stale, unknown or null conclusions never imply passing.

A valid `claimed_verdict` never sets the verdict. A mismatch adds `claimed_verdict_mismatch` to gaps; an unknown enum is rejected. Earlier stale/incomplete conditions take precedence over the session gate. A partial failure remains visible as raw evidence without becoming an all-workflow verified verdict.

### Session evidence and explicit assertion contexts

`evaluateSnapshot(input, options = {})` and `buildReport(input, filters = {}, options = {})` accept only these boolean options:

| Option | Default | Meaning |
| --- | --- | --- |
| `allowSynthetic` | true | Evaluate labeled fictional scenario assertions; source URLs remain null |
| `allowImportedAsserted` | false | Deliberately evaluate supplied imported assertions without a live session fetch |
| `allowUnauthenticatedGitHubApi` | false | Deliberately evaluate a declared github_api record without a collector session mark |

The UI and CLI use the defaults and expose no trust-override switches. Imported `github_api` or `imported` records with otherwise complete fresh data remain `unverified_offline` by default, including a claimed empty inventory. Synthetic scenarios can illustrate all verdicts, but are labeled `synthetic_scenario`, not live public evidence.

Only the trusted collector's runtime record is marked in an in-memory WeakSet. Normalization carries a mark only from an already marked object and freezes the new record deeply. Evaluation, selection and report construction retain it. JSON serialization, parsing, structured copying and re-import do not carry it. Applying even an unchanged saved editor JSON therefore removes session evidence. `claimed_verdict`, `provenance` and copied report booleans cannot restore it.

Evaluated/report records expose `session_authenticated` and `verification_basis`: `session_github_api`, `unauthenticated_api_claim`, `imported_assertion` or `synthetic_scenario`. The boolean means collected in this executable session, not token-based GitHub authentication. Explicit assertion overrides never set it true. The exported `markSessionVerified` is a trusted executable-collector hook, not a JSON API, signature, or defense against malicious code running in the same JavaScript realm. Injected `fetchImpl` is trusted collector code; fake test Responses are models, not actual public GitHub evidence.

## Optional public API refresh

The CLI has no network feature. Browser startup has no API calls, polling, service worker or telemetry. Only the explicit detail refresh button calls `refreshRepository`. Synthetic rows disable that action. Importing a snapshot never itself fetches anything.

The API adapter validates owner/name before requesting. Every URL starts at fixed `https://api.github.com/repos/{owner}/{name}`. No upstream `html_url`, pagination link or arbitrary URL is followed. Requests use GET, omitted credentials, no tokens, no-store caching and redirect rejection, with `X-GitHub-Api-Version: 2026-03-10`.

Reads:

1. Repository metadata; the result must be public and match the requested identity case-insensitively.
2. `/commits/{encoded-default-branch}` for the source SHA.
3. `/actions/workflows?per_page=50&page=N`, maximum 2 pages, including active and disabled workflows.
4. `/actions/runs?per_page=50&page=N&branch={encoded-branch}&head_sha={SHA}`, maximum 4 pages.
5. The default-branch commit again; a changed SHA rejects the refresh.

Total budget: at most 9 sequential requests, one 15-second abort deadline for the whole operation, and at most 524,288 response-body bytes per request. The actual streamed body is counted, regardless of Content-Length. A short page is complete only when unique item count equals a stable `total_count`. Caps, changing totals and repeated IDs leave completeness false. Unsupported shapes, states, conclusions or mismatched run SHA reject the refresh. Unknown non-completed API statuses normalize to `unknown`, never success. Redirects, HTTP errors, invalid JSON, private repositories, byte limits and network errors fail closed.

403 and 429 are reported as rate-limit or access restrictions, without automatic retry. No upstream error body is shown. The browser retains loaded evidence on failure. Replacing a dataset, editing an unapplied draft or opening another input invalidates obsolete refresh/import outcomes; an obsolete success or failure cannot overwrite the newer state. Refresh completion also updates any currently selected detail using the new evaluation time. Errors are focused inside an open detail dialog rather than on its inert background.

The caller passes explicit `evaluated_at_utc`; the browser chooses the user's click time truncated to UTC seconds and uses it for observation. Runs updated after that time become incomplete rather than silently verified. Refresh updates the root evaluation time, preserving TTL and unselected repositories. Source SHA, declared source and timestamps are visible. Refreshed license is `present` only for metadata with a nonempty SPDX identifier other than NOASSERTION or a nonempty key other than other; otherwise it is unknown. This is presence metadata, not legal review. Documentation is always `unknown`, since no file contents are requested. This is not an atomic GitHub observation and does not authenticate later exported/imported assertions.

## Selection and audit reports

Search is a trimmed, case-insensitive substring across identity, description and language, maximum 240 code units. Status is `all` or one verdict enum. Language is a trimmed, case-insensitive exact string, maximum 40 code units; empty means unrestricted. Filters intersect. Null language is searchable only through other fields and does not get a named-language match.

`buildReport(snapshot, filters, options)` validates input and produces report version `0.1.0` with explicit evaluation time, TTL, warning notice, normalized filters, selected count, all six verdict counts, selected repository records and a gap summary. Records include safe source URL or null, declared provenance, runtime session-evidence boolean and basis, source SHA, observation time, age, computed verdict/reason, license, documentation and sorted gap codes. Repository records sort by lowercase owner/name using code-unit ordering, not host locale. Gap summary sorts by code; counts are numbers of selected repositories with that gap. Gap codes are:

- `ci.{verdict}` for every non-passing verdict, including explicit absence of workflows;
- `license.absent` or `license.unknown`;
- `documentation.{readme|contributing|security}.{absent|unknown}`;
- `claimed_verdict_mismatch` when applicable.

A gap is an inspection prompt, not a compliance failure or quality score. Explicit absence of workflows is distinguished from inability to verify them.

`reportJSON` emits two-space-indented JSON with one final LF. `reportMarkdown` emits a fixed heading, evaluation metadata, notice, normalized filters, repository table (including evidence basis and source SHA) and gap summary with one final LF. Untrusted filter punctuation is escaped in Markdown prose. Descriptions, workflow names and arbitrary URLs are not interpolated into Markdown. Empty selection has an explicit table row and zero counts. Formatting is independent of current time, input repository order and locale.

Reports intentionally omit raw runs/inventory and cannot be reimported as snapshots or session authentication. Exported session flags are assertions about the originating session, not signed or portable proof. The editor contains the full normalized snapshot. Browser downloads use local Blob URLs, not a network destination.

## Local interface and failure behavior

Invalid editor submissions preserve loaded evidence and identify the editor via `aria-invalid` and associated error text. File selection only fills the editor, with both declared file size and actual bytes bounded. Obsolete file outcomes are ignored. Imports and reports are memory-only; there is no recovery after a reload unless the user saved their own data. Dialog closure restores the opener if still present, otherwise the focusable results heading. The native dialog handles modal focus containment and Escape in supported browsers.

The CLI accepts `demo` or `report FILE`, `--format json|markdown|both`, `--search`, `--status`, `--language`, and `--at`. Duplicate or unknown options fail. Defaults are both formats for demo, JSON for report. Exit codes: 0 success, 2 validation, 1 usage/I/O. No partial stdout on validation failure. File reads are bounded even if a file grows during reading and must be regular files.

The local HTTP server binds to `127.0.0.1`, accepts GET/HEAD, rejects traversal components, encoded separators that escape the allowlist, malformed encodings and NUL, and verifies resolved assets remain under its root. Unknown routes are 404; invalid paths 400; other methods 405. It is a small development server. Static GitHub Pages hosting can serve the same relative module paths without any build, but this repository includes no deployment automation or deployment claim.
