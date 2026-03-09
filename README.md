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
alexa-mcp devices --owners         # Show device names and owner customer IDs (profile matching)
alexa-mcp speak "Hello" -d Office  # Speak on a device
alexa-mcp announce "Dinner ready"  # Announce to all devices
alexa-mcp command -d Office "play jazz" # Voice command
alexa-mcp switch-group Kitchen off  # Turn off all lights in group (from list_device_groups)
alexa-mcp switch-room "kitchen lights" off  # Turn off all matching by name pattern
alexa-mcp switch "Lounge light 2" off  # Turn off single device by name (direct control; -d for voice fallback)
alexa-mcp appliances               # List smart home devices (endpointId + friendlyName when available)
alexa-mcp control <entityId> turnOn|turnOff|setBrightness [--brightness 50]
alexa-mcp routines                 # List routines
alexa-mcp run <automationId>       # Run a routine
alexa-mcp now-playing -d Office   # Now-playing state (EU/UK)
alexa-mcp media play -d Office    # Play/pause/stop/next/previous (EU/UK)
```

**Smart home:** For "all lights in group Kitchen", use `switch-group Kitchen off`. For pattern matching (e.g. "kitchen lights"), use `switch-room`. Both use direct control—avoids voice profile issues. `switch` is for a single device. Voice commands (`command`) do not return Alexa's response. See [docs/API.md](docs/API.md).

### "Can't control – may need to switch user accounts"

If the Echo says it can't control the device and suggests switching user accounts:

- **Who the CLI uses:** The CLI always acts as the **Amazon account you signed in with** when you last ran `alexa-mcp auth`. It does not use the Echo’s current profile. Changing the Echo’s profile in the Alexa app does **not** change which account the CLI uses.
- **When you use profiles (e.g. Rob vs Emma):** You must run the CLI as the **same account that owns the smart home device**. So:
  1. Run `alexa-mcp auth logout`.
  2. Run `alexa-mcp auth` and sign in as the **household member who can say “Alexa, turn off Lounge Lamp”** on that Echo and have it work (the account that “owns” the lamp in the Alexa app).
  3. Then run `alexa-mcp switch "Lounge Lamp" off -d "Lounge Echo"` again.
- **Single account:** If there’s only one account, ensure the lamp is linked to that account in the Alexa app (Devices → Lights/Plugs).

### Seeing which profile owns devices

Each Echo and smart home device has a **deviceOwnerCustomerId** (Amazon’s internal account ID). The CLI uses the account you signed in with; that account has one or more such IDs. To see who owns what:

- **Echo devices:**  
  `alexa-mcp devices --owners`  
  Prints each device name and its `deviceOwnerCustomerId`. Use the same account for `alexa-mcp auth` as the one that owns the Echo you’re targeting.

- **Smart home appliances:**  
  `alexa-mcp appliances`  
  The JSON includes `deviceOwnerCustomerId` per device (when the API provides it). Match this to the account you use for auth.

- **Which account the CLI is using:**  
  `alexa-mcp auth status --verify`  
  Shows “Account (deviceOwnerCustomerId): …” for the current session. Control will work when this matches the owner of the Echo and the smart home device.

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
| `alexa_command` | Voice command (no response returned; prefer direct control for smart home) |
| `alexa_list_appliances` | List smart home devices |
| `alexa_control_appliance` | turnOn/turnOff/setBrightness (by entity ID) |
| `alexa_control_by_group` | Turn on/off lights in room group (e.g. "Kitchen") — **for "all lights in group X"** |
| `alexa_control_by_pattern` | Turn on/off devices matching name pattern (e.g. "kitchen lights") |
| `alexa_switch_by_name` | Turn single device on/off by name |
| `alexa_list_device_groups` | List room groups (Living room, Kitchen, etc.) |
| `alexa_list_audio_groups` | List multi-room audio groups |
| `alexa_list_routines` | List routines |
| `alexa_run_routine` | Run a routine |
| `alexa_now_playing` | Now-playing state for a device (EU/UK) |
| `alexa_media_control` | Play, pause, resume, stop, next, previous (EU/UK) |
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

**API usage:** All supported regions use the **app API** (eu-api-alexa for UK/EU, na-api-alexa for US): devices-v2, routinesandgroups, behaviors/preview, smarthome/v2/endpoints, layouts, and GraphQL for smart home control.
