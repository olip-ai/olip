---
id: read-only-discovery
title: Read-only discovery in five minutes
description: A five-minute, read-only OLIP discovery example against the fictional local reference endpoint, with the exact commands and the expected answers, including no-match and version errors.
---

# Read-only discovery in five minutes

**Pinned to:** OLIP 0.1, reference endpoint from `olip-0.2-draft-kit.zip`. Read-only: nothing is created and nothing is sent. Fictional data only.

```bash
# Download olip-0.2-draft-kit.zip from https://olip.ai/spec/downloads/ and unzip it, then:
cd olip-0.2-draft
npm install
npm start            # fictional endpoint on http://127.0.0.1:8787
```

In a second terminal (macOS or Linux; on Windows use `curl.exe` in PowerShell):

```bash
B=http://127.0.0.1:8787

# 1. What does this endpoint support?
curl -s $B/.well-known/olip.json
# "supported_versions": ["0.1","0.2"], "profiles": ["olip-read","olip-write","olip-mock-harness","olip-a2a-binding"]

# 2. A plain-English problem, in one state
curl -s "$B/olip/v0.1/providers?q=my%20landlord%20wants%20to%20evict%20me&jurisdiction=US-CA"
# query.matter = "housing.landlord_tenant" (interpreted, with unknowns listed)
# ordering.method = "family_name_alphabetical", ordering.paid_influence = false
# results: prf_test_alvarez, prf_test_reyes (both fictional)

# 3. How is this lawyer's license known?
curl -s $B/olip/v0.1/professionals/prf_test_alvarez
# licenses[0].license_id = "TEST-CA-100001", verification.level = "official_source_checked" (fictional registry)

# 4. What does the firm say it accepts?
curl -s $B/olip/v0.1/professionals/prf_test_alvarez/intake-policy
# accepting_new_matters.status = "self_reported" with a date; capacity.status = "unknown"

# 5. Nobody fits: no-match, with free help
curl -s "$B/olip/v0.1/providers?jurisdiction=US-WY&matter=housing.landlord_tenant"
# results = [], no_match.reason = "no_listed_professional_for_matter_and_jurisdiction", legal_aid_options: 1

# 6. Failure: an unsupported version is refused with a stable code
curl -s -H "OLIP-Version: 9.0" "$B/olip/v0.1/providers?matter=housing.landlord_tenant"
# error.code = "OLIP_VERSION_UNSUPPORTED", error.supported_versions = ["0.1","0.2"]

# 7. Failure: writing without credentials is refused
curl -s -X POST $B/olip/v0.1/handoffs -H "content-type: application/json" -d "{}"
# error.code = "OLIP_UNAUTHENTICATED"

# 8. Optional 0.2: the firm's intake capability card
curl -s $B/olip/v0.2/professionals/prf_test_alvarez/intake-card
```

The expected answers above were checked on 2026-11-08 against a fresh unzip of the kit (Linux, Node.js 22, Python 3.13). Next: the full [quickstart](/docs/quickstart/).
