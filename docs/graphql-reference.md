# Alexa GraphQL API Reference

Generated from introspection of `/nexus/v1/graphql` endpoint (2026-03-15).

## Overview

The Alexa GraphQL API provides access to smart home device control, state queries, and metadata. The schema contains **879 types** including queries, mutations, objects, interfaces, and enums.

**Base URL:** `/nexus/v1/graphql` on `eu-api-alexa.amazon.co.uk` (EU) or `na-api-alexa.amazon.com` (US)

**Required Headers:**
```
x-amzn-client: AlexaApp
x-amzn-build-version: 2.2.706594
x-amzn-os-name: ios
x-amzn-devicetype: phone
x-amzn-devicetype-id: A2IVLV5VM2W81
x-amzn-marketplace-id: A1F83G8C2ARO7P
Cookie: <auth cookies>
csrf: <csrf token>
```

## Key Queries

### `endpoint(id: String): Endpoint`

Fetch endpoint details, features, and current state for a smart home device.

**Used for:** Device capabilities discovery, current brightness/power/color state

**Example:**
```graphql
query EndpointFeaturesQuery($endpointId: String!) {
  endpoint(id: $endpointId) {
    id
    enablement
    friendlyNameObject { value { text } }
    features {
      name
      properties {
        __typename
        name
        type
        accuracy
        ... on Brightness { brightnessStateValue }
        ... on ColorTemperature { colorTemperatureInKelvinStateValue }
        ... on Power { powerStateValue }
        ... on Reachability { reachabilityStatusValue }
      }
    }
  }
}
```

**Variables:** `{ "endpointId": "amzn1.alexa.endpoint.{uuid}" }`

**Response fields:**
- `id` — Endpoint ID
- `enablement` — `"ENABLED"` or `"DISABLED"`
- `friendlyNameObject.value.text` — Display name (e.g., "Kitchen Spot")
- `features[]` — Array of feature objects with `name` and `properties`

### `endpoints(endpointsQueryParams: EndpointsQueryParams): EndpointsResponse`

List multiple endpoints with filtering.

### Other Queries

- `endpointCustomerPreferences(input)` — User preferences for an endpoint
- `endpointSetting(input)` — Specific endpoint setting
- `endpointSettings(input)` — All settings for an endpoint

## Key Mutations

### `setEndpointFeatures(setEndpointFeaturesInput: SetEndpointFeaturesInput)`

Control smart home devices (power, brightness, color temperature, etc.).

**Input type:**
```graphql
input SetEndpointFeaturesInput {
  featureControlRequests: [FeatureControlRequest]
}
```

#### Power Control

```graphql
mutation setPower($endpointId: String, $featureOperationName: FeatureOperationName!) {
  setEndpointFeatures(setEndpointFeaturesInput: {
    featureControlRequests: [{
      endpointId: $endpointId,
      featureName: power,
      featureOperationName: $featureOperationName
    }]
  }) {
    featureControlResponses { code endpointId featureOperationName }
    errors { code message featureOperationName }
  }
}
```

**Variables:** `{ "endpointId": "amzn1.alexa.endpoint.{uuid}", "featureOperationName": "turnOn" | "turnOff" }`

#### Brightness Control

```graphql
mutation setBrightness($endpointId: String, $value: Int) {
  setEndpointFeatures(setEndpointFeaturesInput: {
    featureControlRequests: [{
      endpointId: $endpointId,
      featureName: brightness,
      featureOperationName: setBrightness,
      payload: {brightness: $value}
    }]
  }) {
    featureControlResponses { code endpointId featureOperationName }
    errors { code message featureOperationName }
  }
}
```

**Variables:** `{ "endpointId": "amzn1.alexa.endpoint.{uuid}", "value": 0–100 }`

#### Color Temperature Control

```graphql
mutation setColorTemperature($endpointId: String!, $colorTemperatureInKelvin: Int!) {
  setEndpointFeatures(setEndpointFeaturesInput: {
    featureControlRequests: [{
      endpointId: $endpointId,
      featureName: colorTemperature,
      featureOperationName: setColorTemperature,
      payload: {colorTemperatureInKelvin: $colorTemperatureInKelvin}
    }]
  }) {
    featureControlResponses { code endpointId featureOperationName }
    errors { code message featureOperationName }
  }
}
```

**Variables:** `{ "endpointId": "amzn1.alexa.endpoint.{uuid}", "colorTemperatureInKelvin": 2000–6500 }`

## Core Types

### `Endpoint`

Represents a smart home device endpoint.

