# MCP Response Optimization Analysis

**Generated:** 2026-03-14  
**Data Source:** `mcp-response-analysis.json`

## Executive Summary

Analysis of MCP tool responses reveals that **`list_devices`** and **`list_appliances`** account for **88% of total response size** (32.71 KB out of 37.17 KB). These responses contain significant amounts of unnecessary data that should be trimmed.

## Response Size Breakdown

| Tool | Size (KB) | % of Total | Status |
|------|-----------|------------|--------|
| **list_devices** | 15.91 | 42.8% | ⚠️ **NEEDS OPTIMIZATION** |
| **list_appliances** | 16.80 | 45.2% | ⚠️ **NEEDS OPTIMIZATION** |
| list_device_groups | 1.50 | 4.0% | ✅ Acceptable |
| list_audio_groups | 0.61 | 1.6% | ✅ Acceptable |
| list_routines | 0.97 | 2.6% | ✅ Acceptable |
| auth_status | 0.04 | 0.1% | ✅ Minimal |
| get_volume | 0.01 | 0.0% | ✅ Minimal |
| now_playing | 0.45 | 1.2% | ✅ Acceptable |
| get_brightness_by_name | 0.00 | 0.0% | ✅ Minimal |

**Total:** 37.17 KB

---

## 1. list_devices (15.91 KB) ⚠️

### Current State
- **12 devices** in response
- **21 fields per device**
- **37 capabilities per device** (large array)
- **clusterMembers** array (often empty)

### Issues Identified

#### A. Excessive Capabilities Array
Each device includes 37+ capability strings like:
```json
"capabilities": [
  "REMINDERS",
  "SET_TIME_ZONE",
  "SPEECH_RECOGNIZER_USS",
  "EARCONS",
  "PERSISTENT_CONNECTION",
  "AUDIBLE",
  "AMAZON_MUSIC",
  "HANDS_FREE",
  "SUPPORTS_LOCALE",
  "SUPPORTS_CONNECTED_HOME_CLOUD_ONLY",
  "SUPPORTS_LOCALE_SWITCH",
  "ADAPTIVE_LISTENING",
  "APPLE_MUSIC",
  "CUSTOM_ALARM_TONE",
  "SET_LOCALE",
  "VOLUME_SETTING",
  "SLEEP",
  "DIALOG_INTERFACE_VERSION",
  "ASCENDING_ALARM_VOLUME",
  "TIMERS_AND_ALARMS",
  "KINDLE_BOOKS",
  "AUDIO_PLAYER",
  "DEEZER",
  "I_HEART_RADIO",
  "TIDAL",
  "TOUCH_INITIATED",
  "DEREGISTER_DEVICE",
  // ... and more
]
```

**Impact:** This array alone accounts for ~40% of device object size.

**Recommendation:** Remove or drastically reduce. MCP tools don't need to know if a device supports "KINDLE_BOOKS" or "DEEZER". Keep only essential capabilities if any.

#### B. Unnecessary Metadata Fields
Many fields are not used by MCP tools:
- `appDeviceList` (often empty array)
- `associatedUnitIds` (often null)
- `charging` (null for most devices)
- `clusterMembers` (empty array for most)
- `essid` (WiFi SSID - privacy concern)
- `macAddress` (privacy/security concern)
- `registrationId`
- `remainingBatteryLevel` (null for most)

**Recommendation:** Remove these fields entirely from MCP responses.

#### C. Duplicate Information
Some fields contain redundant data:
- `accountName` vs `deviceAccountId`
- `serialNumber` vs `deviceSerialNumber` (if both exist)

### Recommended Fields to Keep

**Essential fields only:**
```json
{
  "accountName": "Office TV",
  "serialNumber": "G091...",
  "deviceType": "A3S5BH2HU6VAYF",
  "deviceFamily": "ROOK",
  "deviceOwnerCustomerId": "A2TF...",
  "online": true,
  "softwareVersion": "123456789"
}
```

