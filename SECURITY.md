# Security

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository:

https://github.com/martinlofranodeoliveira/github-evidence-board/security/advisories/new

Do not post exploit details, credentials, private snapshots or personal data in public issues. Include a minimal synthetic reproduction, affected version, expected boundary, actual behavior and any relevant platform details. No response-time or remediation SLA is promised. General contact is through the [official Lofrano Tecnologia homepage](https://lofranotecnologia.com.br).

## Development scope

Version 0.1.0 is a development version. No production-readiness, security certification or support lifetime is asserted. Reports about the current development code are welcome through the private channel above.

Imported snapshots are untrusted assertions. Provenance strings and passing verdicts are not authentication, security review, legal review or contractual eligibility. Validate evidence against the source before relying on it. Do not paste secrets or real personal data into snapshots, issues or fixtures.

The default application is offline apart from normal static asset loading. The explicit public GitHub refresh sends only validated repository identity and public query parameters to fixed api.github.com endpoints, without tokens or credentials. Requests have deadlines, response caps and pagination limits. Browser and network restrictions can still prevent refresh. No retries or background requests occur.

The local preview server binds to 127.0.0.1 and serves a fixed asset allowlist. Keep its source directory under your control; it is not an internet-facing hardened server or a defense against local malicious file replacement. Use the static files with an appropriate hosting configuration if you independently choose to host them. No hosting, deployment or publication is performed by this project.

No telemetry, tracking, service worker, persistent browser storage or runtime secret support is included. Audit reports can contain repository identities and timestamps from your imported data; review them before sharing.
