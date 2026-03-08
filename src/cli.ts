#!/usr/bin/env node
import { Command } from "commander";
import { loadRefreshToken } from "./auth.js";
import { AlexaClient } from "./client.js";

const program = new Command();

program
  .name("alexa-mcp")
  .description("Alexa device and smart home control CLI")
  .version("0.1.0");

program
  .command("devices")
  .description("List Echo devices")
  .action(async () => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token. Set ALEXA_REFRESH_TOKEN or run alexacli auth.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const devices = await client.getDevices();
    console.log(JSON.stringify(devices, null, 2));
  });

program
  .command("speak <text>")
  .description("Speak text on a device")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .action(async (text: string, opts: { device: string }) => {
    if (!opts.device) {
      console.error("--device is required");
      process.exit(1);
    }
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const d = await client.resolveDevice(opts.device);
    if (!d) {
      console.error(`Device not found: ${opts.device}`);
      process.exit(1);
    }
    await client.speak(
      d.serialNumber,
      d.deviceType,
      d.deviceOwnerCustomerId,
      text
    );
    console.log(`Spoke on ${d.accountName}`);
  });

program
  .command("announce <text>")
  .description("Announce to all devices")
  .action(async (text: string) => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const devices = await client.getDevices();
    if (devices.length === 0) {
      console.error("No devices found");
      process.exit(1);
    }
    await client.announce(devices[0].deviceOwnerCustomerId, text);
    console.log("Announcement sent");
  });

program
  .command("command <text>")
  .description("Send voice command to a device")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .action(async (text: string, opts: { device: string }) => {
    if (!opts.device) {
      console.error("--device is required");
      process.exit(1);
    }
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const d = await client.resolveDevice(opts.device);
    if (!d) {
      console.error(`Device not found: ${opts.device}`);
      process.exit(1);
    }
    await client.command(
      d.serialNumber,
      d.deviceType,
      d.deviceOwnerCustomerId,
      text
    );
    console.log(`Command sent to ${d.accountName}`);
  });

program
  .command("appliances")
  .description("List smart home devices")
  .action(async () => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const appliances = await client.listAppliances();
    console.log(JSON.stringify(appliances, null, 2));
  });

program
  .command("control <entityId> <action>")
  .description("Control smart home device (turnOn, turnOff, setBrightness)")
  .option("-b, --brightness <0-100>", "Brightness for setBrightness", (v) => parseInt(v, 10))
  .action(async (entityId: string, action: string, opts: { brightness?: number }) => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const validActions = ["turnOn", "turnOff", "setBrightness"];
    if (!validActions.includes(action)) {
      console.error(`Action must be one of: ${validActions.join(", ")}`);
      process.exit(1);
    }
    if (action === "setBrightness" && opts.brightness === undefined) {
      console.error("--brightness required for setBrightness");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    await client.controlAppliance(
      entityId,
      action as "turnOn" | "turnOff" | "setBrightness",
      opts.brightness
    );
    console.log(`Done: ${action} ${entityId}`);
  });

program
  .command("routines")
  .description("List routines")
  .action(async () => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const routines = await client.listRoutines();
    console.log(JSON.stringify(routines, null, 2));
  });

program
  .command("run <automationId>")
  .description("Run a routine by automation ID")
  .action(async (automationId: string) => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: token });
    const routines = await client.listRoutines();
    const r = routines.find((x) => x.automationId === automationId);
    if (!r || !r.sequence) {
      console.error(`Routine not found: ${automationId}`);
      process.exit(1);
    }
    await client.runRoutine(r.automationId, JSON.stringify(r.sequence));
    console.log(`Ran routine: ${r.name}`);
  });

program.parse();
