# ROADMAP

## Device Capabilities (DONE)
✅ Capabilities exposed via `listAppliances()` using batched GraphQL `endpoint()` queries
- Feature names returned: `power`, `brightness`, `colorTemperature`, `commissionable`, etc.
- Example: Kitchen Spot → `["colorTemperature", "power", "brightness"]`
- Example: Lounge Lamp (socket) → `["power", "commissionable"]`
- Note: The layouts API (`/api/smarthome/v1/presentation/devices/control`) returns empty templates; the app uses GraphQL instead

## Agent-Oriented Improvements (DONE)
✅ All control commands return live device state (power, brightness, colorTemp) as JSON after applying
✅ `status <name>` CLI command + `alexa_device_status` MCP tool for state query without control action
✅ `group-members <group>` CLI command + `alexa_group_members` MCP tool for post-action group verification
✅ `batchControlAppliances` returns per-device `{entityId, success, error?}` result array
✅ `run --name / --partial` CLI + `name`/`partial` params on `alexa_run_routine` MCP tool
✅ `appliances --type <light|switch|plug|sensor|camera>` filter in CLI and `alexa_list_appliances`
✅ `displayName` field on appliance output with 4-char endpoint suffix for duplicate disambiguation
✅ `resolveAppliancesByPattern` fuzzy fallback: OR-match if all-word AND-match returns 0 results

## TODO

### High Priority

**Color Temperature Control** 🎨
- GraphQL mutation documented and verified in schema
- HAR capture confirms exact mutation shape
- Method: `setColorTemperature(endpointId, kelvin)` using `setEndpointFeatures`
- Range: 2000-6500K
- Status: Ready to implement (see `docs/API.md` §5.5, `docs/graphql-reference.md`)

**Voice History API** 🎯 *New from academic paper*
- Endpoint: `/alexa-privacy/apd/rvh/...` (exact path TBD)
- Returns: All voice requests with timestamps, transcripts, intents, device info
- Includes Voice ID attribution (personIdV2)
- Use case: Query "what did I ask Alexa last week?"
- Source: [arxiv.org/html/2408.15768v1](https://arxiv.org/html/2408.15768v1) (2024 forensics paper)
- Status: API exists, needs implementation

### Medium Priority

**Photos/Drive API** 📸 *New from academic paper*
- List endpoint: `cdws.eu-west-1.amazonaws.com/drive/v1/search`
- Download endpoint: `content-eu.drive.amazonaws.com/v2/download/signed/{id}`
- Returns: Photos/videos from Echo Show devices with metadata
- Use case: Access photos taken by Echo Show cameras programmatically
- Source: Same forensics paper
- Status: API exists, needs implementation
- Note: Only relevant for Echo Show devices with cameras

**RGB Color Control** 🌈
- GraphQL mutation: `setEndpointFeatures` with `featureName: color`
- Not yet captured in HAR files
- Need to test with RGB-capable bulb
- Status: Schema available, needs testing

### Low Priority

**User Profiles API** 👥 *New from academic paper*
- Endpoint: `/alexa-privacy/apd/rvh/persons-in-household`
- Returns: List of household members with Voice ID/Visual ID configuration
- Includes personId for each profile
- Use case: Multi-user household management, profile switching
- Source: Same forensics paper
- Status: API exists, needs implementation

**Validation & Error Handling**
- Feedback if operations fail/are incorrect (e.g., setting volume/brightness on incompatible devices)
- Can now check capabilities before attempting operations
- Add pre-flight capability checks to prevent invalid operations
- Status: Partially solved via capabilities array

**Device Type Detection** *(Partially DONE)*
- `appliances --type <light|switch|plug|sensor|camera>` filter now available in CLI and MCP
- Infer full device type (socket, bulb, white-spectrum, RGB) from capabilities
- Helper function exists in `docs/DEVICE-CAPABILITIES.md`
- Status: Filtering done; richer type taxonomy (RGB vs white-spectrum) still pending

**GraphQL `endpoints()` Query Exploration**
- Test if GraphQL `endpoints(endpointsQueryParams)` can replace REST `/api/smarthome/v2/endpoints`
- Potential savings: 1-2 REST endpoints
- Risk: Medium (needs extensive testing)
- Priority: Low (current REST endpoints work reliably)

## Research Sources

- **GraphQL Schema Introspection** (2026-03-15): 879 types documented in `docs/graphql-schema.json`
- **HAR Captures**: Kitchen Spot control, device capabilities, brightness/color temp mutations
- **Academic Paper**: "Started Off Local, Now We're in the Cloud: Forensic Examination of the Amazon Echo Show 15 Smart Display" (2024)
  - URL: https://arxiv.org/html/2408.15768v1
  - New APIs discovered: Voice history, photos/drive, user profiles
  - Confirmed our GraphQL usage matches official Alexa app behavior

--

- CI Pipelines
- Wider test coverage
- Routines
- Cameras
- User profiles
- Voice history
- Speed - slow at the moment