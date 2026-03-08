# Alexa Unofficial API Exploration

Credentials: `~/.alexa-cli/config.json` (set by `alexacli auth`).

**Note:** Refresh token must be valid (~14 days). Run `alexacli auth` to re-authenticate if expired.

---

## Test Results (Direct API)

| Journey | Test | Result |
|---------|------|--------|
| **1. Set alarm** | TextCommand "set an alarm for 9am tomorrow" via Office Echo | HTTP 200 OK |
| **2. Play music** | TextCommand "play jazz music" via Office Echo | HTTP 200 OK |
| **3. Ask (web search)** | TextCommand "what is the population of Tokyo" via Office Echo | Command: HTTP 200. History polling: 403 Forbidden (activity CSRF extracted; history API rejects) |
| **4. Weather** | TextCommand "what's the weather for the next 5 days" via Office Echo | Command: HTTP 200 OK. Response retrieval: same as Ask (history polling 403) |
| **5. Announce** | AlexaAnnouncement via layla | HTTP 200 OK |
| **6. Control devices** | TextCommand "turn off Landing Lamp" / "turn on Landing Lamp" via Lounge Echo | HTTP 200 OK |

**Test devices:** Office Echo (serial G090XG1223070MVV), Lounge Echo, Landing Lamp (smart plug).

**Ask/Weather response retrieval:** One-way command works. History polling returns 403. Tried Option 1 (load activity page first, use cookie jar): activity CSRF extractable from HTML (`anti-csrftoken-a2z&quot;:&quot;{value}&quot;`), but history API still 403. Use AVS AskPlus as alternative for two-way Ask.

---

## Core User Journeys → API Mapping

### 1. Set Alarm

**User intent:** "Alexa, set an alarm for 7am"

**APIs involved:**

| API | Endpoint | Method | Notes |
|-----|----------|--------|-------|
| **Notifications (Alarms)** | `alexa.amazon.com/api/notifications` | GET | List alarms/reminders/timers |
| **Create reminder** | `alexa.amazon.com/api/notifications/createReminder` | PUT | Create reminder (not alarm) |
| **Edit notification** | `alexa.amazon.com/api/notifications` | PUT | Edit alarm/reminder |

**alexa-cli approach:** No direct alarm command. Use **natural language**:
```
alexacli command "set an alarm for 7am" -d <device>
```

**Unofficial API detail (from alexa_media_player wiki):**
- Alarms use `type: "Alarm"` in notifications API
- Reminders use `type: "Reminder"`, create via `PUT /api/notifications/createReminder`
- `originalDate`, `originalTime`, `recurringPattern` (P1D, XXXX-WE, etc.)

**Direct API path (if implementing):** Would need to PUT to notifications API with alarm payload. Exact schema discovered via sniffing Alexa app.

---

### 2. Play Music

**User intent:** "Alexa, play jazz" / "Alexa, play Spotify" / "Alexa, play radio"

**APIs involved:**

| API | Endpoint | Method | Purpose |
|-----|----------|--------|---------|
| **Sequence (text command)** | pitangui/layla `/api/behaviors/preview` | POST | `Alexa.TextCommand` — natural language "play jazz" |
| **TuneIn radio** | `alexa.amazon.com/api/entertainment/v1/player/queue` | PUT | Play by station ID |
| **Library track** | `alexa.amazon.com/api/cloudplayer/queue-and-play` | POST | Play library track/album |
| **Prime playlist** | `alexa.amazon.com/api/prime/prime-playlist-queue-and-play` | POST | Prime playlist by ASIN |
| **Prime station** | `alexa.amazon.com/api/gotham/queue-and-play` | POST | Prime station by seed ID |
| **Historical queue** | `alexa.amazon.com/api/media/play-historical-queue` | POST | Resume from history |
| **Media command** | `alexa.amazon.com/api/np/command` | POST | Play, pause, next, prev, stop |

**alexa-cli approach:**
```
alexacli command "play jazz" -d <device>
alexacli command "stop" -d <device>
```

**Direct API path (for granular control):** Use `/api/cloudplayer/queue-and-play`, `/api/gotham/queue-and-play`, or `/api/entertainment/v1/player/queue` with appropriate payload.

---

### 3. Ask Question Requiring Web Search

**User intent:** "Alexa, what is the population of Tokyo?" / "Alexa, search for X"

**APIs involved:**

| API | Endpoint | Method | Notes |
|-----|----------|--------|-------|
| **Text command** | pitangui `/api/behaviors/preview` | POST | `Alexa.TextCommand` — send question |
| **Activity history** | www.amazon.com `/alexa-privacy/apd/rvh/customer-history-records-v2/` | POST | Poll for Alexa's response (ASR + TTS) |
| **Alexa+ (LLM)** | AVS `avs-alexa-eu.amazon.com/v20160207/events` | POST | `Alexa.Input.Text` — Type-to-Alexa |
| **Fragments** | AVS `/v1/conversations/{id}/fragments/synchronize` | GET | Poll for LLM response |

**alexa-cli approach:**
```
# Classic (poll history for response)
alexacli ask "what is the population of Tokyo" -d <device>

# Alexa+ LLM (richer answers, multi-turn)
alexacli askplus -d <device> "what is the population of Tokyo"
```

