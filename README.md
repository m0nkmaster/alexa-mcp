# alexa-mcp

MCP server and CLI for Alexa devices and smart home control via the unofficial Alexa API.

## Requirements

- Node.js 18+
- Amazon Alexa account (amazon.com, amazon.co.uk, or amazon.de)

## Setup

1. Install:
   ```bash
   npm install alexa-mcp
   ```

2. Authenticate:
   ```bash
   alexa-mcp auth
   ```
   Opens a URL (tunnel or localhost) for you to log in to Amazon. Works locally or headless (remote server) — same behaviour either way. Uses cloudflared or localtunnel automatically; no account required.

   Or headless:
   ```bash
   alexa-mcp auth --token "Atnr|..."
   alexa-mcp auth --token-file /path/to/token.txt
   ```

3. Config stored in `~/.alexa-mcp/config.json`. Also reads `~/.alexa-cli/config.json` or `ALEXA_REFRESH_TOKEN`.

## CLI

```bash
alexa-mcp auth                     # Interactive auth (browser / tunnel URL)
alexa-mcp auth --token <token>     # Save token (headless)
alexa-mcp auth status [--verify]   # Show auth status
alexa-mcp auth logout              # Remove credentials
alexa-mcp devices                  # List Echo devices
alexa-mcp speak "Hello" -d Office  # Speak on a device
alexa-mcp announce "Dinner ready"  # Announce to all devices
alexa-mcp command -d Office "play jazz" # Voice command
alexa-mcp switch "TV" off -d Office     # Turn off smart plug/light by name (no entity ID needed)
alexa-mcp appliances               # List smart home devices
alexa-mcp control <entityId> turnOn|turnOff|setBrightness [--brightness 50]
alexa-mcp routines                 # List routines
alexa-mcp run <automationId>       # Run a routine
```

**Smart home (UK / empty list):** If `alexa-mcp appliances` returns `[]`, use **`switch`** or **`command`** to control by the name Alexa knows: `alexa-mcp switch "TV" off -d Office`. See [docs/API.md](docs/API.md).

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
| `alexa_control_appliance` | turnOn/turnOff/setBrightness (by entity ID) |
| `alexa_switch_by_name` | Turn device on/off by name (e.g. "TV") when list is empty |
| `alexa_list_routines` | List routines |
| `alexa_run_routine` | Run a routine |
| `alexa_auth_status` | Check auth status |

## Development

```bash
npm install
npm run build
npm test
npm run test:integration  # Requires ALEXA_REFRESH_TOKEN
```

## API Reference

The single authoritative API reference is **[docs/API.md](docs/API.md)** — region base URLs, authentication, all endpoints (devices, routines, smart home, behaviors, alarms, media), request/response bodies, and headers.
