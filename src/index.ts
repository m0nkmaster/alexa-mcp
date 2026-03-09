#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAlexaTools, createClient } from "./mcp-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
) as { version?: string };

const server = new McpServer({
  name: "alexa-mcp",
  version: pkg.version ?? "0.1.0",
});

let clientPromise: ReturnType<typeof createClient> | null = null;

registerAlexaTools(server, async () => {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
});

const transport = new StdioServerTransport();
await server.connect(transport);
