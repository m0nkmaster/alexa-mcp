# Code Review: alexa-mcp

## Executive Summary

The codebase is generally well-structured with good separation of concerns between `client.ts`, `mcp-tools.ts`, and `auth-flow.ts`. However, there are several areas for improvement around type safety, error handling, and code quality.

---

## Critical Issues

### 1. Type Safety: Excessive `as` Assertions (client.ts)

**Location:** Throughout client.ts, especially in `request<T>()` method

**Problem:** Using `{} as T` and `as unknown` loses type safety and can hide bugs.

```typescript
// Current (line 103)
return {} as T;

// Better:
if (!text.trim()) return undefined; // Let caller handle undefined
```

**Recommendation:** Use proper discriminated unions or optional types instead of casting empty objects.

### 2. Potential GraphQL Injection (client.ts)

**Location:** `graphqlBatchControl()` method (lines 215-251)

**Problem:** Endpoint IDs are interpolated directly into GraphQL strings without sanitization:

```typescript
// Current - vulnerable to injection if endpointId contains quotes
`{endpointId: "${req.endpointId}", ...}`

// Recommendation: Use variables instead of string interpolation
```

### 3. Silent Error Swallowing (client.ts)

**Location:** Multiple catch blocks with empty bodies

```typescript
// Line 136-138
} catch {
  // ignore
}
```

**Problem:** Errors are silently ignored, making debugging difficult.

**Recommendation:** Log errors at minimum verbosity level, or return error information to callers.

---

## High Priority Issues

### 4. Missing Input Validation

**Location:** `mcp-tools.ts` and `client.ts`

**Problem:** Several functions don't validate inputs before use:
- `resolveApplianceByName("")` - empty string could match unintended devices
- `controlAppliancesByPattern("")` - empty pattern returns all devices

**Recommendation:** Add validation for empty/whitespace inputs.

### 5. Duplicate GraphQL Queries

**Location:** `ENDPOINT_FEATURES_QUERY` defined twice (lines 140-154 and in `getBrightnessState`)

**Problem:** Same query defined in multiple places - maintenance burden.

**Recommendation:** Export as constants and reuse.

### 6. Magic Strings for Headers

**Location:** `graphqlHeaders()` method (lines 268-280)

**Problem:** Hardcoded version numbers and marketplace IDs:

```typescript
"x-amzn-build-version": "2.2.706594",
"x-amzn-marketplace-id": "A1F83G8C2ARO7P",
```

**Recommendation:** Move to config or constants file.

---

## Medium Priority Issues

### 7. Inconsistent Error Handling

**Location:** Mix of throwing vs returning error objects

**Problem:** Some methods throw on failure (`throwOnError: true`), others return `{}`.

**Recommendation:** Standardize on a result type pattern.

### 8. Missing JSDoc Comments

**Location:** Most public methods

**Problem:** Only some methods have JSDoc; inconsistent documentation.

### 9. Unused Variables

**Location:** `cli.ts` and others

**Problem:** Some variables declared but unused.

---

## Low Priority / Suggestions

### 10. Consider Using a Proper HTTP Client Wrapper

Currently using raw `undici.fetch` - consider a typed wrapper for better type inference.

### 11. Add Unit Tests for Edge Cases

Current tests focus on happy paths; add tests for:
- Network failures
- Invalid inputs
- Malformed API responses

### 12. Consider Adding Retry Logic

For transient failures (5xx, timeouts), add exponential backoff retry.

---

## Positive Findings

1. **Good separation of concerns** - Client, MCP tools, and auth are well-separated
2. **Batch operations** - GraphQL batching is well-implemented
3. **TypeScript usage** - Mostly good type definitions in interfaces
4. **Error prefixing** - Good practice of adding context to errors

---

## Quick Wins to Implement

1. Input validation for empty strings
2. Use variables in GraphQL instead of string interpolation
3. Add error logging instead of silent catch blocks
4. Export and reuse duplicate GraphQL queries
