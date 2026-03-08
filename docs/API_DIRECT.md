# Alexa Direct API — Raw HTTP Reference

Direct API research via curl. No alexacli — for use in a Node MCP or any HTTP client.

---

## Auth Flow (UK: amazon.co.uk)

### 1. Token Exchange

```http
POST https://api.amazon.com/ap/exchangetoken/cookies
Content-Type: application/x-www-form-urlencoded
x-amzn-identity-auth-domain: api.amazon.co.uk

app_name=Amazon%20Alexa&requested_token_type=auth_cookies&source_token_type=refresh_token&source_token=Atnr|...&domain=.amazon.co.uk
```

**Response (200):**
```json
{
  "response": {
    "tokens": {
      "ttl": 2592000,
      "cookies": {
        ".amazon.co.uk": [
          {"Name": "session-id", "Value": "260-8171054-8779655", ...},
          {"Name": "ubid-acbuk", "Value": "262-0579311-9614925", ...},
          {"Name": "session-token", "Value": "...", ...},
          {"Name": "x-acbuk", "Value": "\"FRbTqFqlR2@...\"", ...},
          {"Name": "at-acbuk", "Value": "\"Atza|...\"", "HttpOnly": true, ...},
          {"Name": "sess-at-acbuk", "Value": "\"bfE77/...\"", "HttpOnly": true, ...}
        ]
      }
    }
  }
}
```

**Cookie naming:** Use domain suffix, e.g. `acbuk` for amazon.co.uk, `acb` for amazon.com.

Build cookie string: `Name1=Value1; Name2=Value2; ...` (strip surrounding quotes from x-acbuk, at-acbuk, sess-at-acbuk if needed).

---

### 2. CSRF Token

```http
GET https://alexa.amazon.co.uk/api/language
Cookie: session-id=...; ubid-acbuk=...; session-token=...; x-acbuk="..."; at-acbuk="..."; sess-at-acbuk="..."
Accept: application/json
```

Response sets `Set-Cookie: csrf=<value>`. Use `-c cookies.txt` with curl; read csrf value. Add `; csrf=<value>` to cookie string for later requests.

---

### 3. Base URLs by Domain

| domain | devices/behaviors/phoenix | routines |
|--------|---------------------------|----------|
| amazon.co.uk | https://layla.amazon.co.uk | https://alexa.amazon.co.uk |
| amazon.com | https://pitangui.amazon.com | https://alexa.amazon.com |
| amazon.de | https://layla.amazon.de | https://alexa.amazon.de |

**Headers for all Alexa API calls:**
```
Cookie: <from token exchange + csrf>
csrf: <csrf value>
Content-Type: application/json
Accept: application/json
```

---

## Devices

```http
GET https://layla.amazon.co.uk/api/devices-v2/device?cached=true
Cookie: ...
csrf: ...
```

**Response:**
```json
{
  "devices": [
    {
      "accountName": "Lounge Echo",
      "serialNumber": "G090XG...",
      "deviceType": "A1RABVCI4QCIKC",
      "deviceFamily": "ECHO",
      "deviceOwnerCustomerId": "ARK5DC6IGHZCC",
      "online": true,
      "capabilities": ["KINDLE_BOOKS", "APPLE_MUSIC", ...]
    }
  ]
}
```

Store `deviceOwnerCustomerId` from first device for customerId in behaviors.

---

## Behaviors (Speak, Announce, Command, Routine)

```http
POST https://layla.amazon.co.uk/api/behaviors/preview
Cookie: ...
csrf: ...
Content-Type: application/json
```

### Announce (all devices)

```json
{
  "behaviorId": "PREVIEW",
  "sequenceJson": "{\"@type\":\"com.amazon.alexa.behaviors.model.Sequence\",\"startNode\":{\"@type\":\"com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode\",\"type\":\"AlexaAnnouncement\",\"operationPayload\":{\"expireAfter\":\"PT5S\",\"content\":[{\"locale\":\"en-GB\",\"display\":{\"title\":\"Announcement\",\"body\":\"Dinner is ready\"},\"speak\":{\"type\":\"text\",\"value\":\"Dinner is ready\"}}],\"target\":{\"customerId\":\"ARK5DC6IGHZCC\"}}}}",
  "status": "ENABLED"
}
```

### Speak (single device)

