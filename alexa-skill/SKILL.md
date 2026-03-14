---
description: Use the alexa-mcp MCP server to control Alexa devices and smart home - from installation and login through full use of all features
---

# alexa-mcp Skill

This skill covers the complete lifecycle: installing alexa-mcp, authenticating with Amazon, configuring the MCP server, and using every available tool.

---

## 1. Installation

```bash
# Option A: global install (recommended for MCP server use)
npm install -g alexa-mcp

# Option B: local install in a project
npm install alexa-mcp

# Option C: one-off use without installing
npx alexa-mcp auth
```

**Requirements:** Node.js 18+

---

## 2. Authentication

### Interactive (browser/tunnel) — recommended for first-time setup

```bash
alexa-mcp auth
```

Prints a URL (cloudflared tunnel or `http://127.0.0.1:8080`). Open it in a browser and log in to Amazon. The refresh token is saved to `~/.alexa-mcp/config.json` automatically.

**For non-UK accounts**, add `--domain`:

```bash
alexa-mcp auth --domain amazon.com   # US
alexa-mcp auth --domain amazon.de    # Germany
```

### Headless (token already known)

```bash
alexa-mcp auth --token "Atnr|..."
alexa-mcp auth --token-file /path/to/token.txt
```

### Validate without saving

```bash
alexa-mcp auth --no-save --token "Atnr|..."
```

### Check status

```bash
alexa-mcp auth status           # show domain + masked token + config path
alexa-mcp auth status --verify  # also calls API to confirm token is valid
                                # prints Account (deviceOwnerCustomerId) for profile matching
```

### Logout

```bash
alexa-mcp auth logout
```

### Environment variables (alternative to file config)

| Variable | Description |
|----------|-------------|
| `ALEXA_REFRESH_TOKEN` | Refresh token — skips config file lookup entirely |
| `ALEXA_DOMAIN` | Amazon domain (default: `amazon.co.uk`; also: `amazon.com`, `amazon.de`) |
| `ALEXA_DEBUG` | Set to any value to log API request/response details to stderr |

---

## 3. MCP Server Configuration

Add the server to your AI client's MCP config. Use the appropriate path for your install method.

### Cursor (`~/.cursor/mcp.json`) or VS Code (`.vscode/mcp.json`)

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

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

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

### Global install (npx)

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

### With token in config (no separate auth step needed)

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

After saving the config, restart your AI client.

---

## 4. Verifying the Connection

Use `alexa_auth_status` as your first tool call to confirm the MCP server is running and authenticated:

```
tool: alexa_auth_status
input: {}
```

Expected response (success):
```json
{ "configured": true, "valid": true, "deviceCount": 5 }
```

If `configured: false`, authentication is needed. If `valid: false`, the token has expired — run `alexa-mcp auth` again.

---

## 5. Discovering Devices and Groups

Before controlling anything, discover what's on the account.

### List Echo devices

```
tool: alexa_list_devices
input: {}
```

Returns array of `{ accountName, serialNumber, deviceType, deviceFamily, deviceOwnerCustomerId, online }`. Use `accountName` (or `serialNumber`) as the `device` parameter in other tools.

### List smart home appliances

```
tool: alexa_list_appliances
input: {}
```

Returns `{ entityId, endpointId, friendlyName, applianceTypes, isReachable, deviceOwnerCustomerId }`. Use `endpointId` (`amzn1.alexa.endpoint.*`) as `entityId` for direct control.

### List room/space groups

```
tool: alexa_list_device_groups
input: {}
```

Returns `{ name, groupId, type, applianceCount }`. Use `name` with `alexa_control_by_group`.

### List multi-room audio groups

```
tool: alexa_list_audio_groups
input: {}
```

Returns `{ id, name, members[] }` — Downstairs, Everywhere, etc.

### List routines

```
tool: alexa_list_routines
input: {}
```

Returns `{ automationId, name, status, type }`. Use `automationId` with `alexa_run_routine`.

---

## 6. Speech and Announcements

### Speak text on a specific Echo

```
tool: alexa_speak
input: { "device": "Office", "text": "Hello, the meeting starts in 5 minutes" }
```

`device` is matched case-insensitively by `accountName` or exact `serialNumber`.

### Announce to all devices

```
tool: alexa_announce
input: { "text": "Dinner is ready" }
```

Plays on every Echo on the account simultaneously.

### Send a voice command (ask Alexa a question)

```
tool: alexa_command
input: { "device": "Lounge", "text": "What's the weather today?" }
```

**Important:** No response is returned. Alexa speaks the answer on the Echo. For smart home control, prefer direct control tools below — voice commands can fail with profile/account issues and return no feedback.

---

## 7. Smart Home Control

### Decision guide

| Goal | Tool to use |
|------|-------------|
| Turn a single named device on/off | `alexa_switch_by_name` |
| Control all lights in a room group | `alexa_control_by_group` |
| Control devices matching a name pattern | `alexa_control_by_pattern` |
| Control by exact endpoint/entity ID | `alexa_control_appliance` |
| Set brightness on a specific bulb | `alexa_control_appliance` with `setBrightness` |

