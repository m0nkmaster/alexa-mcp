# API Usage Summary

**Total APIs Used:** 18 distinct endpoints across 3 categories

## API Categories

### 1. GraphQL API (1 endpoint, multiple operations)

**Base:** `/nexus/v1/graphql`

| Operation | Purpose | Method |
|-----------|---------|--------|
| `endpoint()` query | Fetch device features/capabilities and state | POST |
| `endpoint()` query | Fetch friendly names | POST |
| `setEndpointFeatures` mutation | Power control (on/off) | POST |
| `setEndpointFeatures` mutation | Brightness control | POST |

**Total operations:** 4 (batching supported)

### 2. REST APIs - Smart Home (4 endpoints)

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/smarthome/v2/endpoints` | POST | List all smart home devices | `listAppliances()` |
| `/api/smarthome/v1/presentation/devices/control` | GET | Get endpoint UUIDs (layouts) | `fetchLayouts()` |
| `/api/phoenix/state` | PUT | Legacy appliance control (non-GraphQL) | `controlAppliance()`, `setBrightness()` |
| `/api/phoenix/group` | GET | List device groups (rooms/spaces) | `listDeviceGroups()` |

### 3. REST APIs - Echo Devices (2 endpoints)

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/devices-v2/device?cached=true` | GET | List Echo devices | `getDevices()` |
| `/api/devices/{type}/{serial}/audio/v2/volume` | GET | Get device volume | `getVolume()` |
| `/api/devices/{type}/{serial}/audio/v2/speakerVolume` | PUT | Set device volume | `setVolume()` |

**Total:** 3 (volume GET/PUT counted as 2)

### 4. REST APIs - Behaviors/Routines (3 endpoints)

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/behaviors/preview` | POST | Execute TTS, announcements, routines | `speak()`, `announce()`, `command()`, `runRoutine()` |
| `/api/routines/routinesandgroups` | GET | List all routines | `listRoutines()` |
| `/api/behaviors/automations/{id}` | GET | Get routine details with sequence | `getAutomation()` |

### 5. REST APIs - Media/Now Playing (3 endpoints)

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/np/player` | GET | Get now-playing state | `getNowPlaying()` |
| `/api/np/list-media-sessions` | GET | List active media sessions | `listMediaSessions()`, `getNowPlaying()` fallback |
| `/api/np/control-media-session` | POST | Media transport control (play/pause/etc.) | `controlMediaSession()` |

### 6. REST APIs - Other (1 endpoint)

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/api/wholeHomeAudio/v1/groups` | GET | List multi-room audio groups | `listAudioGroups()` |

## Summary by Category

| Category | Endpoint Count | Operations/Methods |
|----------|----------------|-------------------|
| **GraphQL** | 1 | 4 operations (queries + mutations) |
| **Smart Home** | 4 | 4 methods |
| **Echo Devices** | 3 | 3 methods |
| **Behaviors/Routines** | 3 | 4 methods |
| **Media** | 3 | 3 methods |
| **Audio Groups** | 1 | 1 method |
| **TOTAL** | **15 unique REST endpoints + 1 GraphQL** | **19 API methods** |

## API Method Distribution

### Most Used Endpoint
**`/api/behaviors/preview`** — Used by 4 methods:
- `speak()` — TTS to specific Echo
- `announce()` — Announce to all devices
- `command()` — Voice command execution
- `runRoutine()` — Execute routine

### GraphQL Operations
All GraphQL operations go through `/nexus/v1/graphql`:
- **Queries:** 2 (endpoint features, friendly names)
- **Mutations:** 2 (power, brightness)
- **Batching:** Supported (multiple operations in single request)

### API Hosts

| Region | Host | Endpoints Used |
|--------|------|----------------|
| UK/EU | `eu-api-alexa.amazon.co.uk` | All 16 endpoints |
| US | `na-api-alexa.amazon.com` | All 16 endpoints |
| DE | `eu-api-alexa.amazon.de` | All 16 endpoints |

## Authentication

All APIs use the same authentication:
- **Cookie:** Session cookies from token exchange
- **CSRF:** Token from `/api/language` response
- **GraphQL additional headers:** `x-amzn-client`, `x-amzn-build-version`, etc.

## API Usage Patterns

### High Frequency (Called Often)
- `/api/smarthome/v2/endpoints` — Every appliance list
- `/nexus/v1/graphql` (endpoint query) — Batch capabilities fetch
- `/api/devices-v2/device` — Every device list

### Medium Frequency
- `/api/behaviors/preview` — Per TTS/announce/routine
- `/api/np/player` — Per now-playing check
- `/api/phoenix/state` — Legacy appliance control

### Low Frequency (One-Time/Cached)
- `/api/routines/routinesandgroups` — List routines
- `/api/wholeHomeAudio/v1/groups` — List audio groups
- `/api/phoenix/group` — List device groups

## Not Yet Implemented (Available)

From schema introspection, these are available but not used:

1. **Color temperature control** — `setEndpointFeatures` mutation (documented, ready to implement)
2. **RGB color control** — `setEndpointFeatures` mutation (schema available)
3. **Endpoint settings** — `endpointSettings()` query
4. **Endpoint preferences** — `endpointCustomerPreferences()` query

## Deprecated/Removed

- ❌ `/api/smarthome/v1/presentation/devices/control` for capabilities — Now returns empty templates
  - Still used for UUID discovery only
  - Replaced by GraphQL `endpoint()` query for capabilities

## Total Count

**18 distinct API endpoints** (15 REST + 1 GraphQL + 2 legacy/fallback)

**19 API operations** when counting GraphQL queries/mutations separately
