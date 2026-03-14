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

### Complete Authentication Flow

**The Challenge:** Bots can't easily browse the web or click login buttons. The solution is to ask your user to visit an auth URL and log in, then extract the refresh token for automated use.

**Step 1: Generate auth URL**
```bash
# Start authentication (shows URL for user to visit)
alexa-mcp auth --domain amazon.com  # Use your regional domain
```

This prints a URL for the user to open in their browser. They log into Amazon, and the refresh token is automatically saved to `~/.alexa-mcp/config.json`.

**Step 2: Extract token (optional)**
```bash
# View your saved token
alexa-mcp auth status
# Or read directly from config
cat ~/.alexa-mcp/config.json
```

*Note: The MCP server automatically reads from `~/.alexa-mcp/config.json`, so extraction is only needed if you want to use environment variables or token files instead.*

**Step 3: Configure your bot**
```bash
# Option A: Environment variable (recommended)
export ALEXA_REFRESH_TOKEN="Atnr|your-full-token-here"
export ALEXA_DOMAIN="amazon.com"  # or amazon.co.uk, amazon.de, etc.

# Option B: Token file (more secure for shared systems)
echo "Atnr|your-full-token-here" > /secure/location/alexa-token.txt
chmod 600 /secure/location/alexa-token.txt
```

**Step 4: Validate**
```bash
# Verify token works without saving
alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --verify
```

### Alternative Methods

**Direct token use (if already known):**
```bash
alexa-mcp auth --token "Atnr|..."
alexa-mcp auth --token-file /path/to/token.txt
```

**Status and validation:**
```bash
alexa-mcp auth status           # Show domain + masked token + config path
alexa-mcp auth status --verify  # Also validate token and show account ID
alexa-mcp auth logout           # Remove saved credentials
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ALEXA_REFRESH_TOKEN` | Refresh token — skips config file lookup entirely |
| `ALEXA_DOMAIN` | Amazon domain (default: `amazon.co.uk`; also: `amazon.com`, `amazon.de`) |
| `ALEXA_DEBUG` | Set to any value to log API request/response details to stderr |
| `ALEXA_TOKEN_FILE` | Path to file containing refresh token (alternative to env var) |

### Security Best Practices

- **Never hardcode tokens** in source code or config files
- **Use environment variables** or secure token files with proper permissions (chmod 600)
- **Rotate tokens** if compromised or when personnel changes occur
- **Use separate Amazon accounts** for automation vs personal use
- **Monitor API usage** to detect unauthorized access

---

*If your bot cannot access the user's browser, ask them to run `alexa-mcp auth` once manually and provide you with the refresh token from `~/.alexa-mcp/config.json`.*

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

### Bot/Automated MCP Configuration

For headless tools like OpenClaw, use environment variables or token files:

```json
{
  "mcpServers": {
    "alexa": {
      "command": "npx",
      "args": ["alexa-mcp"],
      "env": {
        "ALEXA_TOKEN_FILE": "/secure/location/alexa-token.txt",
        "ALEXA_DOMAIN": "amazon.com"
      }
    }
  }
}
```

**Alternative: Runtime token injection**
```bash
# Set token at runtime (most secure)
export ALEXA_REFRESH_TOKEN="$(cat /secure/alexa-token.txt)"
# Then start your AI client
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

## 12. Bot and Automation Troubleshooting

### Authentication Issues in Headless Mode

**Symptoms:**
- `alexa_auth_status` returns `{ "configured": false, "valid": false }`
- Commands fail with 401/unauthorized errors
- Token works interactively but fails in automation

**Solutions:**
```bash
# 1. Verify token format and validity
echo "$ALEXA_REFRESH_TOKEN" | grep -q "^Atnr|" || echo "Invalid token format"

# 2. Test token directly
alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --verify

# 3. Check domain mismatch
alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --domain "$ALEXA_DOMAIN" --verify

# 4. Re-authenticate if needed
alexa-mcp auth --domain "$ALEXA_DOMAIN"  # Interactive setup
```

### Common Bot Pitfalls

**1. Environment Variable Issues**
```bash
# Debug environment variables
env | grep ALEXA_

# Ensure variables are exported, not just set
ALEXA_REFRESH_TOKEN="token"  # Wrong - only for current command
export ALEXA_REFRESH_TOKEN="token"  # Correct - available to subprocesses
```

**2. File Permission Problems**
```bash
# Check token file permissions
ls -la "$ALEXA_TOKEN_FILE"
# Should be 600 (rw-------) or 400 (r--------)

