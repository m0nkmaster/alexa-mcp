# Alexa App API Reference

Single authoritative reference for the **unofficial** APIs used by the Alexa mobile app. All endpoints, request/response shapes, authentication, and headers are documented from HAR captures (UK/EU). US/Global hosts are noted where not yet confirmed.

---

## 1. Region-specific base URLs (global / US / UK / DE / FR)

All API requests use a **region-specific host**. Authentication is the same for all regions; only the base URL and cookie domain change.

### 1.1 Domain → API hosts (what’s in code / docs)


| Region / label  | Login domain | alexa base (auth)  | app API base              | Status                    |
| --------------- | ------------ | ------------------ | ------------------------- | ------------------------- |
| **UK**          | amazon.co.uk | alexa.amazon.co.uk | eu-api-alexa.amazon.co.uk | HAR confirmed             |
| **DE**          | amazon.de    | alexa.amazon.de    | eu-api-alexa.amazon.de    | In config                 |
| **US / Global** | amazon.com   | alexa.amazon.com   | na-api-alexa.amazon.com   | Probing confirmed 2026-03 |
| **FR**          | amazon.fr    | *(not in code)*    | *(not in code)*           | Extrapolated below        |


- **Global** = US (amazon.com). All supported regions use the app API (eu-api or na-api).

### 1.2 Alarms (separate host)


