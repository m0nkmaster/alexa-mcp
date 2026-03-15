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
