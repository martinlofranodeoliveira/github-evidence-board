# Design, boundaries and review

## Implemented shape

The workbench connects an editable input bay to a filtered evidence table and an inspection drawer. The first screen contains actual synthetic task data, not a landing page. An ink-blue action rail holds dataset reset and report export. Pale gray input surfaces, teal actions and amber incomplete/stale states distinguish operations without hiding the textual verdicts. System fonts require no external assets. Monospace is reserved for editable JSON and raw JSON detail.

At wider widths input and results share a bounded two-column grid. Below 1000px the bays stack; at narrow widths the table has its own labeled horizontal scroll region and filters stack. Nothing depends on a fixed desktop viewport. The native dialog becomes an edge-aligned drawer, with an explicit close control. Native controls, semantic table headings, a skip link, visible focus, associated input errors and live announcements are implemented. Status colors are redundant with text.

## Architecture

- `src/core.mjs`: pure bounded validation, normalization, deterministic classification, selection and report formatting. It has no filesystem, network or wall-clock access.
- `src/ui-state.mjs`: shared filter result state and deterministic drawer focus restoration decisions.
- `src/api.mjs`: explicit network boundary with fixed GitHub endpoints, byte/request/page/time limits and conservative completeness flags. Merely importing it does not request anything.
- `assets/app.mjs`: DOM construction with `textContent`, event handlers, in-memory snapshot lifecycle, explicit API action and Blob downloads. No untrusted HTML interpolation or URL is accepted.
- `fixtures/synthetic.mjs`: deterministic JSON-compatible synthetic snapshot, constructed locally with small helpers and shared by CLI/browser. `demo --format json` exports an audit report; the browser editor exposes the full normalized snapshot as JSON. No fixture is a claim about a real person or repository.
- `bin/evidence-board.mjs`: bounded local file adapter, explicit evaluation override and stdout/stderr contract.
- `src/local-io.mjs`: regular-file bounded reader, shared by CLI and development server.
- `scripts/serve.mjs`: loopback preview server with an explicit asset allowlist, MIME types and traversal/symlink escape rejection.

No build tool, framework, runtime service, storage, telemetry or external dependency is needed. Relative module URLs permit static subpath hosting. Native ES modules require HTTP serving rather than `file://`.

## Trust and truthfulness

Loaded JSON is a set of user-supplied assertions. A provenance label is not authentication. The trusted collector marks runtime records in an in-memory WeakSet; normalization preserves a mark only from an already marked object. JSON serialization/re-import strips it. UI and CLI use conservative default contexts; explicit library assertion overrides never create a mark. Reports distinguish evidence basis/session collection from declared provenance. This is neither a signature nor a defense against hostile executable JavaScript in the same realm.

A single passing workflow cannot stand for all CI. Classification requires complete active workflow coverage at one source SHA. Pending, skipped, mismatched, incomplete and stale evidence do not become green. No runs does not prove there are no workflows. No overall quality score or commercial eligibility indicator is computed.

GitHub Actions workflow/run metadata is a useful, bounded subset, not a complete CI policy evaluator. External CI, required checks, branch protection, job content, workflow code correctness, matrix completeness and legal license review are outside the interpretation. Repository license metadata is presence evidence only. Public API refresh deliberately leaves file-level documentation unknown rather than inventing absence or presence.

The adapter checks default-branch SHA before and after reads, but GitHub's separate REST reads are not a transaction. Inventory or run data can change between reads. Pagination totals and duplicates are checked conservatively; the UI exposes completeness, source and time instead of concealing uncertainty.

## Failure and resource review

- Imported byte length, repository count, per-repository array counts, identifiers, strings and strict timestamps are bounded before classification.
- Diagnostics are first-error, field-level and stable; malformed input never replaces working data.
- API errors do not erase the editor or loaded view. One refresh runs at a time; dataset replacement, draft edits and new input invalidate obsolete success/failure. An open detail is updated against the new evaluation time, and error focus stays inside its dialog.
- The total refresh budget is 9 sequential requests and 15 seconds, with streamed response byte caps. Pagination cannot silently turn a partial inventory into a passing verdict.
- Source links are reconstructed from validated owner/name; synthetic records have no asserted source link. Untrusted remote `html_url` and pagination URLs are ignored.
- Reports are deterministic selection summaries, not raw snapshot backups. Their gap counts are prompts for inspection, not certification failures.
- The local preview server serves known assets, not arbitrary user filesystem paths. It is not designed to defend an untrusted party modifying the source tree concurrently; keep the preview directory under your control.