| Region    | Alarms API host                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **EU**    | [https://api.eu.amazonalexa.com](https://api.eu.amazonalexa.com)                                                                     |
| **US/NA** | [https://api.amazonalexa.com](https://api.amazonalexa.com) or [https://api.na.amazonalexa.com](https://api.na.amazonalexa.com) (TBC) |


### 1.3 Extrapolated FR (amazon.fr)

If France uses the same EU app stack as UK/DE, the hosts would be:

- **alexa base:** `https://alexa.amazon.fr`
- **app API base:** `https://eu-api-alexa.amazon.fr`

Cookie suffix for `.amazon.fr` would need to be observed (e.g. from HAR or app traffic). Not implemented in this repo yet.

### 1.4 US/Global app API (amazon.com)

- **Confirmed (2026-03):** `na-api-alexa.amazon.com` — probing shows same paths as eu-api (e.g. `/api/devices-v2/device`), 302 to sign-in with `return_to` to na-api-alexa, `assoc_handle=amzn_dp_project_dee` (parallel to `amzn_dp_project_dee_uk` for UK). Added to config as `appApiBase` for amazon.com.

Unless stated otherwise, endpoints below are **relative to the EU/App API base** for the account’s region (e.g. `https://eu-api-alexa.amazon.co.uk` for UK). The **alarms** host is different (see §6).

---

## 2. Authentication

### 2.1 Token exchange (session cookies)


| Item                | Value                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**             | `https://api.amazon.com/ap/exchangetoken/cookies`                                                                                                                                                                                              |
| **Method**          | POST                                                                                                                                                                                                                                           |
| **Request headers** | `Content-Type: application/x-www-form-urlencoded`                                                                                                                                                                                              |
| **Request body**    | Form URL-encoded: `app_name=Amazon Alexa`, `requested_token_type=auth_cookies`, `source_token_type=refresh_token`, `source_token={refreshToken}`, `domain=.{domain}` (e.g. `.amazon.co.uk`). Also `x-amzn-identity-auth-domain: api.{domain}`. |
| **Response**        | JSON with `response.tokens.cookies[".{domain}"]` — array of `{ Name, Value }`; concatenate as `Name=Value; ...` for `Cookie` header.                                                                                                           |


### 2.2 CSRF token


| Item                | Value                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**             | `https://alexa.{domain}/api/language` (e.g. `https://alexa.amazon.co.uk/api/language`)                                                      |
| **Method**          | GET                                                                                                                                         |
| **Request headers** | `Cookie: {cookies from token exchange}`, `Accept: application/json`                                                                         |
| **Response**        | Response body optional; **Set-Cookie** header contains `csrf={token}`. Parse and send as header `csrf: {token}` on subsequent API requests. |


### 2.3 Headers for API requests

For all requests to **eu-api-alexa** (and same pattern for alexa.{domain} where used):


| Header           | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Cookie**       | Cookie string from token exchange (e.g. `at-acbuk=...; sess-at-acbuk=...; session-id=...`) |
| **csrf**         | CSRF token from GET `/api/language`                                                        |
| **Content-Type** | `application/json` (for POST/PUT with body)                                                |
| **Accept**       | `application/json`                                                                         |


Optional where the app sends them: `Accept-Language`, `User-Agent`.

**Cookie domain:** Use the suffix for the account (e.g. `.amazon.co.uk` → cookies named with `acbuk`). See `config.cookieSuffix` in code.

### 2.4 Bearer auth (bob-dispatch, some entertainment)

For **Type-to-Alexa execution** and some **entertainment** endpoints the app uses `Authorization: Bearer Atna|...`. That token is obtained from AVS/device context; for cookie-based automation the primary flow uses Cookie + csrf above.

---

## 3. Devices (Echo)

Base: **eu-api-alexa.{tld}**.


| Endpoint                                                | Method | Description                               |
| ------------------------------------------------------- | ------ | ----------------------------------------- |
| `/api/devices-v2/device`                                | GET    | List Echo devices. Query: `?cached=true`. |
| `/api/devices/deviceType/dsn/audio/v1/allDeviceVolumes` | GET    | Volume state per device.                  |


### GET /api/devices-v2/device

- **Request:** No body. Headers: Cookie, csrf, Content-Type, Accept.
- **Response:** `{ "devices": [ { "accountName", "serialNumber", "deviceType", "deviceFamily", "deviceOwnerCustomerId", "online", "capabilities" } ] }`.

---

## 4. Routines

Base: **eu-api-alexa.{tld}**.

### 4.1 List routines


| Endpoint                          | Method |
| --------------------------------- | ------ |
| `/api/routines/routinesandgroups` | GET    |


- **Response:** `{ "routines": [ { "automationId", "primary", "secondary", "utterance", "utterances", "triggerSkillId", "status", "type": "ROUTINE", "audioDevice", "icon", ... } ] }`.  
`primary` = display name; `utterance` / `utterances` = trigger phrase(s).

### 4.2 Get one routine (full automation)


| Endpoint                                    | Method |
| ------------------------------------------- | ------ |
| `/api/behaviors/automations/{automationId}` | GET    |


- **Response:** Full automation: `automationId`, `name`, `triggers`, `**sequence`** (required to run), `status`, etc.

### 4.3 Update routine (save)


| Endpoint                                    | Method |
| ------------------------------------------- | ------ |
| `/api/behaviors/automations/{automationId}` | PUT    |


- **Request body:** `{ "behaviorId", "triggerJson", "triggerJsonList", "sequenceJson", "status" }` (and optional name/tags/presentationDataList).
- **Use:** When editing a routine in the app.

### 4.4 Run routine


| Endpoint                 | Method |
| ------------------------ | ------ |
| `/api/behaviors/preview` | POST   |


- **Request body:** Full automation payload. Minimum for run: `behaviorId` + `sequenceJson` (from GET automation). App also sends: `triggerJson`, `triggerJsonList`, `status` (e.g. `"ENABLED"`), `name`, `tags`, `presentationDataList`.
- **Response:** `200`, empty body.

Example top-level fields (as sent by app):


| Field                  | Example                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `behaviorId`           | `amzn1.alexa.automation.fd739312-9cfd-4bbc-92c9-c2696c4587c5`                                        |
| `triggerJson`          | JSON string of one trigger object                                                                    |
| `triggerJsonList`      | Array of JSON strings (triggers)                                                                     |
| `sequenceJson`         | JSON string of sequence (e.g. SerialNode → OpaquePayloadOperationNode, type `Alexa.SmartHome.Batch`) |
| `status`               | `"ENABLED"`                                                                                          |
| `name`                 | Display name, e.g. `"our bedtime "`                                                                  |
| `tags`                 | `"[]"`                                                                                               |
| `presentationDataList` | `"[{\"type\":\"AlexaRoutines.Benefit\",\"payload\":{}}]"`                                            |


### 4.5 Routine catalog (create flow)


| Endpoint                                                                     | Method |
| ---------------------------------------------------------------------------- | ------ |
| `/api/routines/catalog/trigger/Root` or `/api/routines/catalog/trigger/root` | POST   |


- **Request body:** `{ "actions": [...], "triggers": [...], "conditions": [], "experience": "DEFAULT", "routineOwnerType": "HOUSEHOLD" }`.  
Used for catalog when building a new routine, not for running.

---

## 5. Smart home

Base: **eu-api-alexa.{tld}**.

### 5.1 List endpoints (devices)


| Endpoint                      | Method |
| ----------------------------- | ------ |
| `/api/smarthome/v2/endpoints` | POST   |


- **Request body:** `{ "endpointContexts": ["GROUP"] }`.
- **Response:** `{ "endpoints": [ { "__type": "DmsEndpoint", "identifier", "deviceType", "deviceSerialNumber", "serialNumber", "encryptedAccountName", "deviceOwnerCustomerId", ... } ] }`.  
Names may be encrypted; use `serialNumber` or identifier for display.  
**Note:** This API does not return `amzn1.alexa.endpoint.{uuid}`; those come from GraphQL/layout flows (see below).

### 5.2 Control UI metadata (layouts)


| Endpoint                                         | Method |
| ------------------------------------------------ | ------ |
| `/api/smarthome/v1/presentation/devices/control` | GET    |


- **Response:** `{ "layouts": { "{uuid}": { "type", "template": { "header": { "primaryItem": { "interfaceName": "Alexa.PowerController", ... } }, "secondary": { "items": [{ "interfaceName": "Alexa.BrightnessController", ... }] }, ... } } } }`. Maps layout IDs to capabilities.

### 5.3 Control: power and brightness (GraphQL)


| Endpoint            | Method |
| ------------------- | ------ |
| `/nexus/v1/graphql` | POST   |


- **Headers:** Cookie, csrf, Content-Type: application/json, Accept.
- **Body:** GraphQL mutation with variables.

**Power (turn on / turn off / toggle):**

- **Mutation:** `updatePowerFeatureForEndpoints` or `togglePowerFeatureForEndpoint`.
- **Variables:** `featureControlRequests: [ { "endpointId": "amzn1.alexa.endpoint.{uuid}", "featureName": "power", "featureOperationName": "turnOn" | "turnOff" } ]`.  
Endpoint IDs are `amzn1.alexa.endpoint.{uuid}` (from app state/GraphQL/layout, not from smarthome/v2/endpoints response).

**Brightness:**

- **Mutation:** `setBrightness`.
- **Variables:** `{ "endpointId": "amzn1.alexa.endpoint.{uuid}", "value": 0–100 }`.
- **Request shape:** `featureControlRequests: [ { endpointId, featureName: "brightness", featureOperationName: "setBrightness", payload: { brightness: value } } ]`.

**Mapping v2 → GraphQL endpoint IDs:** Use GraphQL queries such as `getEndpointState` (variables: `endpointId`, `latencyTolerance`) or layout/control flows to obtain `amzn1.alexa.endpoint.`* IDs.

### 5.4 Temperature and IAQ history (Echo built-in sensors)

Entity IDs are **ENTITY**-type UUIDs from **phoenix/state**, not appliance DSNs.

#### POST /api/smarthome/v1/airquality/history/

- **Request body:**


| Field        | Values                    | Notes                                       |
| ------------ | ------------------------- | ------------------------------------------- |
| `resolution` | `"Weekly"` | `"Daily"`    | Bucketing                                   |
| `entityIds`  | `["<entity-uuid>", ...]`  | ENTITY UUID(s) from phoenix/state           |
| `startDate`  | ISO8601                   | Start of range                              |
| `endDate`    | ISO8601                   | End of range                                |
| `sensorType` | `"Temperature"` | `"IAQ"` | Temperature = °C history; IAQ = air quality |


- **Response:** `{ "sensorType": "TEMPERATURE" | "IAQ", "resolution": "WEEKLY" | "DAILY", "averageAirQuality": number, "data": [ { "entityId", "timeStamp": "ISO8601", "value": number } ] }`.  
For **Temperature**, `value` is in **°C**. For **IAQ**, same shape; missing data may use `entityId`: `"<NO_ENTITY_ID>"` and `value`: 0.

#### POST /api/phoenix/state

- **Purpose:** Resolve entity IDs and capability state (e.g. Alexa.TemperatureSensor, playback).
- **Request body:** `{ "stateRequests": [ { "entityId": "AlexaBridge_<dsn>@<deviceType>_<dsn>", "entityType": "APPLIANCE" }, { "entityId": "<uuid>", "entityType": "ENTITY" } ] }`.  
**APPLIANCE** = device (Echo) by DSN/deviceType. **ENTITY** = logical entity; the ENTITY `entityId` (UUID) is used in `entityIds` for airquality/history.
- **Response:** Capability states; use the ENTITY `entityId` (UUID) in `entityIds` when calling airquality/history with `sensorType: "Temperature"` or `"IAQ"`.

**Flow:** Call phoenix/state with Echo appliance ID (or known ENTITY UUID); take ENTITY `entityId` from response; call airquality/history with that UUID, desired `resolution`, and date range.

---

## 6. Behaviors: text command / “Ask” (Type to Alexa)

The app does **not** let you pick which Echo answers; the request carries the **app device** (phone) serial. To have a specific Echo answer, include it in the phrase (e.g. “Alexa, on the kitchen Echo, what’s the weather?”).

### 6.1 Search/suggestions (not execution)


| Endpoint                   | Method | Host               |
| -------------------------- | ------ | ------------------ |
| `/api/simba/searchResults` | POST   | eu-api-alexa.{tld} |


- **Request body (relevant fields):** `queryText` (typed phrase), `dsn` (app device serial), `locale`, `namespace` (e.g. SpeechSynthesizer/Platform), `marketplaceId`, `variant`, `avsResponseToken`, `clientRequestId`, `platform`, `platformVersion`, `appVersion`.
- **Response:** Search/suggestions (e.g. suggested utterances). Not the execution path.

### 6.2 Execute text command and get reply


| Endpoint            | Method | Host                                      |
| ------------------- | ------ | ----------------------------------------- |
| `/v20160207/events` | POST   | `https://bob-dispatch-prod-eu.amazon.com` |


- **Auth:** `Authorization: Bearer Atna|...`
- **Body:** Multipart with event: **Header** `Alexa.Input.Text`, `TextMessage`; **Payload** `{ "text": "..." }` (the typed phrase). Context parts (speaker, SpeechSynthesizer, playback, alerts) as in AVS.
- **Response:** Multipart with directives; e.g. **Speak** (TTS reply), then **RequestProcessingComplete**.

“Say something” (TTS to one chosen Echo) and “Announce to all” are not yet fully isolated in HAR; may use `POST /api/behaviors/preview` with Alexa.Speak or similar — capture when needed.

---

## 7. Notifications: alarms

**Host:** `https://api.eu.amazonalexa.com` (EU). US may use `api.amazonalexa.com` or `api.na.amazonalexa.com`; auth (cookie/CSRF vs bearer) TBC.

### 7.1 List alarms


| Endpoint                                          | Method |
| ------------------------------------------------- | ------ |
| `https://api.eu.amazonalexa.com/v1/alerts/alarms` | GET    |


- **Response:** `{ "alarms": [ { "alarmToken", "status", "trigger": { "timeOfDay", "time", "date", "scheduledTime", "timeZoneId" }, "endpointIds": [ "deviceSerialNumber@deviceType" ], "assets", "createdTime", "updatedTime" } ], "totalCount", "links" }`.

### 7.2 Create alarm


| Endpoint                                          | Method |
| ------------------------------------------------- | ------ |
| `https://api.eu.amazonalexa.com/v1/alerts/alarms` | POST   |


- **Request body:**


| Field        | Example / notes                                                          |
| ------------ | ------------------------------------------------------------------------ |
| `trigger`    | `{ "scheduledTime": "ISO8601" }`                                         |
| `endpointId` | `deviceSerialNumber@deviceType` (e.g. `G090XG1223070MVV@A1RABVCI4QCIKC`) |
| `assets`     | `[ { "assetId": "system_alerts_melodic_01", "type": "TONE" } ]`          |
| `extensions` | `[ { "name": "WAKE_UP_LIGHTS", "enablement": "DISABLED" } ]`             |


- **Response:** `{ "alarmToken", "status", "trigger", "endpointIds", "assets", "createdTime", "updatedTime" }`.

**Reminders and timers:** List/create endpoints TBC (e.g. `/v1/alerts/reminders` or similar); capture when needed.

---

## 8. Media (now playing, transport, browse)

Base: **eu-api-alexa.{tld}**.

### 8.1 Now playing and sessions


| Endpoint                      | Method | Description                                                                                        |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `/api/np/player`              | GET    | Now-playing state. Query: `deviceSerialNumber`, `deviceType`, `screenWidth` (etc.) as used by app. |
| `/api/np/list-media-sessions` | GET    | Media sessions.                                                                                    |
| `/api/np/list-targets`        | GET    | List of target endpoints for playback.                                                             |


### 8.2 Transport control (play, pause, resume, stop)


| Endpoint                        | Method |
| ------------------------------- | ------ |
| `/api/np/control-media-session` | POST   |


- **Request body:**


| Field                | Description                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `taskSessionId`      | e.g. `amzn1.echo-api.session.{uuid}` — from now-playing or list-media-sessions                                                                                           |
| `command`            | `{ "type": "NPPauseCommand" }` | `"NPResumeCommand"` | `"NPStopCommand"` (and likely `NPPlayCommand`, `NPNextCommand`, `NPPreviousCommand`)                              |
| `controllerEndpoint` | `{ "id": { "deviceSerialNumber", "deviceType", "__type": "NPEndpointIdentifier:..." }, "__type": "NPSingletonEndpoint:..." }` — identifies the Echo controlling playback |


- **Response:** 200; body may be empty or JSON.

### 8.3 Browse music


| Endpoint                                 | Method |
| ---------------------------------------- | ------ |
| `/api/entertainment/v1/mediaCollections` | GET    |


- **Query:** `contentToken=entmt:...` (base64). May require `Authorization: Bearer Atna|...`.
- **Response:** `{ "contentToken", "items": [ { "contentToken", "title", "subtitle", "providerId", "images" } ] }`.  
Start playback from a contentToken (e.g. tap Play on card) — exact request not isolated in current HAR.

---

## 9. Other endpoints (reference)

Same base (eu-api-alexa.{tld}) unless noted. Request/response shapes not fully specified here.

- **Identity/config:** `GET /api/endpoints`, `GET /api/users/me`, `GET /api/customer-status`
- **Content:** `GET /api/content`, `GET /api/welcome`
- **Features:** `POST /api/features/v2`, `POST /api/features/v2/triggers`, `POST /api/featureaccess-v3`
- **Entertainment:** `GET /api/entertainment/v1/screen`, `GET /api/entertainment/v1/mediaCollections`, `GET /api/entertainment/settings/appLaunchData`
- **Whole-home:** `GET /api/wholeHomeAudio/v1/groups`
- **Music/settings:** `GET /api/music/allowedProviders`, `GET /api/settings/autoplay`, `GET /api/settings/music/explicit`, `GET /api/v2/music/settings/...`, `GET /api/speakers/v2/{accountId}`
- **App notifications:** `GET /api/mobilepushnotifications/notifications`, `GET /api/v1/benefits/list`
- **Behaviors/routines:** `GET /api/behaviors/entities`, `GET /api/behaviors/actionDefinitions`, `GET /api/behaviors/triggers`, `GET /api/behaviors/blacklist`
- **Device/settings:** `GET /api/device-preferences`, `GET /api/childDirectedDevices`, `GET /api/person/settings`
- **GraphQL:** `POST /api/profile/graphql`, `POST /nexus/v1/graphql` (app state, device groups, endpoint state, control)
- **Search:** `POST /api/simba/searchResults`
- **DND:** `GET /api/dnd/device-status-list`, `PUT /api/dnd/status`, `GET /api/dnd/schedule`
- **Device volume:** `GET/PUT /api/devices/{deviceType}/{serial}/audio/v2/volume`, `PUT .../audio/v2/speakerVolume`
- **Alerts host (EU):** `GET https://api.eu.amazonalexa.com/v1/layouts`, `GET .../v1/locations/accounts/~current`

---

## 10. Locale by domain


| domain       | locale |
| ------------ | ------ |
| amazon.com   | en-US  |
| amazon.co.uk | en-GB  |
| amazon.de    | de-DE  |


---

## 11. Known gaps


| Area                         | Missing                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **US/Global base URL**       | Host for amazon.com (e.g. na-api-alexa.amazon.com or pitangui) — capture HAR with app signed in to amazon.com.                             |
| **Say something / Announce** | Whether `POST /api/behaviors/preview` with Alexa.Speak / AlexaAnnouncement or another path; capture “Say something” and “Announce to all”. |
| **Reminders**                | List/create endpoints (e.g. `/v1/alerts/reminders` on api.eu.amazonalexa.com).                                                             |
| **Timers**                   | List/create/update/cancel timers.                                                                                                          |
| **Alarms auth**              | Whether api.eu.amazonalexa.com uses cookie/CSRF or bearer.                                                                                 |
| **Media: start playback**    | Queue-and-play / play by contentToken from card.                                                                                           |
| **Media: other transport**   | Confirm NPPlayCommand, NPNextCommand, NPPreviousCommand, NPStopCommand on control-media-session.                                           |
| **Activity / voice history** | Polling for Alexa reply after Ask (two-way); document if needed for MCP.                                                                   |


---

*Evidence: HAR captures (UK) — alexa-devices-all-actions, alexa-090325, alexa-routine, alexa-play-stop, alexa-message, alexa-temperatures. Last consolidated: 2026-03-09.*