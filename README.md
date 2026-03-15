# Alexa MCP

[![npm version](https://badge.fury.io/js/alexa-mcp.svg)](https://www.npmjs.com/package/alexa-mcp)
[![CI](https://github.com/m0nkmaster/alexa-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/m0nkmaster/alexa-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Control your Alexa devices and smart home from the command line or AI assistants.**

MCP server and CLI for Alexa/Echo devices and smart home control via the unofficial Alexa API. Works with Claude Desktop, Cursor, VS Code, and other MCP-compatible tools.

## Features

- 🎙️ **Voice & Media Control** - TTS, announcements, playback control
- 💡 **Smart Home** - Control lights, plugs, and devices by name, pattern, or room group
- 🤖 **Routines** - List and trigger Alexa routines
- 🌍 **Multi-Region** - Supports US (amazon.com), UK (amazon.co.uk), and DE (amazon.de)
- 🔌 **MCP Integration** - Use with Claude, Cursor, and other AI assistants
- 🛠️ **CLI & Programmatic** - Command-line tool or Node.js library

## Quick Start

### Installation

```bash
# Global install (recommended for CLI usage)
npm install -g alexa-mcp

# Or use without installing
npx alexa-mcp auth
```

### Authentication
**Interactive (browser-based):**
```bash
alexa-mcp auth
```
Opens a URL for you to log in to Amazon. Works locally or on remote servers using automatic tunneling (cloudflared or localtunnel).

**Headless (token-based):**
```bash
alexa-mcp auth --token "Atnr|..."
alexa-mcp auth --token-file /path/to/token.txt
alexa-mcp auth --domain amazon.com   # US account (default: amazon.co.uk)
```

Configuration is stored in `~/.alexa-mcp/config.json`.

## Usage

### CLI Commands

**Authentication:**
```bash
alexa-mcp auth                    # Interactive auth
alexa-mcp auth status [--verify]  # Check auth status
alexa-mcp auth logout             # Remove credentials
```

**Devices & Voice:**
```bash
alexa-mcp devices                      # List Echo devices
alexa-mcp speak "Hello" -d Office      # Text-to-speech on device
alexa-mcp announce "Dinner ready"      # Announce to all devices
alexa-mcp command -d Office "play jazz" # Voice command
```

**Smart Home:**
```bash
alexa-mcp groups                           # List room groups
alexa-mcp appliances                       # List smart home devices
alexa-mcp switch-group Kitchen off         # Turn off lights in room group
alexa-mcp switch-room "kitchen lights" off # Turn off devices by pattern
alexa-mcp switch "Lounge light 2" off      # Turn off single device
alexa-mcp control <entityId> turnOn        # Direct device control
```

**Routines & Media:**
```bash
alexa-mcp routines                         # List routines
alexa-mcp run <automationId>               # Run a routine
alexa-mcp now-playing -d Office            # Show now-playing
alexa-mcp media play|pause|next -d Office  # Media control
```

**Tips:**
- Use `switch-group` for "all lights in [room]" (e.g., `Kitchen`)
- Use `switch-room` for pattern matching (e.g., `"kitchen lights"`)
- Use `switch` for single devices by exact name
- Direct control methods avoid voice profile issues
- See [docs/API.md](docs/API.md) for full API reference

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

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ALEXA_REFRESH_TOKEN` | Refresh token (skips config file) |
| `ALEXA_DOMAIN` | Amazon domain: `amazon.co.uk` (default), `amazon.com`, `amazon.de` |
| `ALEXA_DEBUG` | Enable API request/response logging |

## MCP Server Setup

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "alexa": {
      "command": "npx",
      "args": ["alexa-mcp"]
    }
  }
}
```

### Cursor / VS Code

Edit `~/.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "alexa": {
      "command": "npx",
      "args": ["alexa-mcp"]
    }
  }
}
```

### Using Environment Variables

Pass token directly (no config file needed):

```json
{
  "mcpServers": {
    "alexa": {
      "command": "npx",
      "args": ["alexa-mcp"],
      "env": {
        "ALEXA_REFRESH_TOKEN": "Atnr|...",
        "ALEXA_DOMAIN": "amazon.co.uk"
      }
    }
  }
}
```

### Local Installation

If installed locally, use the full path:

```json
{
  "mcpServers": {
    "alexa": {
      "command": "node",
      "args": ["/path/to/node_modules/alexa-mcp/dist/index.js"]
    }
  }
}
```

### Available MCP Tools

**Devices & Voice:**
- `alexa_list_devices` - List Echo devices
- `alexa_speak` - Text-to-speech on a device
- `alexa_announce` - Announce to all devices
- `alexa_command` - Send voice command

**Smart Home:**
- `alexa_list_appliances` - List smart home devices
- `alexa_list_device_groups` - List room groups
- `alexa_control_by_group` - Control all lights in a room group
- `alexa_control_by_pattern` - Control devices by name pattern
- `alexa_switch_by_name` - Control single device by name
- `alexa_control_appliance` - Direct control by entity/endpoint ID
- `alexa_get_brightness_by_name` - Get device brightness
- `alexa_set_brightness_by_name` - Set device brightness

**Routines & Media:**
- `alexa_list_routines` - List Alexa routines
- `alexa_run_routine` - Execute a routine
- `alexa_list_audio_groups` - List multi-room audio groups
- `alexa_now_playing` - Get now-playing state
- `alexa_media_control` - Control playback (play/pause/next/etc.)
- `alexa_get_volume` / `alexa_set_volume` - Volume control

**Authentication:**
- `alexa_auth_status` - Check authentication status

## Troubleshooting

### "Can't control – may need to switch user accounts"

This error occurs when the Amazon account you authenticated with doesn't own the device.

**Solution:**
1. Run `alexa-mcp auth logout`
2. Run `alexa-mcp auth` and sign in with the account that owns the device
3. Verify with `alexa-mcp auth status --verify`

**Check device ownership:**
```bash
alexa-mcp devices --owners    # Show Echo device owners
alexa-mcp appliances          # Show smart home device owners
```

The `deviceOwnerCustomerId` must match between your authenticated account and the device.

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