# Fix permissions
chmod 600 "$ALEXA_TOKEN_FILE"
```

**3. Network and Timeout Issues**
```bash
# Test connectivity
curl -s "https://alexa.$ALEXA_DOMAIN" >/dev/null && echo "Network OK"

# Increase timeout for slow networks
alexa-mcp --timeout 60 auth --verify
```

### Debugging Bot Failures

**Enable Debug Logging**
```bash
export ALEXA_DEBUG=1
alexa-mcp auth --verify  # Shows full API request/response
```

**Common Error Patterns:**
- **401 Unauthorized:** Token expired or revoked
- **403 Forbidden:** Wrong Amazon domain or account mismatch
- **Timeout:** Network issues or API rate limiting
- **Invalid endpoint:** Device ID changed or device removed

### Recovery Procedures

**Automated Token Recovery**
```python
def recover_token():
    """Attempt to recover from token issues"""
    
    # 1. Try existing token
    if validate_current_token():
        return True
    
    # 2. Check for backup token file
    backup_files = [
        '/secure/alexa-token-backup.txt',
        '/etc/alexa/token.txt',
        '~/.alexa-emergency-token'
    ]
    
    for backup in backup_files:
        if os.path.exists(backup):
            token = read_token_file(backup)
            if validate_token(token):
                update_current_token(token)
                return True
    
    # 3. Notify user for manual re-auth
    send_alert("Alexa token expired. Manual re-authentication required.")
    return False
```

**Health Check Script**
```bash
#!/bin/bash
# aleax-health-check.sh - Monitor bot health

# Check authentication
if ! alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --verify >/dev/null 2>&1; then
    echo "CRITICAL: Authentication failed"
    exit 2
fi

# Check device connectivity
device_count=$(alexa-mcp devices --json | jq '. | length')
if [ "$device_count" -eq 0 ]; then
    echo "WARNING: No devices found"
    exit 1
fi

# Test a simple command
if ! alexa-mcp announce --text "Health check" >/dev/null 2>&1; then
    echo "WARNING: Command execution failed"
    exit 1
fi

echo "OK: All systems operational"
exit 0
```

---

## 13. Account and Profile Troubleshooting

If smart home control fails with "can't control – wrong account":

- `alexa_auth_status` does not expose the `deviceOwnerCustomerId` directly — run `alexa-mcp auth status --verify` from the CLI to see which account ID the token belongs to.
- Run `alexa-mcp devices --owners` (CLI) to see which account owns each Echo.
- Run `alexa-mcp appliances` (CLI) to see `deviceOwnerCustomerId` per smart home device.
- If IDs don't match, log out and re-authenticate as the account that owns the target device.

---

## 14. Headless Bot Integration Examples

### OpenClaw Integration Pattern

OpenClaw and similar headless tools can integrate with alexa-mcp using this pattern:

**1. Setup Script (run once)**
```bash
#!/bin/bash
# setup-alexa.sh - One-time setup for headless operation

echo "Setting up Alexa for headless bot operation..."
read -p "Enter your Amazon domain [amazon.com]: " domain
domain=${domain:-amazon.com}

# Interactive authentication
alexa-mcp auth --domain "$domain"

# Extract and secure the token
token=$(jq -r '.refreshToken' ~/.alexa-mcp/config.json)
echo "Token extracted. Store this securely:"
echo "$token" | base64  # Encode for safe copying

echo "Configure your bot with:"
echo "export ALEXA_REFRESH_TOKEN='$token'"
echo "export ALEXA_DOMAIN='$domain'"
```

**2. Bot Validation Function**
```python
# Python example for bot integration
import subprocess
import os
import json

