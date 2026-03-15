# Device Capabilities

## Summary

Device capabilities are exposed via the GraphQL `endpoint()` query on `/nexus/v1/graphql`. Each endpoint returns a `features` array listing what the device supports, along with current state values. This is the same API the Alexa mobile app uses.

## API

**POST** `/nexus/v1/graphql` — batched `endpoint()` queries (see API.md §5.4 for full details).

The `features[].name` values indicate capabilities:

| Feature name        | Meaning                                  |
| ------------------- | ---------------------------------------- |
| `power`             | On/off control (all smart devices)       |
| `brightness`        | Brightness 0–100 (dimmable lights)       |
| `colorTemperature`  | Color temperature in Kelvin (white spectrum bulbs) |
| `connectivity`      | Reachability status                      |
| `commissionable`    | Matter/Thread commissioning support      |
| `endpointHealth`    | Device health (filtered out internally)  |

### Example GraphQL Response

```json
{
  "data": {
    "endpoint": {
      "id": "amzn1.alexa.endpoint.e8a151a4-3234-4a45-a060-552263594db1",
      "enablement": "ENABLED",
      "features": [
        { "name": "colorTemperature", "properties": [{ "colorTemperatureInKelvinStateValue": 4000 }] },
        { "name": "power", "properties": [{ "powerStateValue": "ON" }] },
        { "name": "brightness", "properties": [{ "brightnessStateValue": 92 }] },
        { "name": "connectivity", "properties": [{ "reachabilityStatusValue": "OK" }] }
      ]
    }
  }
}
```

## Implementation

`AlexaClient.listAppliances()` batches `EndpointFeaturesQuery` for all known endpoints and populates the `capabilities` array. Internal features (`endpointHealth`, `connectivity`) are filtered out.

```typescript
interface Appliance {
  entityId: string;
  endpointId?: string;
  friendlyName: string;
  isReachable: boolean;
  capabilities?: string[];  // e.g., ["colorTemperature", "power", "brightness"]
}
```

## Verified Device Examples

**Kitchen Spot** (dimmable bulb with color temp):
```json
{ "friendlyName": "Kitchen Spot", "capabilities": ["colorTemperature", "power", "brightness"] }
```

**Lounge Lamp** (plug socket):
```json
{ "friendlyName": "Lounge Lamp", "capabilities": ["power", "commissionable"] }
```

## Use Cases

### Validate Operations Before Execution

```typescript
const device = await client.resolveApplianceByName("Kitchen Spot");
if (device?.capabilities?.includes("brightness")) {
  await client.setBrightness(device.endpointId!, 50);
} else {
  console.error("Device does not support brightness control");
}
```

### Detect Device Types

```typescript
function getDeviceType(appliance: Appliance): string {
  const caps = appliance.capabilities ?? [];
  if (caps.includes("colorTemperature")) return "white-spectrum-bulb";
  if (caps.includes("brightness")) return "dimmable-bulb";
  if (caps.includes("power") && !caps.includes("brightness")) return "socket";
  return "unknown";
}
```

## Deprecated Approach

The layouts API (`GET /api/smarthome/v1/presentation/devices/control`) was originally investigated for capabilities. It returns `template` objects with `interfaceName` values like `Alexa.PowerController`, `Alexa.BrightnessController`, etc. However, the current live API returns all layouts with `type: "None"` and `template: null`. This endpoint is now only used for endpoint UUID discovery — see API.md §5.2.

## Next Steps

1. **Color Temperature Control** — `setColorTemperature` mutation is documented in API.md §5.5; implement in client
2. **Validation** — Add capability checks before operations to provide better error messages
3. **MCP Tools** — Expose capabilities in MCP tool responses for better UX