### Turn a single device on/off by name

```
tool: alexa_switch_by_name
input: { "name": "Lounge light 2", "state": "off" }
```

Optional `device` field for voice fallback if direct control fails:
```
input: { "name": "Lounge Lamp", "state": "on", "device": "Lounge Echo" }
```

### Control all lights in a room group

First, call `alexa_list_device_groups` to get group names, then:

```
tool: alexa_control_by_group
input: { "groupName": "Kitchen", "state": "off" }
```

By default only devices with `light`, `lamp`, or `bulb` in their name are controlled. To control all appliances in the group:
```
input: { "groupName": "Kitchen", "state": "off", "lightsOnly": false }
```

`alexa_control_group` is an equivalent alias with the same parameters (`group` instead of `groupName`).

### Control devices by name pattern

```
tool: alexa_control_by_pattern
input: { "pattern": "kitchen lights", "state": "on" }
```

All space-separated words must appear in the device's `friendlyName` (case-insensitive). Plural/singular is handled automatically (`lights` matches `light` and vice versa).

### Control by endpoint ID (direct)

```
tool: alexa_control_appliance
input: { "entityId": "amzn1.alexa.endpoint.abc123", "action": "turnOn" }
```

Set brightness (0–100):
```
input: { "entityId": "amzn1.alexa.endpoint.abc123", "action": "setBrightness", "brightness": 50 }
```

`endpointId` values (`amzn1.alexa.endpoint.*`) use GraphQL control (preferred). Other IDs fall back to the phoenix API.

---

## 8. Routines

### List routines

```
tool: alexa_list_routines
input: {}
```

### Run a routine

```
tool: alexa_run_routine
input: { "automationId": "amzn1.alexa.behaviors.trigger...." }
```

Get the `automationId` from `alexa_list_routines`.

---

## 9. Media Control

Media transport requires active playback. To start playback, use `alexa_command` first (e.g. "play jazz"), then use transport controls.

### Get now-playing state

```
tool: alexa_now_playing
input: { "device": "Lounge" }
```

Returns playback state including `taskSessionId`. If `taskSessionId` is absent, nothing is playing.

### Transport commands

```
tool: alexa_media_control
input: { "device": "Lounge", "command": "pause" }
```

Valid commands: `play`, `pause`, `resume`, `stop`, `next`, `previous`.

**Note:** Media control is fully supported on EU/UK accounts (amazon.co.uk, amazon.de). US support may vary.

---

## 10. Workflow: Full Smart Home Session

A typical AI session to control lights:

1. **Check auth:** `alexa_auth_status` → confirm `valid: true`
2. **Discover groups:** `alexa_list_device_groups` → find "Kitchen" group
3. **Discover appliances:** `alexa_list_appliances` → note `endpointId` values
4. **Control:** `alexa_control_by_group` `{ "groupName": "Kitchen", "state": "on" }`
5. **Adjust brightness:** `alexa_control_appliance` `{ "entityId": "amzn1.alexa.endpoint.xyz", "action": "setBrightness", "brightness": 70 }`

---

## 11. Workflow: Full Music Session

1. **Check auth:** `alexa_auth_status`
2. **Discover devices:** `alexa_list_devices` → find the target Echo
3. **Start playback:** `alexa_command` `{ "device": "Lounge", "text": "play some jazz" }`
4. **Check state:** `alexa_now_playing` `{ "device": "Lounge" }` → capture `taskSessionId`
5. **Transport:** `alexa_media_control` `{ "device": "Lounge", "command": "next" }`

---

## 12. Account and Profile Troubleshooting

If smart home control fails with "can't control – wrong account":

- `alexa_auth_status` does not expose the `deviceOwnerCustomerId` directly — run `alexa-mcp auth status --verify` from the CLI to see which account ID the token belongs to.
- Run `alexa-mcp devices --owners` (CLI) to see which account owns each Echo.
- Run `alexa-mcp appliances` (CLI) to see `deviceOwnerCustomerId` per smart home device.
- If IDs don't match, log out and re-authenticate as the account that owns the target device.

---

## 13. Known Limitations

- **Voice commands (`alexa_command`)** send text to Alexa but no structured response is returned. The Echo speaks the answer but it is not captured by the MCP.
- **Media control** requires playback to already be active. Use `alexa_command` to start a stream, then `alexa_media_control` to control it.
- **`alexa_control_by_group` (lightsOnly default):** Only devices with `light`, `lamp`, or `bulb` in their name are targeted by default. Pass `"lightsOnly": false` to include all appliances.
- **Timers and alarms** are not yet implemented as MCP tools (API gap).
- **Volume control, DND, reminders** are not yet exposed as MCP tools.
- **US accounts:** Media transport (`alexa_now_playing`, `alexa_media_control`) may have reduced reliability compared to EU/UK.