**Estimated size reduction:** 15.91 KB → **~4 KB** (75% reduction)

---

## 2. list_appliances (16.80 KB) ⚠️

### Current State
- **59 appliances** in response
- **6 fields per appliance**

### Issues Identified

#### A. Redundant ID Fields
Each appliance has multiple identifiers:
```json
{
  "entityId": "AAA_SonarCloudService_...",
  "endpointId": "amzn1.alexa.endpoint...",
  "applianceId": "AAA_SonarCloudService_..."
}
```

**Issue:** `entityId` and `applianceId` appear to be duplicates in many cases.

**Recommendation:** 
- Keep `endpointId` (used for GraphQL control - most important)
- Keep `entityId` (fallback for some devices)
- **Remove `applianceId`** if it duplicates `entityId`

#### B. Verbose applianceTypes Array
Each appliance includes an array of type strings:
```json
"applianceTypes": [
  "SMARTPLUG",
  "SWITCH"
]
```

**Recommendation:** Keep this but verify it's actually used by MCP tools. If not needed for device filtering, consider removing.

### Recommended Fields to Keep

**Minimal set:**
```json
{
  "endpointId": "amzn1.alexa.endpoint.xxx",
  "entityId": "AAA_SonarCloudService_xxx",
  "friendlyName": "Lounge Lamp",
  "isReachable": true
}
```

**Estimated size reduction:** 16.80 KB → **~8 KB** (52% reduction)

---

## 3. Other Tools ✅

The remaining tools have acceptable response sizes:
- **list_device_groups** (1.50 KB) - Reasonable for group data
- **list_audio_groups** (0.61 KB) - Minimal
- **list_routines** (0.97 KB) - Acceptable
- **auth_status** (0.04 KB) - Minimal
- **get_volume** (0.01 KB) - Minimal
- **now_playing** (0.45 KB) - Acceptable
- **get_brightness_by_name** (0.00 KB) - Minimal

**No optimization needed for these tools.**

---

## Overall Recommendations

### Priority 1: list_devices
1. **Remove capabilities array** entirely or keep only 2-3 essential ones
2. **Remove privacy/security fields:** `macAddress`, `essid`
3. **Remove unused fields:** `appDeviceList`, `associatedUnitIds`, `charging`, `clusterMembers`, `registrationId`, `remainingBatteryLevel`
4. **Keep only:** `accountName`, `serialNumber`, `deviceType`, `deviceFamily`, `deviceOwnerCustomerId`, `online`, `softwareVersion`

### Priority 2: list_appliances
1. **Remove duplicate ID:** Drop `applianceId` if it duplicates `entityId`
2. **Evaluate applianceTypes:** Remove if not used by MCP tools
3. **Keep only:** `endpointId`, `entityId`, `friendlyName`, `isReachable`

### Expected Impact
- **Current total:** 37.17 KB
- **After optimization:** ~13 KB
- **Reduction:** ~65% (24 KB saved)

---

## Implementation Notes

### Where to Make Changes

The response trimming should happen in the MCP server implementation, likely in:
- `src/index.ts` - MCP tool handlers
- `src/client.ts` - Response transformation methods

### Approach

1. Create response mapper functions that extract only needed fields
2. Apply mappers in MCP tool handlers before returning to client
3. Keep full responses in CLI for debugging/advanced use
4. Document which fields are available in CLI vs MCP

### Testing

Use the test script to verify size reductions:
```bash
/usr/local/bin/node --import tsx scripts/capture-mcp-responses.ts
```

Compare before/after sizes in the summary output.

---

## Next Steps

1. **Review this analysis** with the team
2. **Decide on exact field sets** to keep for each tool
3. **Implement response mappers** in `src/index.ts`
4. **Test with MCP clients** to ensure functionality is preserved
5. **Update documentation** to reflect available fields
6. **Re-run capture script** to verify size reductions
