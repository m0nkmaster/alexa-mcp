# alexa-mcp — Improvement Proposals

*Based on real-world use as a headless AI agent controlling a UK ~50-device smart home via CLI.*

---

## 1. Return Device State After Every Control Action + `status` Command

**Current:** `alexa-mcp switch 'Kitchen spot 1' off` returns nothing. Success/failure is silent. To verify, I must call `alexa-mcp appliances` separately and parse the full JSON.

**Problem:** As an AI agent, I can't confirm whether an action actually worked without a second API call. This creates a gap — I might report "kitchen lights are off" when the device didn't respond.

**Requirements:**

a) **All control commands return device state by default.** No `--verify` flag needed — it should just happen:
```bash
alexa-mcp switch 'Kitchen spot 1' off
# Returns (JSON): {"friendlyName": "Kitchen spot 1", "power": "off", "isReachable": true}
```

b) **Add a dedicated `status` command** for single-device lookup without issuing a control action:
```bash
alexa-mcp status 'Kitchen spot 1'
# Returns: {"friendlyName": "Kitchen spot 1", "power": "on", "brightness": 80, "colorTemp": 3000, "isReachable": true}
```

---

## 2. Query Group Membership

**Current:** `alexa-mcp groups` returns group names, but I can't query which devices belong to a group without inferring from `switch-room` pattern matches.

**Problem:** After doing `switch-group "Kitchen" off`, I can't verify which devices were affected because I don't know the membership.

**Proposals:**

a) **`alexa-mcp group-members "Kitchen"`** — list all devices in a named group.

b) **Add grouping info to `alexa-mcp appliances` output** — each appliance includes a `"groups": ["Kitchen"]` array.

This would make post-action verification of group commands reliable rather than guesswork.

---

## 3. Better Duplicate Disambiguation

**Current:** Two devices called "Landing lamp" appear in the same appliances list. Pattern matching with `switch-room 'landing'` might toggle one or both unpredictably.

**Proposal:** Append a short unique discriminator (last 4 chars of the endpointId) to every device name in output — e.g. `Landing lamp …e4bc`. Consistent across all commands, not just duplicates.

---

## 4. Routine Lookup by Name

**Current:** `alexa-mcp routines` returns automationIds but I haven't seen friendly names. To run a routine, I need the ID, which means I need to have recorded it beforehand.

**Proposals:**

a) Include `"name": "our bedtime"` alongside each automationId in the routines list.

b) Add **`alexa-mcp run --name "our bedtime"`** — resolve name to ID internally.

c) Add **`alexa-mcp run --partial "bedtime"`** — fuzzy-match and confirm if multiple results.

---

## 5. Batch Control Verification

**Current:** `alexa-mcp batch-control turnOff e1 e2 e3` fires commands in parallel but returns minimal output. I don't know which individual devices in the batch actually responded.

**Proposal:** Return a per-device result map:
```json
{
  "amzn1.alexa.endpoint.e1": {"friendlyName": "Kitchen spot 1", "success": true, "power": "off", "isReachable": true},
  "amzn1.alexa.endpoint.e2": {"friendlyName": "Kitchen spot 2", "success": false, "error": "unreachable"},
  "amzn1.alexa.endpoint.e3": {"friendlyName": "Kitchen spot 3", "success": true, "power": "off", "isReachable": true}
}
```

---

## 6. Fuzzy Matching for `switch-room` / Pattern Commands

**Current:** `switch-room 'kitchen lights'` may not match devices named "Kitchen spot 1-6" because the pattern matcher is too strict.

**Observed:** `'kitchen'` works, `'kitchen lights'` doesn't match any device with "Kitchen" in its name. Non-obvious and caused failed commands.

**Proposal:** Implement fuzzy/substring matching (case-insensitive) so `'kitchen lights'`, `'lounge lamp'`, `'bedroom'` all match any device whose name contains those terms.

---

## 8. JSON Default + `--pretty` for Human Readable

**Current:** Output format is inconsistent — some commands return JSON, others formatted text. For programmatic use, consistency is essential.

**Requirements:**
- **All commands output JSON by default.** No command should return nothing.
- **Add `--pretty` flag** for a minimal, formatted human-readable output.
- Machine-consumable output first, readability optional.

---

## 10. Device Type Filtering

**Current:** `alexa-mcp appliances` returns everything — bulbs, plugs, cameras, Echo devices, Fire TVs, routines, skills, printer. Lots of noise when I just want lights.

**Proposal:**
```bash
alexa-mcp appliances --type light
alexa-mcp appliances --type switch
alexa-mcp appliances --type sensor
alexa-mcp appliances --type camera
```
Filter by capability or device category at query time. Makes verification faster (less JSON to parse) and reduces API overhead.

---

## Summary Priority

| Priority | Proposal | Status |
|----------|----------|--------|
| 🔴 P0 | Return state from all control commands + `status` command | **Required** |
| 🟠 P1 | Group membership query | **Required** |
| 🟠 P1 | Endpoint suffix on all device names | **Required** |
| 🟠 P1 | Routine lookup by name | **Required** |
| 🟡 P2 | Batch control verification | **Required** |
| 🟡 P2 | Fuzzy pattern matching | **Required** |
| 🟡 P2 | JSON default + `--pretty` | **Required** |
| 🟢 P3 | Device type filtering | **Required** |
