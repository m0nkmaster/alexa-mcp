# Alexa Unofficial API Reference

Source: alexa-cli codebase, [alexa_media_player wiki](https://github.com/alandtse/alexa_media_player/wiki/Developers:-Known-Endpoints), alexa-remote-control.

Base domain for UK: **layla.amazon.co.uk** (pitangui equivalent), **alexa.amazon.co.uk**.

---

## Authentication

| Step | Endpoint | Method | Purpose |
|-----|----------|--------|---------|
| Token exchange | `https://api.amazon.com/ap/exchangetoken/cookies` | POST | Refresh token → session cookies |
| CSRF | `https://alexa.{domain}/api/language` | GET | Obtain csrf cookie |
| Activity CSRF | `https://www.{domain}/alexa-privacy/apd/activity` | GET | Parse HTML for anti-csrftoken-a2z |
| AVS bearer | `https://api.amazon.com/auth/token` | POST | Refresh token → access_token (for AskPlus) |

---

## Endpoints by Capability

### Devices
- `GET /api/devices-v2/device?cached=true|false` — list Echo devices
- `GET /api/bootstrap` — bootstrap, customerId
- `GET /api/media/state?deviceSerialNumber=X&deviceType=Y` — player state, volume

### Behaviors (speak, announce, command, routine)
- `POST /api/behaviors/preview` — execute sequence

Sequence types:
- `Alexa.Speak` — TTS on device
- `AlexaAnnouncement` — announce to all
- `Alexa.TextCommand` (skillId `amzn1.ask.1p.tellalexa`) — voice command
- `Alexa.Sound` — play sound
- `Alexa.DeviceControls.Volume` — set volume
- `Alexa.Weather.Play`, `Alexa.Traffic.Play`, `Alexa.FlashBriefing.Play`, `Alexa.GoodMorning.Play`
- automation:{routineId} — run routine

### Routines
- `GET /api/behaviors/automations` — list routines (deprecated)
- `GET /api/behaviors/v2/automations` — list routines (current)

### Smart Home (Phoenix)
- `GET /api/phoenix` — list appliances
- `PUT /api/phoenix/state` — control (turnOn, turnOff, setBrightness)
- `GET /api/phoenix/group` — whole-house audio groups

### Notifications (alarms, reminders, timers)
- `GET /api/notifications` — list all
- `GET /api/notifications?deviceSerialNumber=X&deviceType=Y` — per device
- `PUT /api/notifications/createReminder` — create reminder

### Media
- `GET /api/media/state?deviceSerialNumber=X&deviceType=Y`
- `GET /api/media/historical-queue`
- `POST /api/media/play-historical-queue`
- `GET /api/np/player`, `GET /api/np/queue`
- `POST /api/np/command` — play/pause/next/prev
- `POST /api/cloudplayer/queue-and-play` — library
- `POST /api/gotham/queue-and-play` — Prime station
- `POST /api/prime/prime-playlist-queue-and-play` — Prime playlist
- `PUT /api/entertainment/v1/player/queue` — TuneIn

### Activity / History (Ask response polling)
- `POST https://www.{domain}/alexa-privacy/apd/rvh/customer-history-records-v2/?startTime=X&endTime=Y&pageType=VOICE_HISTORY`

### AVS (Alexa+ / AskPlus)
- `POST {avs}/v20160207/events` — `Alexa.Input.Text` TextMessage
- `GET {avs}/v1/conversations` — list conversations
- `GET {avs}/v1/conversations/{id}/fragments/synchronize` — poll fragments
