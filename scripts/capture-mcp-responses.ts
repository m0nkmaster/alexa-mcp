#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { AlexaClient } from "../src/client.js";
import { loadConfig } from "../src/config-store.js";

interface ResponseCapture {
  tool: string;
  description: string;
  responseSize: number;
  response: unknown;
}

async function captureResponses() {
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

  console.log("Capturing MCP tool responses...\n");

  // 1. list_devices
  console.log("1. Capturing list_devices...");
  const devices = await client.getDevices();
  captures.push({
    tool: "list_devices",
    description: "List all Echo devices on the account",
    responseSize: JSON.stringify(devices).length,
    response: devices,
  });

  // 2. list_appliances
  console.log("2. Capturing list_appliances...");
  const appliances = await client.listAppliances();
  captures.push({
    tool: "list_appliances",
    description: "List smart home appliances (lights, plugs, etc.)",
    responseSize: JSON.stringify(appliances).length,
    response: appliances,
  });

  // 3. list_device_groups
  console.log("3. Capturing list_device_groups...");
  const groups = await client.listDeviceGroups();
  captures.push({
    tool: "list_device_groups",
    description: "List room/space groups (Living room, Kitchen, etc.)",
    responseSize: JSON.stringify(groups).length,
    response: groups,
  });

  // 4. list_audio_groups
  console.log("4. Capturing list_audio_groups...");
  const audioGroups = await client.listAudioGroups();
  captures.push({
    tool: "list_audio_groups",
    description: "List multi-room audio groups (Downstairs, Everywhere, etc.)",
    responseSize: JSON.stringify(audioGroups).length,
    response: audioGroups,
  });

  // 5. list_routines
  console.log("5. Capturing list_routines...");
  const routines = await client.listRoutines();
  captures.push({
    tool: "list_routines",
    description: "List Alexa routines",
    responseSize: JSON.stringify(routines).length,
    response: routines,
  });

  // 6. auth_status
  console.log("6. Capturing auth_status...");
  const authStatus = {
    configured: true,
    deviceCount: devices.length,
  };
  captures.push({
    tool: "auth_status",
    description: "Check Alexa authentication status",
    responseSize: JSON.stringify(authStatus).length,
    response: authStatus,
  });

  // 7. get_volume (if we have a device)
  if (devices.length > 0) {
    console.log("7. Capturing get_volume...");
    try {
      const vol = await client.getVolume(devices[0].deviceType, devices[0].serialNumber);
      captures.push({
        tool: "get_volume",
        description: "Get the current speaker volume (0–100) for an Echo device",
        responseSize: JSON.stringify(vol).length,
        response: vol,
      });
    } catch (e) {
      console.log(`   Skipped get_volume: ${e}`);
    }
  }

  // 8. now_playing (if we have a device)
  if (devices.length > 0) {
    console.log("8. Capturing now_playing...");
    try {
      const nowPlaying = await client.getNowPlaying(devices[0].serialNumber, devices[0].deviceType);
      captures.push({
        tool: "now_playing",
        description: "Get now-playing state for an Echo device",
        responseSize: JSON.stringify(nowPlaying).length,
        response: nowPlaying,
      });
    } catch (e) {
      console.log(`   Skipped now_playing: ${e}`);
    }
  }

  // 9. get_brightness_by_name (if we have an appliance)
  if (appliances.length > 0) {
    console.log("9. Capturing get_brightness_by_name...");
    const lightAppliance = appliances.find((a) =>
      a.friendlyName?.toLowerCase().includes("light") ||
      a.friendlyName?.toLowerCase().includes("lamp") ||
      a.friendlyName?.toLowerCase().includes("bulb")
    );
    if (lightAppliance?.endpointId) {
      try {
        const brightness = await client.getBrightnessState(lightAppliance.endpointId);
        captures.push({
          tool: "get_brightness_by_name",
          description: "Get the current brightness and power state of a smart home light",
          responseSize: JSON.stringify(brightness).length,
          response: brightness,
        });
      } catch (e) {
        console.log(`   Skipped get_brightness_by_name: ${e}`);
      }
    }
  }

  // Generate summary
  console.log("\n=== SUMMARY ===\n");
  const summary = {
    totalTools: captures.length,
    totalSize: captures.reduce((sum, c) => sum + c.responseSize, 0),
    tools: captures.map((c) => ({
      tool: c.tool,
      description: c.description,
      sizeBytes: c.responseSize,
      sizeKB: (c.responseSize / 1024).toFixed(2),
    })),
  };

  console.log(`Total tools captured: ${summary.totalTools}`);
  console.log(`Total response size: ${(summary.totalSize / 1024).toFixed(2)} KB\n`);

  summary.tools.forEach((t) => {
    console.log(`${t.tool.padEnd(30)} ${t.sizeKB.padStart(8)} KB`);
  });

  // Save to file
  const output = {
    capturedAt: new Date().toISOString(),
    summary,
    responses: captures,
  };

  const outputPath = "/Users/rob.macdonald/Documents/code/misc/alexa-mcp/docs/mcp-response-analysis.json";
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nFull responses saved to: ${outputPath}`);
}

captureResponses().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