def validate_alexa_auth():
    """Validate Alexa authentication before making API calls"""
    token = os.getenv('ALEXA_REFRESH_TOKEN')
    if not token:
        return False, "No ALEXA_REFRESH_TOKEN environment variable"
    
    try:
        result = subprocess.run(
            ['alexa-mcp', 'auth', '--no-save', '--token', token, '--verify'],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return True, "Authentication valid"
        else:
            return False, f"Token invalid: {result.stderr}"
    except Exception as e:
        return False, f"Auth check failed: {e}"

def get_alexa_status():
    """Get current Alexa status for bot monitoring"""
    token = os.getenv('ALEXA_REFRESH_TOKEN')
    if not token:
        return None
    
    try:
        result = subprocess.run(
            ['alexa-mcp', 'auth', '--no-save', '--token', token, 'status', '--verify'],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            # Parse status output for bot monitoring
            return {
                'authenticated': True,
                'domain': os.getenv('ALEXA_DOMAIN', 'amazon.co.uk'),
                'details': result.stdout.strip()
            }
    except Exception:
        pass
    
    return {'authenticated': False}
```

### Automated Smart Home Workflows

**Morning Routine Bot**
```bash
#!/bin/bash
# morning-routine.sh - Automated morning sequence

# Validate authentication first
if ! alexa-mcp auth --no-save --token "$ALEXA_REFRESH_TOKEN" --verify >/dev/null 2>&1; then
    echo "ERROR: Alexa authentication failed"
    exit 1
fi

# Sequence of actions
echo "Starting morning routine..."

# Turn on kitchen lights
alexa-mcp control --group "Kitchen" --state on

# Start coffee maker (if smart)
alexa-mcp control --name "Coffee Maker" --state on

# Announce wake-up
alexa-mcp announce --text "Good morning! Time to start the day."

# Play morning music
alexa-mcp command --device "Kitchen Echo" --text "play morning jazz"

echo "Morning routine completed"
```

**Security Monitor Bot**
```python
# security-monitor.py - Home security automation
import time
import subprocess
from datetime import datetime

def security_scan():
    """Perform nightly security check"""
    
    # Check all doors are locked
    doors = ['Front Door', 'Back Door', 'Garage Door']
    for door in doors:
        result = control_device(door, 'off')  # Assuming 'off' = locked
        if not result:
            send_alert(f"Failed to lock {door}")
    
    # Turn on exterior lights
    control_group('Outdoor', 'on')
    
    # Set security system (if integrated)
    control_device('Security System', 'on')
    
    # Announce security status
    announce("Security check complete. All doors locked and exterior lights on.")

def control_device(name, state):
    """Control a device by name"""
    try:
        subprocess.run([
            'alexa-mcp', 'control', '--name', name, '--state', state
        ], check=True, timeout=30)
        return True
    except subprocess.CalledProcessError:
        return False

def control_group(group, state):
    """Control a device group"""
    try:
        subprocess.run([
            'alexa-mcp', 'control', '--group', group, '--state', state
        ], check=True, timeout=30)
        return True
    except subprocess.CalledProcessError:
        return False

def announce(message):
    """Make an announcement"""
    try:
        subprocess.run([
            'alexa-mcp', 'announce', '--text', message
        ], check=True, timeout=30)
    except subprocess.CalledProcessError:
        pass
```

### Error Handling for Bots

**Robust Error Recovery**
```python
class AlexaBot:
    def __init__(self):
        self.max_retries = 3
        self.retry_delay = 5
    
    def execute_with_retry(self, command, args):
        """Execute Alexa command with retry logic"""
        for attempt in range(self.max_retries):
            try:
                result = subprocess.run(
                    ['alexa-mcp', command] + args,
                    capture_output=True, text=True, timeout=30,
                    check=True
                )
                return True, result.stdout
            except subprocess.TimeoutExpired:
                error = "Command timeout"
            except subprocess.CalledProcessError as e:
                error = e.stderr.strip() if e.stderr else str(e)
            
            if attempt == self.max_retries - 1:
                return False, f"Failed after {self.max_retries} attempts: {error}"
            
            # Check if it's an auth error
            if '401' in error or 'unauthorized' in error.lower():
                self.handle_auth_error()
            
            time.sleep(self.retry_delay)
    
    def handle_auth_error(self):
        """Handle authentication errors"""
        print("Authentication error detected. Token may be expired.")
        # In a real bot, this would trigger a re-auth notification
        # to the user via their preferred notification channel
```

---

## 15. Known Limitations

- **Voice commands (`alexa_command`)** send text to Alexa but no structured response is returned. The Echo speaks the answer but it is not captured by the MCP.
- **Media control** requires playback to already be active. Use `alexa_command` to start a stream, then `alexa_media_control` to control it.
- **`alexa_control_by_group` (lightsOnly default):** Only devices with `light`, `lamp`, or `bulb` in their name are targeted by default. Pass `"lightsOnly": false` to include all appliances.
- **Timers and alarms** are not yet implemented as MCP tools (API gap).
- **Volume control, DND, reminders** are not yet exposed as MCP tools.
- **US accounts:** Media transport (`alexa_now_playing`, `alexa_media_control`) may have reduced reliability compared to EU/UK.
- **Bot rate limiting:** Amazon may implement rate limiting for automated access. Implement exponential backoff in your bot.
- **Concurrent access:** Multiple bots using the same Amazon account may conflict. Use separate accounts for different automation tasks.