**Flow:** Send text → Poll history or AVS fragments → Extract Alexa's reply.

---

### 4. Weather for Next XX Days

**User intent:** "Alexa, what's the weather for the next 5 days?"

**APIs involved:**

| API | Endpoint | Method | Notes |
|-----|----------|--------|-------|
| **Text command** | pitangui `/api/behaviors/preview` | POST | `Alexa.TextCommand` |
| **Activity history** | www.amazon.com `.../customer-history-records-v2/` | POST | Poll for response |

**alexa-cli approach:**
```
alexacli ask "what's the weather for the next 5 days" -d <device>
```

Same flow as Ask: send command, poll history, extract response.

---

### 5. Announce

**User intent:** "Alexa, announce: Dinner is ready"

**APIs involved:**

| API | Endpoint | Method | Notes |
|-----|----------|--------|-------|
| **Sequence (announcement)** | pitangui `/api/behaviors/preview` | POST | `AlexaAnnouncement` with `target.customerId` |

**alexa-cli approach:**
```
alexacli speak "Dinner is ready" --announce
```

**Sequence type:** `AlexaAnnouncement` (not `Alexa.Speak`). Targets all devices via `customerId`.

---

### 6. Control Devices — Lights and Plugs

**User intent:** "Alexa, turn off the living room lights" / "Turn on plug X"

**APIs involved:**

| API | Endpoint | Method | Notes |
|-----|----------|--------|-------|
| **Text command (natural language)** | pitangui `/api/behaviors/preview` | POST | `Alexa.TextCommand` — "turn off living room lights" |
| **Phoenix (smart home)** | pitangui `/api/phoenix` | GET | List appliances |
| **Phoenix state** | pitangui `PUT /api/phoenix/state` | PUT | Direct control: turnOn, turnOff, setBrightness |

**alexa-cli approach:**
```
# Natural language (preferred)
alexacli command "turn off the living room lights" -d <device>
alexacli command "turn on the plug" -d <device>

# Direct API (by entity ID)
alexacli sh list           # List devices (entity IDs)
alexacli sh on "Kitchen Light"
alexacli sh off "Plug"
alexacli sh brightness "Lamp" 50
```

**Phoenix payload (direct control):**
```json
{
  "controlRequests": [{
    "entityId": "<appliance entityId>",
    "entityType": "APPLIANCE",
    "parameters": { "action": "turnOn" }
  }]
}
```

---

## Base URLs by Domain

| Domain | pitangui/layla | alexa | AVS |
|--------|----------------|-------|-----|
| amazon.com | pitangui.amazon.com | alexa.amazon.com | avs-alexa-12-na.amazon.com |
| amazon.co.uk | layla.amazon.co.uk | alexa.amazon.co.uk | avs-alexa-eu.amazon.com |
| amazon.de | layla.amazon.de | alexa.amazon.de | avs-alexa-eu.amazon.com |

---

## Authentication Flow

1. **Refresh token** (from alexa-cookie-cli or manual)
2. **Token exchange:** `POST https://api.amazon.com/ap/exchangetoken/cookies` → session cookies
3. **CSRF:** `GET https://alexa.{domain}/api/language` → csrf cookie
4. **Activity CSRF** (for Ask): `GET https://www.{domain}/alexa-privacy/apd/activity` → parse HTML for anti-csrftoken-a2z
5. **AVS bearer** (for AskPlus): `POST https://api.amazon.com/auth/token` → access_token

---

## API Exploration Test Script

Run with valid credentials:

```bash
export ALEXA_REFRESH_TOKEN=$(jq -r .refresh_token ~/.alexa-cli/config.json)
export ALEXA_AMAZON_DOMAIN=$(jq -r .amazon_domain ~/.alexa-cli/config.json)

# 1. Auth and devices
alexacli devices --json

# 2. Set alarm (via command)
alexacli command "set an alarm for 7am tomorrow" -d "<device>"

# 3. Play music
alexacli command "play jazz" -d "<device>"

# 4. Ask (web search)
alexacli ask "what is the population of Tokyo" -d "<device>"

# 5. Weather
alexacli ask "what's the weather for the next 5 days" -d "<device>"

# 6. Announce
alexacli speak "API test announcement" --announce

# 7. Control devices
alexacli sh list
alexacli command "turn off the living room lights" -d "<device>"
```

---

## Sniffing / Discovery Approach

To discover exact request/response shapes:

1. **Browser DevTools:** Log into alexa.amazon.co.uk, use Network tab, filter by Fetch/XHR. Perform each action (set alarm, play music, etc.) and capture request URL, method, headers, body.
2. **alexacli -v:** Add `--verbose` or `-v` to see debug output.
3. **Charles/Proxyman:** MITM proxy to capture HTTPS traffic from Alexa app.
4. **alexa-remote-control:** Reference implementation; compare request bodies.

---

## Files

- `~/.alexa-cli/config.json` — refresh_token, amazon_domain (set by `alexacli auth`)
- `alexa-cli/` — Go implementation of unofficial APIs
- `docs/API_EXPLORATION.md` — this file
