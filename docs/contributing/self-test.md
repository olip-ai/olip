---
id: self-test
title: Test your own implementation
description: How to run the public OLIP conformance suite against your own endpoint, in test-endpoint mode or fixture-free read mode, on Windows, macOS or Linux.
---

# Test your own implementation

You need Node.js 20 or later and the [kit](pathname:///downloads/olip-0.2-draft-kit.zip). Check the download against the [SHA-256 checksums](pathname:///downloads/SHA256SUMS.txt) first:

```bash
sha256sum olip-0.2-draft-kit.zip                      # Linux
shasum -a 256 olip-0.2-draft-kit.zip                  # macOS
Get-FileHash olip-0.2-draft-kit.zip -Algorithm SHA256 # Windows PowerShell
```

Then:

```bash
cd olip-0.2-draft
npm install
# Test endpoint (exposes the mock harness; every check runs):
npm run conformance -- --base https://your-test-endpoint.example --json results.json
# Production endpoint (no mock harness; fixture-free read mode):
cp conformance/fixtures.example.json my-fixtures.json   # put in real ids from your endpoint
npm run conformance -- --base https://your-endpoint.example --fixtures my-fixtures.json --json results.json
```

`results.json` lists every check with `pass`, `fail` or `skip` and a reason. Checks that need the mock harness are reported as **skipped, never as passed**. To see what a full run looks like, run the suite against the bundled reference endpoint (`npm start`, then `--base http://127.0.0.1:8787`): 35 pass, 0 fail, 0 skip.

A pass is a technical result about protocol behavior. It is not a security review, not legal or regulatory clearance, and not certification.

**Operating systems.** The sponsor ran the kit on Linux (Node.js 22, Python 3.13) from a clean unzip on 2026-11-08. The kit uses only Node.js and, optionally, Python's standard library, so it is expected to work on macOS and Windows, but **it has not been tested there yet**. See [Troubleshooting](/docs/contributing/troubleshooting/) and please [report](/docs/contributing/report-an-error/) what you find.
