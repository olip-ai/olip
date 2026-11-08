# Quickstart: a complete fictional handoff

Needs Node 20+ and (optional) Python 3.10+. No accounts, no sponsor login, no production credentials. All data is fictional.

```bash
cd olip-0.1-draft
npm install                      # installs the schema validator only (ajv)
npm start                        # reference mock endpoint on http://127.0.0.1:8787
# in a second terminal:
npm run demo                     # one fictional user, discovery -> CaseBrief -> preview -> user approval -> delivered
npm run walkthrough              # success, failure and withdrawal paths; every response schema-checked
npm run conformance -- --base http://127.0.0.1:8787     # 30 checks
```

Second implementation (Python, standard library only):

```bash
PORT=8788 python3 alt-python/olip_alt_server.py
node reference/demo.mjs http://127.0.0.1:8788            # Node agent against the Python endpoint
python3 alt-python/olip_client.py http://127.0.0.1:8787  # Python agent against the Node endpoint
npm run conformance -- --base http://127.0.0.1:8788
```

Everything at once (starts and stops both endpoints): `npm test`.

Use from an MCP host (agent side, works with any OLIP endpoint):

```json
{ "command": "node", "args": ["reference/mcp-adapter.mjs"],
  "env": { "OLIP_BASE": "http://127.0.0.1:8787", "OLIP_CLIENT_ID": "cli_agent_a", "OLIP_CLIENT_SECRET": "test-secret-agent-a" } }
```

What to look at in the demo: the interpretation says what is still unknown; the list states its order and that payment never changes it; the preview names one recipient and every shared value; only the user can approve (a code goes to the fictional user's inbox); the final state is `delivered` with a signed receipt, which is not "read" and not "accepted".

Timing: on the build machine the full sequence (install with a warm package cache, start, demo, 30 checks) took about 2 seconds. It has **not** yet been timed with an outside developer on a clean machine; the 30-minute goal is untested.
