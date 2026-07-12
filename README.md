# Alexa MCP

[![npm version](https://badge.fury.io/js/alexa-mcp.svg)](https://www.npmjs.com/package/alexa-mcp)
[![CI](https://github.com/m0nkmaster/alexa-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/m0nkmaster/alexa-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Control your Alexa devices and smart home from the command line or AI assistants.**

MCP server and CLI for Alexa/Echo devices and smart home control via the unofficial Alexa API. Works with Claude Desktop, Cursor, VS Code, and other MCP-compatible tools.

## Features

- 🎙️ **Voice & Media Control** - TTS, announcements, playback control
- 💡 **Smart Home** - Control lights, plugs, and devices by name, pattern, or room group
- ✅ **State Verification** - Every control command returns live device state (power, brightness, colour temp)
- 🔍 **Device Status** - Query current state of any device by name without issuing a command
- 🏠 **Group Membership** - List all devices in a room group for post-action verification
- 🤖 **Routines** - List and run routines by name, partial name, or automation ID
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
alexa-mcp devices                           # List Echo devices
alexa-mcp speak "Hello" -d Office           # TTS on one device (positional text)
alexa-mcp speak --text "Hello" --device Office  # Same, flag form
alexa-mcp announce "Dinner ready"           # Broadcast to ALL Echo devices
alexa-mcp announce --text "Dinner ready"    # Same, flag form
alexa-mcp command -d Office "play jazz"     # Voice command
alexa-mcp speak --json --text "Hi" -d Office  # Structured JSON output
```

**Smart Home:**
```bash
alexa-mcp groups                              # List room groups
alexa-mcp group-members Kitchen               # Resolved members + unresolved/stale IDs
alexa-mcp appliances                          # List smart home devices
alexa-mcp appliances --type light             # Filter by type: light, switch, plug, sensor, camera
alexa-mcp status "Lounge lamp"                # Get current state (power, brightness, colour temp)
alexa-mcp switch-group Kitchen off            # Turn off lights in room group
alexa-mcp switch-group Kitchen off --dry-run  # Plan targets (name + endpointId) only
alexa-mcp switch-room "kitchen lights" off    # Turn off devices by pattern
alexa-mcp switch-room "kitchen" off --dry-run # Plan pattern matches only
alexa-mcp switch "Lounge light 2" off         # Turn off single device → live state JSON
alexa-mcp control <entityId> turnOn           # Direct device control → live state JSON
alexa-mcp batch-control turnOff e1 e2 e3      # Batch control → per-device results + success/partial
alexa-mcp batch-control turnOff e1 e2 --dry-run
```

**Routines & Media:**
```bash
alexa-mcp routines                              # List routines (includes name field)
alexa-mcp run <automationId>                    # Run a routine by ID
alexa-mcp run --name "our bedtime"              # Run a routine by exact name
alexa-mcp run --partial "bedtime"               # Run a routine by partial name match
alexa-mcp now-playing -d Office                 # Show now-playing
alexa-mcp media play|pause|next -d Office       # Media control
```

**Tips:**
- `announce` always broadcasts to **all** Echo devices. For one device, use `speak --text … --device …`
- Use `switch-group` for "all lights in [room]" (e.g., `Kitchen`). Unresolved/stale members are skipped by default (`--include-unresolved` to try raw IDs)
- Use `switch-room` for pattern matching — tries all-words first, falls back to any-word
- Use `switch` for single devices; matching is exact → startsWith → contains (ambiguous matches return suggestions)
- Group/pattern/batch results include `success` and `partial` flags; partial failures exit with code `2`
- Use `--dry-run` on `switch-group`, `switch-room`, and `batch-control` to preview targets
- Use `status` to verify device state without issuing a command
- Use `group-members` to see resolved members vs unresolved endpoint IDs
- Control commands return JSON state where applicable; plain-text commands accept `--json`
- Direct control methods avoid voice profile issues
- See [docs/API.md](docs/API.md) for full API reference

### MCP Server Setup

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
- `alexa_speak` - Text-to-speech on a single device
- `alexa_announce` - Broadcast announcement to **all** Echo devices (not device-specific; use `alexa_speak` for one device)
- `alexa_command` - Send voice command

**Smart Home:**
- `alexa_list_appliances` - List smart home devices; optional `type` filter (light/switch/plug/sensor/camera)
- `alexa_device_status` - Get live state of a device by name (power, brightness, colour temp, reachability)
- `alexa_list_device_groups` - List room groups with member counts
- `alexa_group_members` - List group members as `{group, members, unresolved}` (stale endpoint IDs separated)
- `alexa_control_by_group` - Control lights in a room group; skips unresolved members; returns `success`/`partial`
- `alexa_control_by_pattern` - Control devices by name pattern (fuzzy fallback: any-word match if all-word fails)
- `alexa_switch_by_name` - Control single device by name (exact → startsWith → contains; ambiguous → suggestions)
- `alexa_control_appliance` - Direct control by entity/endpoint ID
- `alexa_batch_control_appliances` - Batch control with same action; returns per-device results with `success`/`partial`
- `alexa_batch_control_appliances_custom` - Batch control with per-device actions; returns per-device results
- `alexa_get_brightness_by_name` - Get device brightness and power state
- `alexa_set_brightness_by_name` - Set device brightness
- `alexa_get_color_temperature_by_name` - Get device colour temperature
- `alexa_set_color_temperature_by_name` - Set device colour temperature

**Routines & Media:**
- `alexa_list_routines` - List Alexa routines with names and automation IDs
- `alexa_run_routine` - Execute a routine by `automationId`, exact `name`, or `partial` name match
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
npm install              # Install dependencies
npm run build           # Compile TypeScript
npm test                # Run unit tests
npm run test:integration # Run integration tests (requires auth)
npm run lint            # Check code style
npm run lint:fix        # Fix code style issues
```

## Documentation

- **[API Reference](docs/API.md)** - Complete unofficial Alexa API documentation
- **[Device Capabilities](docs/DEVICE-CAPABILITIES.md)** - Device capability reference
- **[User Stories](docs/USER-STORIES.md)** - Usage examples and patterns

## Requirements

- Node.js 18+
- Amazon Alexa account (amazon.com, amazon.co.uk, or amazon.de)

## License

MIT - See LICENSE file for details

## Contributing

Contributions welcome! Please follow [conventional commits](https://www.conventionalcommits.org/) format.

## Acknowledgments

Built on the unofficial Alexa API. Uses [alexa-cookie2](https://github.com/Apollon77/alexa-cookie) for authentication.
