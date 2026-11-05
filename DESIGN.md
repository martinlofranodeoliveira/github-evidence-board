# Interface design record — development 0.1.0

**Source inspected; rendering not verified.** Fonte inspecionada, renderização não verificada. This record describes the actual HTML/CSS and simulated-DOM interaction. It does not establish a visual/browser pass, responsive compatibility, native-dialog behavior or accessibility certification.

## Task and information hierarchy

The initial task contains eight explicitly fictional repository scenarios. A compact header offers reset/export actions. The left bay edits an auditable snapshot; the right bay filters and inspects a semantic repository evidence table. A native dialog contains the chosen repository's evidence and the optional public API action. The caution about point-in-time assertions is part of the working surface, not a quality score.

Verdict text and evidence basis are separate. A synthetic scenario, imported claim and session collector record must remain distinguishable even when the calculated verdict has the same name. Markdown and JSON reports include the evidence basis and source SHA. A green scenario is not a statement about an actual client, repository quality, security or contractual eligibility.

## Authored visual system

| Source declaration | Value / use |
| --- | --- |
| Ground / body text | `#edf1f3` / `#183345` |
| Header rail | `#173b52`, text `#f7fbfd`, bottom edge `#187a7a` |
| Primary / source links | `#006d70` / `#00686b` |
| Secondary text | `#425d6d`; muted table header text `#304c5e` |
| Input bay / table header | `#f5f8f9` / `#e8eef1` |
| Passing / failing surfaces | `#e2f3ed` / `#fbece7`, with explicit verdict text |
| Stale/incomplete and notice surfaces | `#fff3d9` / `#fff5da` |
| Accent side borders | `1px` on notice, verdict, dialog and detail status; state text/background retained |
| Typography | System UI stack, root line-height `1.5`; header title `1.45rem`; data/editor text uses system monospace |

The source uses a light engineering-workbench direction without external fonts, decorative images, gradients or animation sequences. Controls generally declare a `2.65rem` minimum height; repository buttons declare `1.7rem`. Actual hit areas, overlap and contrast in rendered states were not measured.

The main content declares a `1472px` maximum width. Its input column is `minmax(290px,350px)` beside a flexible result column. At `1000px` and below the bays stack; at `550px` and below filters use one column, definition lists stack, and the table has a `550px` minimum width inside a horizontally scrollable, focusable wrapper. The dialog declares width `min(650px,95vw)` and height `100dvh`. These declarations do not prove viewport/reflow behavior.

## Focus and recovery

The skip link targets an explicitly focusable workspace. Native controls have explicit labels, and live regions describe filter/error states. Opening detail focuses Close; closing restores a surviving repository opener or the focusable results heading. Refresh error feedback is focused inside an open dialog, rather than attempting to focus its inert background.

An invalid snapshot preserves loaded evidence. File selection fills the editor but does not apply it. Draft edits and dataset replacements invalidate obsolete refresh/import outcomes. Completion refreshes the currently selected detail against the new evaluation time, even if selection changed while a request was pending. None of these updates silently upgrades imported JSON trust.

## Trust boundary

Fresh, complete imported data declaring `github_api` is unverified by default. The collector's in-memory WeakSet mark survives normalization, evaluation, filters and report construction, but not JSON serialization/re-import. Public library assertion overrides are explicit and do not create a session mark; UI/CLI use defaults. Executable collector code and its injected transport are trusted, while imported JSON is data. Session evidence is not token authentication, a signature or a defense against hostile JavaScript sharing the runtime.

The default UI and all offline demos/tests make no public API requests. Only the explicit refresh action uses bounded, unauthenticated GitHub GETs. Public API integration evidence, when collected, is separate from the offline tests and from browser verification.

## Verification boundary

The simulated-DOM audit runs the authored module graph in jsdom's outside-only internal VM. It checks initial data, label/ARIA references, filters, empty recovery, JSON/Markdown contents, safe Unicode/prototype input, imported-claim refusal, complete refresh/normalize/select/export mark propagation, stale async outcomes, draft preservation and error/focus routing. Timers, Blob/object URLs, file selection, download activation and dialog open/close are explicit models; GitHub Responses in this audit are in-memory fixtures.

No renderer, actual Tab sequence, accessibility tree, assistive technology, focus trap, native Escape handling, browser download or viewport behavior was verified. The Node unit suite uses a smaller DOM model and deterministic API fixtures. An anonymous Node HTTP integration can verify transport compatibility against a deliberately selected public repository; it cannot establish browser CORS, modal, layout or assistive-technology behavior.

See [the precise contract](docs/contract.md) and [architecture/manual checklist](docs/design.md). Source-declared focus outlines remain three pixels; the one-pixel accent-border correction does not alter those outlines.
