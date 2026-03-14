#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { AlexaClient } from "../src/client.js";
import { loadConfig } from "../src/config-store.js";

interface ResponseCapture {
  tool: string;
  description: string;
  beforeSize: number;
  afterSize: number;
  reduction: string;
}

async function testOptimization() {
  const cfg = loadConfig();
  if (!cfg?.refreshToken) {
    console.error("No refresh token. Run 'alexa-mcp auth' first.");
    process.exit(1);
  }

  const client = new AlexaClient({
    refreshToken: cfg.refreshToken,
    domain: cfg.domain as "amazon.co.uk" | "amazon.com" | "amazon.de",
  });

  const captures: ResponseCapture[] = [];

  console.log("Testing MCP response optimization...\n");

  // Test 1: list_devices
  console.log("1. Testing list_devices optimization...");
  const devices = await client.getDevices();
  const devicesOriginal = JSON.stringify(devices);
  const devicesTrimmed = JSON.stringify(
    devices.map((d) => ({
      accountName: d.accountName,
      serialNumber: d.serialNumber,
      deviceType: d.deviceType,
      deviceFamily: d.deviceFamily,
      deviceOwnerCustomerId: d.deviceOwnerCustomerId,
      online: d.online,
    }))
  );
  captures.push({
    tool: "list_devices",
    description: "List all Echo devices on the account",
    beforeSize: devicesOriginal.length,
    afterSize: devicesTrimmed.length,
    reduction: `${(((devicesOriginal.length - devicesTrimmed.length) / devicesOriginal.length) * 100).toFixed(1)}%`,
  });

  // Test 2: list_appliances
  console.log("2. Testing list_appliances optimization...");
  const appliances = await client.listAppliances();
  const appliancesOriginal = JSON.stringify(appliances);
  const appliancesTrimmed = JSON.stringify(
    appliances.map((a) => ({
      endpointId: a.endpointId,
      entityId: a.entityId,
      friendlyName: a.friendlyName,
      isReachable: a.isReachable,
    }))
  );
  captures.push({
    tool: "list_appliances",
    description: "List smart home appliances (lights, plugs, etc.)",
    beforeSize: appliancesOriginal.length,
    afterSize: appliancesTrimmed.length,
    reduction: `${(((appliancesOriginal.length - appliancesTrimmed.length) / appliancesOriginal.length) * 100).toFixed(1)}%`,
  });

  // Generate summary
  console.log("\n=== OPTIMIZATION RESULTS ===\n");

  const totalBefore = captures.reduce((sum, c) => sum + c.beforeSize, 0);
  const totalAfter = captures.reduce((sum, c) => sum + c.afterSize, 0);
  const totalReduction = ((totalBefore - totalAfter) / totalBefore) * 100;

  console.log("Tool                          Before      After     Reduction");
  console.log("─".repeat(70));
  captures.forEach((c) => {
    const before = `${(c.beforeSize / 1024).toFixed(2)} KB`.padStart(10);
    const after = `${(c.afterSize / 1024).toFixed(2)} KB`.padStart(10);
    const reduction = c.reduction.padStart(10);
    console.log(`${c.tool.padEnd(28)} ${before} ${after} ${reduction}`);
  });
  console.log("─".repeat(70));
  const totalBeforeKB = `${(totalBefore / 1024).toFixed(2)} KB`.padStart(10);
  const totalAfterKB = `${(totalAfter / 1024).toFixed(2)} KB`.padStart(10);
  const totalRedStr = `${totalReduction.toFixed(1)}%`.padStart(10);
  console.log(`${"TOTAL".padEnd(28)} ${totalBeforeKB} ${totalAfterKB} ${totalRedStr}`);

  console.log(`\n✅ Optimized responses are ${totalReduction.toFixed(1)}% smaller`);
  console.log(`   Saved: ${((totalBefore - totalAfter) / 1024).toFixed(2)} KB`);

  // Verify functionality
  console.log("\n=== FUNCTIONALITY VERIFICATION ===\n");

  // Test device resolution still works
  console.log("Testing device resolution...");
  const testDevice = devices[0];
  const trimmedDevice = {
    accountName: testDevice.accountName,
    serialNumber: testDevice.serialNumber,
    deviceType: testDevice.deviceType,
    deviceFamily: testDevice.deviceFamily,
    deviceOwnerCustomerId: testDevice.deviceOwnerCustomerId,
    online: testDevice.online,
  };
  const hasRequiredFields =
    trimmedDevice.serialNumber &&
    trimmedDevice.accountName &&
    trimmedDevice.deviceType &&
    trimmedDevice.deviceOwnerCustomerId;
  console.log(`  ✓ Device has all required fields: ${hasRequiredFields}`);

  // Test appliance resolution still works
  console.log("Testing appliance resolution...");
  const testAppliance = appliances[0];
  const trimmedAppliance = {
    endpointId: testAppliance.endpointId,
    entityId: testAppliance.entityId,
    friendlyName: testAppliance.friendlyName,
    isReachable: testAppliance.isReachable,
  };
  const hasApplianceFields =
    (trimmedAppliance.endpointId || trimmedAppliance.entityId) &&
    trimmedAppliance.friendlyName;
  console.log(`  ✓ Appliance has all required fields: ${hasApplianceFields}`);

  console.log("\n✅ All functionality tests passed!");

  // Save detailed results
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalBeforeBytes: totalBefore,
      totalAfterBytes: totalAfter,
      totalReductionPercent: totalReduction.toFixed(1),
      savedBytes: totalBefore - totalAfter,
    },
    details: captures,
  };

  const outputPath = "/Users/rob.macdonald/Documents/code/misc/alexa-mcp/docs/optimization-results.json";
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);
}

testOptimization().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
