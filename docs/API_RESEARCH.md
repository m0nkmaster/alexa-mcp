# Alexa Unofficial API Research

Extracted from [alexa-cli](https://github.com/buddyh/alexa-cli) source and [alexa_media_player wiki](https://github.com/alandtse/alexa_media_player/wiki/Developers:-Known-Endpoints).

---

## 1. Authentication

### Token Exchange (Consumer Alexa)

**Endpoint:** `POST https://api.amazon.com/ap/exchangetoken/cookies`

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
x-amzn-identity-auth-domain: api.{amazon_domain}
```

**Body (form-urlencoded):**
| Field | Value |
|-------|-------|
| app_name | Amazon Alexa |
| requested_token_type | auth_cookies |
| source_token_type | refresh_token |
| source_token | Atnr\|... |
| domain | .{amazon_domain} |

**Response:** JSON with `response.tokens.cookies` — map of domain → array of `{Name, Value}` cookies.

### CSRF Token

**Endpoint:** `GET https://alexa.{domain}/api/language`

**Headers:** `Cookie`, `Accept: application/json`

**Response:** Sets `csrf` cookie. Extract from `Set-Cookie` or append to cookie string.

### Activity CSRF (for Ask / voice history)

**Endpoint:** `GET https://www.{domain}/alexa-privacy/apd/activity?ref=activityHistory`

**Response:** HTML. Parse for CSRF via regex:
- `<meta name="csrf-token" content="...">`
- `data-csrf="..."`
- `"csrfToken" : "..."`
- `anti-csrftoken-a2z['":\s]+['"]([^'"]+)['"]`

### AVS Bearer (for AskPlus)

**Endpoint:** `POST https://api.amazon.com/auth/token`

**Body:**
| Field | Value |
|-------|-------|
| requested_token_type | access_token |
| source_token_type | refresh_token |
| source_token | refresh token |
| app_name | Amazon Alexa |
| app_version | 2.2.696573.0 |

---

## 2. Devices API

**Endpoint:** `GET {baseURL}/api/devices-v2/device?cached=true`

**Headers:**
```
Cookie: ...
csrf: ...
Content-Type: application/json
Accept: application/json
```

**Response structure:**
```json
{
  "devices": [
    {
      "accountName": "string",
      "serialNumber": "string",
      "deviceType": "string",
      "deviceFamily": "string",
      "deviceOwnerCustomerId": "string",
      "online": true,
      "capabilities": ["string"]
    }
  ]
}
```

---

## 3. Behaviors API (Speak, Announce, Command, Routine)

**Endpoint:** `POST {baseURL}/api/behaviors/preview`

**Payload:**
```json
{
  "behaviorId": "PREVIEW",
  "sequenceJson": "<JSON string>",
  "status": "ENABLED"
}
```

### Alexa.Speak (TTS on device)

```json
{
  "@type": "com.amazon.alexa.behaviors.model.Sequence",
  "startNode": {
    "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
    "type": "Alexa.Speak",
    "operationPayload": {
      "deviceType": "A2TF17PFR55MTB",
      "deviceSerialNumber": "G...",
      "customerId": "A...",
      "locale": "en-GB",
      "textToSpeak": "Hello world"
    }
  }
}
```

### AlexaAnnouncement (announce to all)

```json
{
  "@type": "com.amazon.alexa.behaviors.model.Sequence",
  "startNode": {
    "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
    "type": "AlexaAnnouncement",
    "operationPayload": {
      "expireAfter": "PT5S",
      "content": [{
        "locale": "en-GB",
        "display": {"title": "Announcement", "body": "Dinner is ready"},
        "speak": {"type": "text", "value": "Dinner is ready"}
      }],
      "target": {"customerId": "A..."}
    }
  }
}
```

### Alexa.TextCommand (voice command)

```json
{
  "@type": "com.amazon.alexa.behaviors.model.Sequence",
  "startNode": {
    "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
    "type": "Alexa.TextCommand",
    "skillId": "amzn1.ask.1p.tellalexa",
    "operationPayload": {
      "deviceType": "...",
      "deviceSerialNumber": "...",
      "customerId": "...",
      "locale": "en-GB",
      "text": "what's the weather"
    }
  }
}
```

### Routine execution

Use `behaviorId: <automationId>` and `sequenceJson: <routine sequence>` from routines list.

---

## 4. Routines API

**Endpoint:** `GET https://alexa.{domain}/api/behaviors/automations`

**Response:** Array of:
```json
{
  "automationId": "string",
  "name": "string",
  "sequence": { ... }
}
```

Deprecated per wiki; v2: `/api/behaviors/v2/automations`.

---

## 5. Phoenix API (Smart Home)

### List appliances

**Endpoint:** `GET {baseURL}/api/phoenix`

**Response:**
```json
{
  "networkDetail": [{
    "applianceDetails": {
      "<key>": {
        "entityId": "string",
        "applianceId": "string",
        "friendlyName": "string",
        "friendlyDescription": "string",
        "applianceTypes": ["LIGHT", "SMARTPLUG", ...],
        "isReachable": true
      }
    }
  }]
}
```

### Control appliance

**Endpoint:** `PUT {baseURL}/api/phoenix/state`

**Payload (turnOn):**
```json
{
  "controlRequests": [{
    "entityId": "<from applianceDetails>",
    "entityType": "APPLIANCE",
    "parameters": {"action": "turnOn"}
  }]
}
```

**Payload (turnOff):**
```json
{
  "controlRequests": [{
    "entityId": "...",
    "entityType": "APPLIANCE",
    "parameters": {"action": "turnOff"}
  }]
}
```

**Payload (brightness):**
```json
{
  "controlRequests": [{
    "entityId": "...",
    "entityType": "APPLIANCE",
    "parameters": {
      "action": "setBrightness",
      "brightness": 75
    }
  }]
}
```

---

## 6. Activity / Voice History (Ask response)

**Endpoint:**  
`POST https://www.{domain}/alexa-privacy/apd/rvh/customer-history-records-v2/?startTime={ms}&endTime={ms}&pageType=VOICE_HISTORY`

**Headers:**
```
Cookie, csrf, anti-csrftoken-a2z, Content-Type: application/json
Referer: https://www.{domain}/alexa-privacy/apd/activity?ref=activityHistory
Origin: https://www.{domain}
```

**Body:** `{"previousRequestToken": null}`

**Response:** `customerHistoryRecords[]` with `voiceHistoryRecordItems[]` — `recordItemType`: `ASR_REPLACEMENT_TEXT` (user) or `TTS_REPLACEMENT_TEXT` (Alexa).

---

## 7. AVS (AskPlus)

**Base:** `https://avs-alexa-eu.amazon.com` (EU/UK), `https://avs-alexa-12-na.amazon.com` (US)

### Send text (Type-to-Alexa)

**Endpoint:** `POST {avs}/v20160207/events`

**Headers:** `Authorization: Bearer {access_token}`, `Content-Type: multipart/form-data`

**Body:** multipart with `metadata` part containing JSON:
```json
{
  "event": {
    "header": {
      "namespace": "Alexa.Input.Text",
      "name": "TextMessage",
      "messageId": "...",
      "dialogRequestId": "Mobile_TTA_..."
    },
    "payload": {"text": "what is the population of Tokyo"}
  },
  "context": [ ... ]
}
```

### Get fragments

**Endpoint:** `GET {avs}/v1/conversations/{conversationId}/fragments/synchronize`

---

## Base URLs by domain

| domain | pitangui/layla | alexa |
|--------|----------------|-------|
| amazon.com | pitangui.amazon.com | alexa.amazon.com |
| amazon.co.uk | layla.amazon.co.uk | alexa.amazon.co.uk |
| amazon.de | layla.amazon.de | alexa.amazon.de |

---

## Locale by domain

| domain | locale |
|--------|--------|
| amazon.com | en-US |
| amazon.co.uk | en-GB |
| amazon.de | de-DE |
