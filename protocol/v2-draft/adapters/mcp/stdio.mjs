#!/usr/bin/env node
// Runs the OLIP 2.0-draft lifecycle MCP adapter over stdio (official SDK transport).
// Env: OLIP_V2_BASE (host URL), OLIP_AGENT_CLIENT_ID, OLIP_AGENT_CLIENT_SECRET, OLIP_DELEGATION_CODE (the one-time code the USER created).
// The adapter receives an agent token only. It never receives a user session or a firm credential.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OlipLifecycleClient } from "../../sdk/typescript/dist/index.js";
import { createLifecycleMcpServer } from "./server.mjs";

const base = process.env.OLIP_V2_BASE || "http://127.0.0.1:8787";
const client = new OlipLifecycleClient(base);
await client.negotiate();
if (process.env.OLIP_DELEGATION_CODE) await client.agentToken(process.env.OLIP_AGENT_CLIENT_ID, process.env.OLIP_AGENT_CLIENT_SECRET, process.env.OLIP_DELEGATION_CODE);
const { server } = createLifecycleMcpServer({ client });
await server.connect(new StdioServerTransport());
