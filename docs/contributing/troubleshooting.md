---
id: troubleshooting
title: Troubleshooting and clean-machine FAQ
description: Common problems running the OLIP kit on a clean machine - Node and Python versions, ports, Windows commands - and what has and has not been tested.
---

# Troubleshooting and clean-machine FAQ

**What was tested.** On 2026-11-08 the sponsor unzipped `olip-0.2-draft-kit.zip` into an empty folder on Linux and ran `npm install`, `npm start`, `npm run walkthrough`, the conformance suite against both endpoints, and the read-only example. Node.js 22 and Python 3.13. **macOS and Windows have not been tested yet.**

| Problem | Fix |
|---|---|
| `cd: olip-0.1-draft: No such file or directory` | The kit unpacks to `olip-0.2-draft`. Older copies of the quickstart said `olip-0.1-draft`. |
| `node: command not found` or a syntax error | Install Node.js 20 or later and check with `node --version`. |
| `EADDRINUSE` on port 8787 | Something else uses the port. Start on another one: `PORT=8790 npm start` (macOS, Linux) or `$env:PORT=8790; npm start` (Windows PowerShell), and pass the same port to `--base`. |
| `PORT=8788 python3 ...` fails on Windows | In PowerShell: `$env:PORT=8788; python alt-python/olip_alt_server.py` |
| Python endpoint skips 6 checks | Expected: A2A is optional and the Python endpoint implements 0.1 only, so its five 0.2 checks are skipped. |
| `npm install` is blocked by a proxy | The kit's only dependencies are `ajv` and `ajv-formats` (for schema validation). The endpoints themselves need none. |
| A downloaded file's SHA-256 does not match | Download it again from [Downloads](/spec/downloads/). Kit zips are built reproducibly, so the same version always has the same hash. |
| Anything that looks like a real lawyer or client | Stop and [report it](/docs/contributing/report-an-error/). The kit holds fictional data only. |

Nothing in the kit needs an account, a key, a payment or any sponsor service.