```json
{
  "behaviorId": "PREVIEW",
  "sequenceJson": "{\"@type\":\"com.amazon.alexa.behaviors.model.Sequence\",\"startNode\":{\"@type\":\"com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode\",\"type\":\"Alexa.Speak\",\"operationPayload\":{\"deviceType\":\"A1RABVCI4QCIKC\",\"deviceSerialNumber\":\"G090XG...\",\"customerId\":\"ARK5DC6IGHZCC\",\"locale\":\"en-GB\",\"textToSpeak\":\"Hello world\"}}}",
  "status": "ENABLED"
}
```

### Text Command (voice command: alarm, music, ask, etc.)

```json
{
  "behaviorId": "PREVIEW",
  "sequenceJson": "{\"@type\":\"com.amazon.alexa.behaviors.model.Sequence\",\"startNode\":{\"@type\":\"com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode\",\"type\":\"Alexa.TextCommand\",\"skillId\":\"amzn1.ask.1p.tellalexa\",\"operationPayload\":{\"deviceType\":\"A1RABVCI4QCIKC\",\"deviceSerialNumber\":\"G090XG...\",\"customerId\":\"ARK5DC6IGHZCC\",\"locale\":\"en-GB\",\"text\":\"set an alarm for 7am\"}}}",
  "status": "ENABLED"
}
```

### Routine Run

```json
{
  "behaviorId": "amzn1.alexa.automation.xxx",
  "sequenceJson": "<full sequence from routines list>",
  "status": "ENABLED"
}
```

---

## Routines (list)

```http
GET https://alexa.amazon.co.uk/api/behaviors/v2/automations
Cookie: ...
csrf: ...
```

**Response:** Array of automation objects:
```json
[
  {
    "@type": "com.amazon.alexa.behaviors.model.Automation",
    "automationId": "amzn1.alexa.automation.xxx",
    "name": "evening lighting",
    "sequence": { ... },
    "status": "ENABLED",
    "type": "ROUTINE"
  }
]
```

To run: use `automationId` and full `sequence` in behaviors/preview POST.

---

## Phoenix (Smart Home) — List

```http
GET https://layla.amazon.co.uk/api/phoenix
Cookie: ...
csrf: ...
```

**Response structure (varies by account):**
```json
{
  "networkDetail": [{
    "applianceDetails": {
      "<key>": {
        "entityId": "...",
        "applianceId": "...",
        "friendlyName": "Kitchen Light",
        "applianceTypes": ["LIGHT"],
        "isReachable": true
      }
    }
  }]
}
```

## Phoenix — Control

```http
PUT https://layla.amazon.co.uk/api/phoenix/state
Cookie: ...
csrf: ...
Content-Type: application/json
```

```json
{
  "controlRequests": [{
    "entityId": "<from applianceDetails>",
    "entityType": "APPLIANCE",
    "parameters": {"action": "turnOn"}
  }]
}
```

Actions: `turnOn`, `turnOff`, `setBrightness` (with `"brightness": 0-100`).

---

## Locale by Domain

| domain | locale |
|--------|--------|
| amazon.co.uk | en-GB |
| amazon.com | en-US |
| amazon.de | de-DE |

---

## Refresh Token Source

Token from `alexacli auth` or [alexa-cookie-cli](https://github.com/adn77/alexa-cookie-cli). Lives in `~/.alexa-cli/config.json` or env `ALEXA_REFRESH_TOKEN`.

---

## Test Results

| Journey | API | Status |
|---------|-----|--------|
| Set alarm | `POST /api/behaviors/preview` Alexa.TextCommand | HTTP 200 |
| Play music | `POST /api/behaviors/preview` Alexa.TextCommand | HTTP 200 |
| Ask (response) | TextCommand + history polling | Command: 200. History: 403 |
| Weather (response) | TextCommand + history polling | Command: 200. History: 403 |
| Announce | `POST /api/behaviors/preview` AlexaAnnouncement | HTTP 200 |
| Control devices | `POST /api/behaviors/preview` Alexa.TextCommand | HTTP 200 |

**Office Echo** (for testing): serial `G090XG1223070MVV`, deviceType `A1RABVCI4QCIKC`, customerId `ARK5DC6IGHZCC`.

**History API (Ask/Weather response):** Returns 403. Tried:
- Load activity page first, same cookie jar for history API — still 403
- Activity CSRF: HTML-entity encoded as `anti-csrftoken-a2z&quot;:&quot;{VALUE}&quot;` — extract with regex `anti-csrftoken-a2z&quot;:&quot;([^&]+)&quot;`
- Cookie jar, explicit anti-csrftoken-a2z header — still 403

**Recommendation:** Use AVS AskPlus (Type-to-Alexa) for two-way Ask instead of history polling.
