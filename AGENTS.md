# AGENT.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

MCP server and CLI for controlling Alexa/Echo devices and smart home appliances via the unofficial Alexa app API. Supports UK (amazon.co.uk), US (amazon.com), and DE (amazon.de) regions.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm test               # Run unit tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run test:integration  # Integration tests (requires ALEXA_REFRESH_TOKEN)
npm run test:e2e       # E2E CLI tests (requires auth via `alexa-mcp auth`)
```

Run a single test file:
```bash
npx vitest run test/e2e.test.ts
```

## Architecture

**Entry points:**
- `src/index.ts` - MCP server (stdio transport, registers tools from mcp-tools.ts)
- `src/cli.ts` - CLI (commander-based, uses AlexaClient directly)

**Core modules:**
- `src/client.ts` - `AlexaClient` class with all API methods (devices, appliances, routines, media, smart home control)
- `src/mcp-tools.ts` - MCP tool registrations that wrap AlexaClient methods
- `src/auth.ts` - Token exchange (refresh token → cookies) and CSRF extraction
- `src/config.ts` - Region configs (domain, API base URLs, locale, cookie suffix)
- `src/config-store.ts` - Config persistence (~/.alexa-mcp/config.json)

**API patterns:**
- All requests go to app API (eu-api-alexa.amazon.co.uk or na-api-alexa.amazon.com)
- Auth: Cookie + `csrf` header (from /api/language Set-Cookie)
- Smart home control uses GraphQL at `/nexus/v1/graphql` with `amzn1.alexa.endpoint.*` IDs
- Some appliance control uses PUT `/api/phoenix/state` for non-GraphQL entity IDs

**Key types:**
- `Device` - Echo devices (accountName, serialNumber, deviceType, deviceOwnerCustomerId)
- `Appliance` - Smart home devices (entityId, endpointId, friendlyName)
- `Routine` - Alexa routines (automationId, name, sequence)

## Testing

Tests use vitest with globals enabled. Integration/E2E tests are skipped unless `TEST_INTEGRATION=1` is set.

Integration tests require a valid refresh token (set `ALEXA_REFRESH_TOKEN` env var or run `alexa-mcp auth` first).

## API Reference

See `docs/API.md` for the complete unofficial API documentation including endpoints, request/response shapes, and authentication details.
