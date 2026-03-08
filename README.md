# alexa-mcp

MCP server and CLI for Alexa devices and smart home control via the unofficial Alexa API.

## Requirements

- Node.js 18+
- Amazon Alexa account (amazon.com, amazon.co.uk, or amazon.de)
- Refresh token from `alexacli auth` or [alexa-cookie-cli](https://github.com/adn77/alexa-cookie-cli)

## Setup

1. Get a refresh token:
   - Run `alexacli auth` (stores in `~/.alexa-cli/config.json`), or
   - Set `ALEXA_REFRESH_TOKEN` env var

2. Install:
   ```bash
   npm install alexa-mcp
   ```

## CLI

```bash
alexa-mcp devices                  # List Echo devices
alexa-mcp speak "Hello" -d Office  # Speak on a device
alexa-mcp announce "Dinner ready"  # Announce to all devices
alexa-mcp command -d Office "play jazz" # Voice command
alexa-mcp appliances               # List smart home devices
alexa-mcp control <entityId> turnOn|turnOff|setBrightness [--brightness 50]
alexa-mcp routines                 # List routines
alexa-mcp run <automationId>       # Run a routine
```

## MCP Server

Add to your Cursor MCP config (e.g. `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "alexa": {
      "command": "node",
      "args": ["/path/to/alexa-mcp/dist/index.js"]
    }
  }
}
```

When installed locally, use the path to `node_modules/alexa-mcp/dist/index.js`.

### MCP Tools

| Tool | Description |
|------|-------------|
| `alexa_list_devices` | List Echo devices |
| `alexa_speak` | TTS on a device |
| `alexa_announce` | Announce to all |
| `alexa_command` | Voice command |
| `alexa_list_appliances` | List smart home devices |
| `alexa_control_appliance` | turnOn/turnOff/setBrightness |
| `alexa_list_routines` | List routines |
| `alexa_run_routine` | Run a routine |

## Development

```bash
npm install
npm run build
npm test
npm run test:integration  # Requires ALEXA_REFRESH_TOKEN
```

## API Reference

See [docs/](docs/) for raw HTTP API reference.
