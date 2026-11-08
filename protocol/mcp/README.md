# Listing OLIP in the MCP Registry (status: DRAFTED, not published)

The official MCP Registry (registry.modelcontextprotocol.io) lists **MCP servers that clients can actually connect to**: a remote URL or a published package. It does not list documents or standards. OLIP has no hosted MCP server yet, so `server.json.draft` cannot be published as it is. Publishing a listing that points nowhere would be a fake endpoint.

What is needed, in order:

1. **Host the sandbox.** Run `reference/server.mjs` (fictional data only) and an HTTP (streamable-http) version of `reference/mcp-adapter.mjs` on a server, for example the sponsor's existing VPS, at an address such as `https://sandbox.olip.ai/mcp`. A DNS record for `sandbox.olip.ai` needs the owner's approval. The adapter currently speaks stdio only; an HTTP transport is a small addition.
2. **Choose the registry name.** `io.github.olip-ai/olip-sandbox` can be published from a GitHub Actions workflow in the public `olip-ai` repository (GitHub sign-in proves the `olip-ai` namespace). `ai.olip/sandbox` would need a DNS TXT record on olip.ai to prove the namespace, which also needs the owner's approval.
3. **Publish.** Put the real URL in `remotes`, then run the registry workflow.

Until then, the "OLIP over MCP" guide on olip.ai tells developers to run the adapter locally against any OLIP endpoint.
