# ROADMAP

## Device Capabilities (DONE)
✅ Capabilities exposed via `listAppliances()` using batched GraphQL `endpoint()` queries
- Feature names returned: `power`, `brightness`, `colorTemperature`, `commissionable`, etc.
- Example: Kitchen Spot → `["colorTemperature", "power", "brightness"]`
- Example: Lounge Lamp (socket) → `["power", "commissionable"]`
- Note: The layouts API (`/api/smarthome/v1/presentation/devices/control`) returns empty templates; the app uses GraphQL instead

## TODO
- Light color and shades (color temperature control - API supports it, need to implement GraphQL mutation)
- Feedback if things fail/are incorrect - i.e. setting volume or brightness of a socket claims success
  - Can now check capabilities before attempting operations
- Device basic type (socket, bulb, etc.) - partially solved via capabilities array
