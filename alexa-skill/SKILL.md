---
description: Control Alexa devices and smart home via MCP - authentication, configuration, and all available tools
---

# alexa-mcp Skill

## 1. Installation

```bash
npm install -g alexa-mcp  # Recommended
# or: npx alexa-mcp
```

Requires Node.js 18+

---

## 2. Authentication

**For bots:** Run `alexa-mcp auth --domain amazon.com` (or their regional domain), which prints a URL to ask them to visit. After login, token saves on your device to `~/.alexa-mcp/config.json`.

**MCP server auto-reads** `~/.alexa-mcp/config.json`. For manual config:

```bash
export ALEXA_REFRESH_TOKEN="Atnr|..."  # Token from config.json
export ALEXA_DOMAIN="amazon.com"       # or amazon.co.uk, amazon.de
```

**Quick commands:**
```bash
alexa-mcp auth status --verify  # Check auth + account ID
alexa-mcp auth logout           # Remove credentials
```

---

## 3. MCP Server Configuration

Add to MCP config, then restart client:

```json
{
  "mcpServers": {
    "alexa": {
      "command": "npx",
      "args": ["alexa-mcp"],
      "env": {
        "ALEXA_REFRESH_TOKEN": "Atnr|...",  // Optional - uses ~/.alexa-mcp/config.json if omitted
        "ALEXA_DOMAIN": "amazon.com"        // Optional - defaults to amazon.co.uk
      }
    }
  }
}
```

---

## 4. CLI Commands (Optional)

Direct CLI usage without MCP server:

```bash
# Discovery
alexa-mcp devices              # List Echo devices
alexa-mcp appliances           # List smart home devices
alexa-mcp groups               # List device groups
alexa-mcp routines             # List routines

# Control
alexa-mcp speak --device "Office" --text "Meeting in 5 minutes"
alexa-mcp announce --text "Dinner is ready"
alexa-mcp command --device "Lounge" --text "play jazz"
alexa-mcp control --name "Kitchen light" --state on
alexa-mcp control --group "Bedroom" --state off
alexa-mcp routine --id "amzn1.alexa.behaviors.trigger..."

# Media
alexa-mcp play --device "Lounge"      # Resume playback
alexa-mcp pause --device "Lounge"     # Pause playback
alexa-mcp next --device "Lounge"      # Next track

# Options
--json                  # Output as JSON
--domain amazon.com     # Specify domain
--token "Atnr|..."      # Use specific token
```

---

## 5. Verify Connection

First tool call:
```
tool: alexa_auth_status
input: {}
```

Response: `{ "configured": true, "valid": true, "deviceCount": 5 }`

If `configured: false` or `valid: false`, re-authenticate.

---

## 5. Discovery Tools

**Devices:** `alexa_list_devices` → Returns `{ accountName, serialNumber, deviceType, online }`

**Appliances:** `alexa_list_appliances` → Returns `{ endpointId, friendlyName, applianceTypes, isReachable }`

**Groups:** `alexa_list_device_groups` → Returns `{ name, groupId, applianceCount }`

**Audio Groups:** `alexa_list_audio_groups` → Returns `{ id, name, members[] }`

**Routines:** `alexa_list_routines` → Returns `{ automationId, name, status }`

---

## 6. Speech & Announcements

**Speak to one device:** `alexa_speak` with `{ "device": "Office", "text": "..." }`

**Announce to all:** `alexa_announce` with `{ "text": "..." }`

**Voice command:** `alexa_command` with `{ "device": "Lounge", "text": "..." }`
- No response returned; Alexa speaks answer on device
- Prefer direct control tools for smart home

---

## 7. Smart Home Control

**By name:** `alexa_switch_by_name` with `{ "name": "Lounge light", "state": "on" }`

**By group:** `alexa_control_by_group` with `{ "groupName": "Kitchen", "state": "off" }`
- Default: only controls lights/lamps/bulbs
- Add `"lightsOnly": false` for all appliances

**By pattern:** `alexa_control_by_pattern` with `{ "pattern": "kitchen lights", "state": "on" }`
- Matches all words (case-insensitive, handles plural/singular)

**By endpoint ID:** `alexa_control_appliance` with `{ "entityId": "amzn1.alexa.endpoint.*", "action": "turnOn" }`
- For brightness: `{ "entityId": "...", "action": "setBrightness", "brightness": 50 }`

---

## 8. Routines

**List:** `alexa_list_routines` with `{}`

**Run:** `alexa_run_routine` with `{ "automationId": "amzn1.alexa.behaviors.trigger..." }`

---

## 9. Media Control

**Start playback first:** `alexa_command` with `{ "device": "Lounge", "text": "play jazz" }`

**Get state:** `alexa_now_playing` with `{ "device": "Lounge" }`
- Returns `taskSessionId` if playing

**Transport:** `alexa_media_control` with `{ "device": "Lounge", "command": "pause" }`
- Commands: `play`, `pause`, `resume`, `stop`, `next`, `previous`
- Best support: EU/UK accounts

---

## 10. Typical Workflows

**Smart home:**
1. `alexa_auth_status` → verify auth
2. `alexa_list_device_groups` → find groups
3. `alexa_control_by_group` → control
4. `alexa_control_appliance` → adjust brightness if needed

**Music:**
1. `alexa_auth_status` → verify auth
2. `alexa_command` → start playback
3. `alexa_media_control` → transport controls

---

## 11. Troubleshooting

**Auth failures:**
- Verify token format: `echo "$ALEXA_REFRESH_TOKEN" | grep "^Atnr|"`
- Test: `alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --verify`
- Check domain matches account region

**Common errors:**
- `401`: Token expired/revoked → re-authenticate
- `403`: Wrong domain or account mismatch
- Timeout: Network issues or rate limiting

**Debug:** `export ALEXA_DEBUG=1` for API logs

---

## 12. Account Mismatch

If control fails with "wrong account":
- Run `alexa-mcp auth status --verify` to see account ID
- Run `alexa-mcp devices --owners` to see device ownership
- Re-authenticate with correct account if IDs don't match

---

## 13. Limitations

- `alexa_command`: No response returned (Alexa speaks on device)
- Media control: Requires active playback first
- `alexa_control_by_group`: Defaults to lights only (use `"lightsOnly": false` for all)
- Not yet available: timers, alarms, volume, DND, reminders
- US accounts: Reduced media transport reliability vs EU/UK
- Rate limiting: Implement exponential backoff for automation
