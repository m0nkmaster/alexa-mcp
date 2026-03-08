# Alexa API Documentation

Documentation for the unofficial Alexa APIs used to control Echo devices and smart home.

## Contents

| File | Description |
|------|-------------|
| [API_EXPLORATION.md](API_EXPLORATION.md) | Core user journeys (alarm, music, ask, weather, announce, devices) mapped to APIs |
| [API_REFERENCE.md](API_REFERENCE.md) | Endpoint reference by capability |
| [API_RESEARCH.md](API_RESEARCH.md) | Request/response structures from alexa-cli source and wiki |
| [API_DIRECT.md](API_DIRECT.md) | **Direct HTTP reference** — raw curl-style requests, no alexacli |

## Credentials

Credentials live in `~/.alexa-cli/config.json` (set by `alexacli auth`):
- `refresh_token` — from browser login via alexa-cookie-cli
- `amazon_domain` — e.g. `amazon.co.uk`

## Refresh Token

Tokens expire ~14 days. To refresh:
```bash
alexacli auth --domain amazon.co.uk
```

## Testing

With valid credentials:
```bash
export ALEXA_REFRESH_TOKEN=$(jq -r .refresh_token ~/.alexa-cli/config.json)
export ALEXA_AMAZON_DOMAIN=$(jq -r .amazon_domain ~/.alexa-cli/config.json)
alexacli devices --json
```

## User Journeys

| Journey | Direct API | Status |
|---------|------------|--------|
| Set alarm | TextCommand | OK |
| Play music | TextCommand | OK |
| Ask (web search) | TextCommand + history polling | Command OK; history 403 |
| Weather | TextCommand + history polling | Command OK; history 403 |
| Announce | AlexaAnnouncement | OK |
| Control devices | TextCommand | OK |

See [API_EXPLORATION.md](API_EXPLORATION.md) and [API_DIRECT.md](API_DIRECT.md) for test results.
