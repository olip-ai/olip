# Contributing to OLIP

Thank you. OLIP needs outside review most of all: agent developers, intake and practice-management vendors, legal-aid organizations, lawyers, security practitioners and consumer advocates. You do not need an account with the sponsor or any company to take part.

## Ground rules

- **Fictional data only.** Never add real client, lawyer, firm or case data. Use `.test` domains and `TEST-` license numbers. Pull requests with real personal data are closed and the data is removed from history.
- **Security problems are private.** See [SECURITY.md](SECURITY.md). Do not open a public issue.
- **Be kind.** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies everywhere in this project.

## Kinds of contribution

| You want to | Do this |
|---|---|
| Report an error | Open a "Bug or error" issue. Include the file and version, what you expected and what you found. |
| Fix documentation | Open a pull request directly. |
| Change the protocol (anything normative) | Open a "Protocol change proposal" issue first: problem, proposal, compatibility impact, security and privacy impact, test plan. |
| Report an interoperability problem | Open an "Interoperability trouble" issue with both sides' versions and the conformance `results.json`. |
| List your implementation | See https://olip.ai/docs/contributing/publish-results/ |

## Normative changes

Every normative change ships with **a schema change, a fictional example and a conformance test**, and a changelog entry. Published files (for example `protocol/spec/OLIP-0.1-DRAFT.md` and the 0.1 schemas) are never edited in place, so their hashes stay valid; changes go into the next version. Decisions are recorded with their reasons in `protocol/governance/DECISION-LOG.md`.

## Developer Certificate of Origin

Every commit must be signed off: `git commit -s`. This adds `Signed-off-by: Your Name <you@example.org>` and certifies the Developer Certificate of Origin 1.1 (https://developercertificate.org/): that you wrote the contribution or otherwise have the right to submit it under the project's licenses.

## Licenses of contributions

Your contribution is licensed under the license of the part you change (see [LICENSE.md](LICENSE.md)): CC BY 4.0 with the OWFa 1.0 patent commitment for specification text and schemas, Apache 2.0 for code, CC0 1.0 for fictional examples.

## Before you open a pull request

```bash
npm ci && (cd protocol && npm ci)
(cd protocol && npm test)
npm test
npm run build
npm run scan
```

CI runs the same steps. Do not weaken, skip or delete an existing conformance check to make a change pass; if a check is wrong, propose a change to it.
