#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAlexaTools, createClient } from "./mcp-tools.js";

const server = new McpServer({
  name: "alexa-mcp",
  version: "0.1.0",
});

let clientPromise: ReturnType<typeof createClient> | null = null;

registerAlexaTools(server, async () => {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
});

const transport = new StdioServerTransport();
await server.connect(transport);