## Automated regression coverage

`node --test` covers all six verdicts, exact TTL boundaries, time inconsistencies, missing workflow coverage, newer pending/mismatched heads, skipped/cancelled/neutral results, unknown claims, malformed JSON, timestamp syntax/calendar validity, byte/count/string bounds, unsafe identities/URLs, report order and exact Markdown output.

The API tests inject synthetic `Response` objects, exercising rate limits, network failures, byte limits, capped pagination, duplicate inventory entries, changing heads and unsupported metadata. They never contact GitHub. The CLI tests use temporary synthetic files; server tests use loopback only and check MIME, methods, traversal and symlink escape behavior.

A small DOM model executes the actual app module and checks zero startup API calls, filter/empty states, editor failure recovery, dialog focus decisions and loaded-data preservation on a simulated HTTP 403. Static audits reject external asset URLs, CSS URL imports, unsafe HTML insertion and common token/beacon patterns. These are useful regressions, not a complete proof against every possible network mechanism or accessibility defect.

## Manual finish review checklist

These checks describe how to review the running interface; they are not claims that browser QA has passed.

1. Start the loopback server and inspect at approximately 1360px and 390px widths. Confirm real synthetic evidence is visible, long identities wrap, table scrolling stays local and controls remain reachable.
2. Use only the keyboard: skip link, input/editor, apply, all filters, repository buttons, drawer close and export. Confirm visible focus, native modal containment, Escape closure and focus restoration.
3. With a screen reader, inspect table headers/caption, live filter counts, validation alert and editor error association. Confirm announcements are understandable rather than excessively repetitive.
4. Submit malformed JSON, an offset timestamp, too many repositories and a stale observation. Verify field paths and preserved results. Recover by fixing input or resetting the demo.
5. Exercise a zero-match filter intersection and recover with Clear filters. Compare the exported JSON and Markdown selection to the visible rows.
6. Observe browser networking: no GitHub requests before explicit refresh. With a deliberately chosen public repository, inspect the fixed API URLs and empty credentials. Simulate offline/403/429 and verify the old snapshot remains available. A manual live check is optional and not part of automated tests.
7. Confirm synthetic records have no asserted source link and cannot refresh. Import real identity deliberately before making the explicit public request.

## Verdict of the implementation review

The implemented boundary is a deterministic snapshot inspector with bounded optional GitHub reads, not a CI service or attestation authority. The code and tests encode conservative failure states and a reproducible offline path. Browser-specific rendering, assistive-technology behavior and download behavior still require manual review in the environments where the static files will be used. No production-readiness, deployment or browser-QA approval is asserted. [DESIGN.md](../DESIGN.md) records actual palette/layout declarations and source/simulated-DOM audit scope: rendering remains unverified.

## Primary platform references

- https://docs.github.com/en/rest/about-the-rest-api/api-versions — the adapter pins the supported 2026-03-10 version.
- https://docs.github.com/en/rest/actions/workflow-runs — repository run filters and public unauthenticated reads.
- https://docs.github.com/en/rest/actions/workflows — bounded inventory enumeration.

## Reference material

- [GitHub workflow runs REST documentation](https://docs.github.com/en/rest/actions/workflow-runs)
- [GitHub repository REST documentation](https://docs.github.com/en/rest/repos/repos)
- [GitHub workflows REST documentation](https://docs.github.com/en/rest/actions/workflows)
- [MDN ARIA reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
- [Node 22 test runner](https://nodejs.org/docs/latest-v22.x/api/test.html)

The implementation is original. References describe platform APIs; they are not claims of broad standards certification.
