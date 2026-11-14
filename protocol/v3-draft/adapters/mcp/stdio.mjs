#!/usr/bin/env node
// Runs the OLIP 3.0-draft MCP adapter over stdio for a local MCP host (fictional sandbox only).
//   OLIP_V3_BASE=http://127.0.0.1:PORT OLIP_V3_AGENT_TOKEN=... node adapters/mcp/stdio.mjs
// Get the base and a fictional agent token from `npm start` (reference/start.mjs prints both).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OlipAgentClient } from "../../sdk/typescript/dist/index.js";
import { createAgentMcpServer } from "./server.mjs";
const base = process.env.OLIP_V3_BASE, token = process.env.OLIP_V3_AGENT_TOKEN;
if (!base || !token) { console.error("Set OLIP_V3_BASE and OLIP_V3_AGENT_TOKEN (see reference/start.mjs)."); process.exit(2); }
const { server } = createAgentMcpServer({ client: new OlipAgentClient(base, { token }) });
await server.connect(new StdioServerTransport());