**Key fields:**
- `id: String` — Endpoint ID (amzn1.alexa.endpoint.*)
- `endpointId: String` — Same as id
- `friendlyName: String` — Display name
- `friendlyNameObject: NameValueObject` — Structured name with `.value.text`
- `description: NameValueObject` — Device description
- `manufacturer: NameValueObject` — Manufacturer info
- `model: NameValueObject` — Model info
- `serialNumber: NameValueObject` — Serial number
- `features: [Feature]` — Array of device features/capabilities
- `interfaces: [Interface]` — Alexa skill interfaces
- `enablement: String` — `"ENABLED"` or `"DISABLED"`
- `legacyIdentifiers: LegacyIdentifiers` — DMS identifiers
- `deviceAccountId: DeviceAccountId` — Account association
- `creationTime: DateTime` — When device was added

### Feature Property Types

Features are returned with typed `properties` arrays. Each property type has specific state fields:

#### `Brightness`
```graphql
type Brightness {
  name: String
  brightnessStateValue: Int  # 0–100
  timeOfSample: DateTime
  timeOfLastChange: DateTime
  accuracy: Accuracy
  type: PropertyType
  error: ErrorResponse
}
```

#### `Power`
```graphql
type Power {
  name: String
  powerStateValue: PowerStateValue  # "ON" | "OFF"
  timeOfSample: DateTime
  timeOfLastChange: DateTime
  accuracy: Accuracy
  type: PropertyType
  error: ErrorResponse
}
```

#### `ColorTemperature`
```graphql
type ColorTemperature {
  name: String
  colorTemperatureInKelvinStateValue: Int  # 2000–6500
  timeOfSample: DateTime
  timeOfLastChange: DateTime
  accuracy: Accuracy
  type: PropertyType
  error: ErrorResponse
}
```

#### `Reachability`
```graphql
type Reachability {
  name: String
  reachabilityStatusValue: String  # "OK" | "UNREACHABLE"
  timeOfSample: DateTime
  accuracy: Accuracy
  type: PropertyType
  error: ErrorResponse
}
```

### Feature Names

Common feature names returned in `endpoint.features[].name`:

| Feature Name       | Description                          | Property Type       |
| ------------------ | ------------------------------------ | ------------------- |
| `power`            | On/off control                       | `Power`             |
| `brightness`       | Brightness 0–100                     | `Brightness`        |
| `colorTemperature` | Color temp in Kelvin                 | `ColorTemperature`  |
| `connectivity`     | Network reachability                 | `Reachability`      |
| `endpointHealth`   | Device health status                 | Various             |
| `commissionable`   | Matter/Thread commissioning support  | Various             |

## Enums

### `FeatureOperationName`

Operations for `setEndpointFeatures`:

- `turnOn` — Turn device on
- `turnOff` — Turn device off
- `setBrightness` — Set brightness level
- `setColorTemperature` — Set color temperature
- (Additional operations available in schema)

### `PowerStateValue`

- `ON`
- `OFF`

## Response Types

### `SetEndpointFeaturesResponse`

```graphql
type SetEndpointFeaturesResponse {
  featureControlResponses: [FeatureControlResponse]
  errors: [FeatureControlError]
}

type FeatureControlResponse {
  code: String  # "SUCCESS" on success
  endpointId: String
  featureOperationName: String
  __typename: String
}

type FeatureControlError {
  code: String
  message: String
  featureOperationName: String
  __typename: String
}
```

## Implementation Status

### ✅ Implemented in `client.ts`

| Operation                | Method                        | Status |
| ------------------------ | ----------------------------- | ------ |
| Query endpoint features  | `fetchEndpointCapabilities()` | ✅     |
| Query friendly name      | `fetchFriendlyNames()`        | ✅     |
| Get brightness state     | `getEndpointState()`        | ✅     |
| Set power (on/off)       | `graphqlControl()`            | ✅     |
| Set brightness           | `graphqlControl()`            | ✅     |

### 🔜 Not Yet Implemented

| Operation              | Mutation/Query                | Priority |
| ---------------------- | ----------------------------- | -------- |
| Set color temperature  | `setEndpointFeatures`         | High     |
| Set RGB color          | `setEndpointFeatures`         | Medium   |
| Query endpoint list    | `endpoints()`                 | Low      |
| Endpoint settings      | `endpointSettings()`          | Low      |

## Schema Files

- **Full introspection:** `docs/graphql-schema.json` (879 types)
- **This reference:** `docs/graphql-reference.md`

## Notes

- All mutations use `setEndpointFeatures` with different `featureName` and `featureOperationName` values
- Feature properties use GraphQL union types (e.g., `... on Brightness { brightnessStateValue }`)
- Endpoint IDs must be in format `amzn1.alexa.endpoint.{uuid}`
- Batching is supported: send array of operations in single POST request
- The schema is extensive (879 types) — this reference covers only smart home control subset

## See Also

- API.md §5.4 — GraphQL endpoint state and capabilities
- API.md §5.5 — GraphQL control mutations
- DEVICE-CAPABILITIES.md — Device capability discovery
