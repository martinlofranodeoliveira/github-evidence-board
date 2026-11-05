# Contributing

Contributions to this development 0.1.0 project should keep the offline path useful, reproducible and small. Use organization author metadata without email addresses. Do not add private client code, real personal data, credentials, fabricated adoption claims or external runtime services.

## Local checks

Use Node 22 or later. No dependency installation or build is needed.

```sh
node --test
node ./bin/evidence-board.mjs demo
node ./scripts/serve.mjs
```

Open `http://127.0.0.1:4173` for manual interaction review. ES modules are served over HTTP, not `file://`. Follow the manual checklist in [docs/design.md](docs/design.md), and describe which browsers and assistive technologies you actually checked. Do not equate the small DOM model tests with browser QA.

## Change expectations

- Keep pure classification free of clock, network, filesystem and locale dependencies.
- Update [the contract](docs/contract.md), both READMEs and the changelog when observable behavior changes. Do not silently broaden verdict meanings or schema versions.
- Add regression tests for failure and adversarial cases, not just examples copied from implementation branches. Keep all fixtures synthetic and API tests injected/offline.
- Preserve zero startup API calls and the explicit user-action boundary. Never add tokens, telemetry, third-party fonts/scripts, automatic refresh or publish/deployment workflows.
- Retain byte/count/string/time limits, complete-inventory requirements and safe identity-derived URLs. A simpler unknown verdict is preferable to an unjustified passing result.
- Keep DOM insertion text-based. Review focus restoration, empty results, structured errors and 390px layout after UI changes.

Discuss bugs or changes using repository issues and pull requests. Include a minimal synthetic reproduction, observed versus expected behavior, relevant exact JSON path diagnostics, Node/browser version and the commands you used. Do not attach a real organization's snapshot without permission. Security vulnerabilities belong in the private reporting channel described in [SECURITY.md](SECURITY.md), not public issues.

General contact is available through the [official homepage](https://lofranotecnologia.com.br). Contributions are under the MIT license.
