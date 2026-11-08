# OLIP: Open Legal Intake Protocol

**A common language for AI-to-lawyer connections.** OLIP is a proposed open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient.

> **Status: DRAFT.** OLIP 0.2 (optional additions) on top of OLIP 0.1 (base). Not adopted by any standards body, bar or regulator. Not legal advice. All data in this repository is fictional. Current status: https://olip.ai/spec/status/

This repository is the source of https://olip.ai: the specification, JSON Schemas, OpenAPI document, fictional examples, two reference mock endpoints (Node.js and Python), an MCP adapter, the public conformance suite, a browser-only simulation and the documentation website.

## Try it

- In a browser, nothing to install: https://olip.ai/try/ (fictional simulation, no network requests).
- Locally, in about 5 minutes (Node.js 20+):

```bash
cd protocol
npm ci
npm start                 # fictional endpoint on http://127.0.0.1:8787
npm run walkthrough       # in a second terminal: full fictional handoff, every response schema-checked
npm run conformance -- --base http://127.0.0.1:8787   # 35 pass, 0 fail, 0 skip
```

## Repository layout

| Folder | What | License |
|---|---|---|
| `protocol/spec/`, `protocol/schemas/`, `protocol/schemas-0.2/`, `protocol/openapi/` | Specification text, JSON Schemas, status machine, taxonomy, OpenAPI | CC BY 4.0, with the OWFa 1.0 patent commitment |
| `protocol/reference/`, `protocol/alt-python/`, `protocol/conformance/`, `protocol/tests/`, `protocol/scripts/` | Reference endpoints, clients, MCP adapter, conformance suite, tests | Apache 2.0 |
| `protocol/examples/`, `protocol/examples-0.2/`, `protocol/conformance/fixtures.example.json` | Fictional examples and fixtures | CC0 1.0 |
| `docs/`, `spec/`, `src/`, `static/`, `scripts/`, config files | Website source (Docusaurus) | Website text: CC BY 4.0; website code: Apache 2.0 |

See [LICENSE.md](LICENSE.md) for the exact mapping. The name "OLIP" is not licensed by any of these licenses.

## Build and test everything

```bash
npm ci && (cd protocol && npm ci)
(cd protocol && npm test)   # schemas, both endpoints, conformance, interop, MCP adapter, walkthrough
npm test                    # website: release facts, browser simulation, content drift
npm run build               # static site in build/
npm run scan                # pre-publication scan for secrets and personal data
```

Continuous integration runs the same commands on every pull request (`.github/workflows/ci.yml`).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Every normative change ships with a schema change, a fictional example and a conformance test. Sign off your commits (`git commit -s`, Developer Certificate of Origin). Security problems: [SECURITY.md](SECURITY.md), never a public issue.

## Sponsorship and governance

OLIP was initiated and is initially sponsored by Digital Crossings Inc. Anyone may implement OLIP and run the conformance suite without paying the sponsor, using its products or holding any account. There is no certification and no paid ranking. See [GOVERNANCE.md](GOVERNANCE.md).
