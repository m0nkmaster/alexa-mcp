# Alexa MCP – User Stories & Scenarios

Track of scenarios we want to achieve via the Alexa MCP server/CLI. Each story includes acceptance criteria and (where known) the MCP tool or API that supports it.

---

## 1. Turn TV off

**As a** user  
**I want to** turn the TV off by name  
**So that** I can power it down without the remote or voice.

**Acceptance criteria**

- Can target the TV by friendly name (e.g. "TV", "Living room TV").
- TV turns off reliably (direct control preferred over voice fallback).
- Works when TV is exposed as a smart home device to Alexa.

**Implementation notes**

- `alexa_switch_by_name` (or `alexa_control_appliance` with endpointId).
- Requires TV in `alexa_list_appliances` (or switch-by-name resolution). Profile/account must own the device.

---

## 2. Turn the kitchen lights on

**As a** user  
**I want to** turn the kitchen lights on  
**So that** I can light the kitchen from anywhere (CLI, agent, automation).

**Acceptance criteria**

- Can target "kitchen" or "kitchen lights" (group or device name).
- Lights turn on (all relevant kitchen lights if grouped).
- Works consistently for the authenticated account.

**Implementation notes**

- `alexa_switch_by_name` with name like "Kitchen" or "Kitchen lights", or `alexa_control_appliance` with the right endpointId.
- Groups may be supported via layout/GraphQL; name resolution may map to group or individual endpoints.

---

## 3. Reduce lights in my bedroom to 50%

**As a** user  
**I want to** set bedroom lights to 50% brightness  
**So that** I can dim the room without getting up.

**Acceptance criteria**

- Can target bedroom light(s) by name or group.
- Brightness is set to 50% (or close, e.g. 0–100 scale).
- Works for single bulb or "Bedroom" group.

**Implementation notes**

- `alexa_control_appliance` with `setBrightness` and `brightness: 50`.
- EndpointId from `alexa_list_appliances` (when layouts are available) or switch-by-name resolution if it supports brightness.

---

## 4. Tell the kids to come down

**As a** user  
**I want to** send a message to the kids’ Echo (or all devices)  
**So that** I can call them without shouting (e.g. "Kids, come down for dinner").

**Acceptance criteria**

- Message is played on target device(s) (e.g. kids’ room Echo) or all devices.
- Phrase is clear and at reasonable volume.
- Can choose: single device vs announce to all.

**Implementation notes**

- Single device: `alexa_speak` with device name (e.g. "Kids' room").
- All devices: `alexa_announce`.
- Device chosen via `-d <deviceName>` (CLI) or equivalent in MCP.

---

## 5. Set a 30 minute timer for the sausages

**As a** user  
**I want to** set a 30-minute timer named (or intended) for cooking (e.g. sausages)  
**So that** I get a reminder when the timer ends.

**Acceptance criteria**

- Can create a timer for 30 minutes.
- Timer fires on the chosen Echo (or default).
- Optional: label or context (e.g. "sausages") for the user’s benefit (if API supports it).

**Implementation notes**

- **Gap:** Timers are in API known gaps (docs/API.md). Alarms (one-off) are documented; list/create/cancel **timers** TBC. This story is **blocked** until timer API is captured and implemented.

---

## 6. What’s the weather tomorrow looking like?

**As a** user  
**I want to** ask for tomorrow’s weather and hear the answer on an Echo  
**So that** I can plan my day (e.g. from CLI or an agent).

**Acceptance criteria**

- Can send a phrase like "What's the weather tomorrow?" to a chosen Echo.
- Alexa responds with weather (via TTS) on that device.
- Works for "today", "tomorrow", or "this week" style questions.

**Implementation notes**

- `alexa_command` with the exact phrase, targeting the desired device (`-d <deviceName>`).
- Uses voice command path; response is played on the Echo (no structured weather data in API unless we add a separate flow).

---

## 7. Play some Beatles in the lounge

**As a** user  
**I want to** start playing Beatles music on the lounge Echo  
**So that** I can have music in that room from the CLI or an agent.

**Acceptance criteria**

- Playback starts on the lounge Echo (or specified speaker group).
- Content is Beatles (or similar) from the account’s default music provider.
- Can optionally resume/pause/stop/next/previous via MCP.

**Implementation notes**

- Start: `alexa_command` e.g. "Play some Beatles" with `-d Lounge`.
- Transport: `alexa_media_control` (play, pause, resume, stop, next, previous) for EU/UK when a session exists; `alexa_now_playing` for state. Start-play by contentToken is a known gap in API docs.

---

## 11. Set volume to 50% on Kitchen Echo ✅

**As a** user  
**I want to** set the volume on my Kitchen Echo to 50%  
**So that** I can control the volume without walking over to it.

**Acceptance criteria**

- Can target an Echo device by name. ✅
- Volume is set to specified percentage (0-100). ✅
- Works consistently for the authenticated account. ✅

**Implementation notes**

- API: `GET /api/devices/{deviceType}/{serial}/audio/v2/volume` (get), `PUT .../audio/v2/speakerVolume` (set)
- MCP tools: `alexa_get_volume`, `alexa_set_volume`
- CLI: `alexa-mcp volume -d Kitchen` (get), `alexa-mcp volume 50 -d Kitchen` (set)
- **Status: Done** (implemented in `src/client.ts`, `src/mcp-tools.ts`, `src/cli.ts`)

---

## 12. Is anything playing in the lounge? ✅

**As a** user  
**I want to** know what's currently playing on my lounge Echo  
**So that** I can see the track name, artist, and playback state.

**Acceptance criteria**

- Can query now-playing state for a specific device. ✅
- Returns: track name, artist, album (if available), playback state (playing/paused), volume. ✅
- Works for Amazon Music, Spotify, etc. ✅

**Implementation notes**

- API: `GET /api/np/player?deviceSerialNumber=...&deviceType=...` with `list-media-sessions` fallback
- MCP tool: `alexa_now_playing` — returns `nowPlaying.title`, `.artist`, `.album`, `.state`, `.volume`, `taskSessionId`
- CLI: `alexa-mcp now-playing -d Lounge`
- **Status: Done** (implemented in `src/client.ts`, `src/mcp-tools.ts`, `src/cli.ts`)

---

## 16. What's the temperature in the living room?

**As a** user  
**I want to** know the current temperature in my living room  
**So that** I can decide whether to adjust the heating.

**Acceptance criteria**

- Can query temperature from Echo devices with built-in temperature sensors.
- Returns temperature in Celsius (or configurable).
- Works for devices with temperature capability.

**Implementation notes**

- API: `GET /api/airquality/history` with `sensorType: "Temperature"`
- HAR evidence: `alexa-temperatures.har`
- Need new MCP tool: `alexa_get_temperature`
- CLI: `alexa-mcp temperature -d Living Room`

---

## 17. Get detailed device state (lights, switches, brightness) ✅

**As a** user  
**I want to** see the current state of all my smart home devices  
**So that** I can know what's on/off and at what brightness level.

**Acceptance criteria**

- Can list all appliances with their current state (on/off, brightness %). ✅
- Returns friendly name, entityId, state, and brightness where applicable. ✅
- Works for lights, plugs, switches. ✅

**Implementation notes**

- List: `alexa_list_appliances` returns all devices with `endpointId` and `friendlyName`
- Get brightness: `alexa_get_brightness_by_name` with `{ "name": "Lounge lamp" }` — queries GraphQL live state
- Set brightness: `alexa_set_brightness_by_name` with `{ "name": "Lounge lamp", "brightness": 50 }`
- CLI: `alexa-mcp brightness --name "Lounge lamp"` (get), `alexa-mcp brightness 50 --name "Lounge lamp"` (set)
- Uses GraphQL `getBrightnessState` query for `endpointId`-based devices; phoenix fallback for opaque IDs
- **Status: Done** (implemented in `src/client.ts`, `src/mcp-tools.ts`, `src/cli.ts`)

---

## Suggested additional scenarios

Stories that fit current or planned API surface and common use cases:


| #   | Scenario                                       | Why add                                                              | MCP / API                                                              |
| --- | ---------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 8   | **Set an alarm for 7am** (wake-up)             | Alarms API is documented (list/create); natural extension of timers. | Alarms endpoints (list/create); alarms auth TBC.                       |
| 9   | **Run my "Good morning" routine**              | Routines are supported (list + run).                                 | `alexa_list_routines`, `alexa_run_routine`.                            |
| 10  | **Turn off all lights downstairs**             | Common request; may be a group or routine.                           | Switch by name / control; or run routine "Turn off downstairs lights". |
| 11  | **Set volume to 50% on Kitchen Echo**          | Device volume endpoints exist in API.                                | Volume API (GET/PUT); not yet exposed in MCP tools.                    |
| 12  | **Is anything playing in the lounge?**         | Now-playing is supported (EU/UK).                                    | `alexa_now_playing` for state.                                         |
| 13  | **Pause the music in the lounge**              | Media control is supported.                                          | `alexa_media_control` (pause).                                         |
| 14  | **Remind me to take the bins out at 6pm**      | Reminders are a known gap but high value.                            | Reminders API TBC (docs).                                              |
| 15  | **Turn on Do Not Disturb on the bedroom Echo** | DND endpoints exist in API.                                          | DND API; not yet in MCP tools.                                         |
| 16  | **What’s the temperature in the living room?** | Echo built-in temperature / phoenix state documented.                | Phoenix state + temperature; could expose as tool.                     |
| 17  | **Add milk to my shopping list**               | Common Alexa use case.                                               | Shopping list API (if available); would need HAR/capture.              |


---

## Summary

| Status                  | Count     | Notes                                                                    |
| ----------------------- | --------- | ------------------------------------------------------------------------ |
| **Supported today**     | 1–4, 6, 7, 11, 12, 17 | Via switch/control, speak/announce, command, media control, now-playing, volume, brightness. |
| **Partially supported** | 5         | Timer creation not yet implemented (API gap).                            |
| **In progress**         | 16        | Temperature sensor — HAR captured, implementation pending.               |
| **Suggested**           | 8–10, 13–15, 18 | Alarms, routines, DND, reminders, shopping list.                         |


---

## Document info

- **Last updated:** 2026-03-14  
- **Source:** User scenarios + README + docs/API.md  
- **Next:** Temperature sensor tool (story #16); timer/reminder API capture; alarm auth.

