#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { AlexaClient } from "./client.js";
import {
  loadConfig,
  saveConfig,
  deleteConfig,
  getConfigPath,
} from "./config-store.js";
import { runBrowserAuth } from "./auth-flow.js";

const program = new Command();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
) as { version?: string };

function getAuthConfig(): { refreshToken: string; domain: "amazon.co.uk" | "amazon.com" | "amazon.de" } | null {
  const cfg = loadConfig();
  if (!cfg?.refreshToken) return null;
  return {
    refreshToken: cfg.refreshToken,
    domain: cfg.domain as "amazon.co.uk" | "amazon.com" | "amazon.de",
  };
}

program
  .name("alexa-mcp")
  .description("Alexa device and smart home control CLI")
  .version(pkg.version ?? "0.1.0");

const authCmd = program
  .command("auth")
  .description("Authenticate with Amazon Alexa (opens browser or tunnel URL)");

authCmd
  .option("-t, --token <token>", "Use this refresh token (headless)")
  .option("-f, --token-file <path>", "Read token from file")
  .option(
    "-d, --domain <domain>",
    "Amazon domain (amazon.com, amazon.co.uk, amazon.de)",
    "amazon.co.uk"
  )
  .option("--no-save", "Validate token only; don't save to config")
  .action(async (opts: {
    token?: string;
    tokenFile?: string;
    domain: string;
    save: boolean;
  }) => {
    let token = opts.token;
    if (opts.tokenFile) {
      const fs = await import("node:fs");
      token = fs.readFileSync(opts.tokenFile, "utf-8").trim();
    }
    const domain = (opts.domain || "amazon.co.uk") as "amazon.co.uk" | "amazon.com" | "amazon.de";
    if (token) {
      const client = new AlexaClient({ refreshToken: token, domain });
      const devices = await client.getDevices();
      console.error(`Valid. Found ${devices.length} devices.`);
      if (opts.save) {
        saveConfig({ refreshToken: token, domain });
        console.error(`Saved to ${getConfigPath()}`);
      }
      return;
    }
    const result = await runBrowserAuth(domain);
    const client = new AlexaClient({
        refreshToken: result.refreshToken,
        domain: result.domain as "amazon.co.uk" | "amazon.com" | "amazon.de",
      });
    const devices = await client.getDevices();
    if (opts.save) {
      saveConfig({
          refreshToken: result.refreshToken,
          domain: result.domain as "amazon.co.uk" | "amazon.com" | "amazon.de",
        });
      console.error(`Saved to ${getConfigPath()}`);
    }
    console.error(`Authenticated. Found ${devices.length} devices.`);
  });

authCmd
  .command("status")
  .description("Show authentication status")
  .option("-v, --verify", "Verify token by calling API")
  .action(async (opts: { verify?: boolean }) => {
    const cfg = loadConfig();
    if (!cfg) {
      console.log("Not configured. Run 'alexa-mcp auth' to authenticate.");
      return;
    }
    const masked = cfg.refreshToken.length > 8 ? cfg.refreshToken.slice(0, 8) + "..." : cfg.refreshToken;
    console.log(`Domain: ${cfg.domain}`);
    console.log(`Token: ${masked}`);
    if (opts.verify) {
      try {
        const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
        const devices = await client.getDevices();
        console.log(`Status: valid (${devices.length} devices)`);
        const ownerIds = [...new Set(devices.map((d) => d.deviceOwnerCustomerId).filter(Boolean))];
        if (ownerIds.length > 0) {
          console.log(`Account (deviceOwnerCustomerId): ${ownerIds.join(", ")}`);
          console.log("Use this same account for smart home control. Compare with device/appliance owner IDs.");
        }
      } catch (e) {
        console.log(`Status: invalid (${e})`);
        process.exit(1);
      }
    }
    console.log(`Config: ${getConfigPath()}`);
  });

authCmd
  .command("logout")
  .description("Remove stored credentials")
  .action(() => {
    if (deleteConfig()) {
      console.log("Credentials removed.");
    } else {
      console.log("No credentials found.");
    }
  });

program
  .command("devices")
  .description("List Echo devices")
  .option("-o, --owners", "Show only device names and owner customer IDs (for profile matching)")
  .action(async (opts: { owners?: boolean }) => {
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token. Set ALEXA_REFRESH_TOKEN or run 'alexa-mcp auth'.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const devices = await client.getDevices();
    if (opts.owners) {
      for (const d of devices) {
        console.log(`${d.accountName}\t${d.deviceOwnerCustomerId}`);
      }
      console.log("\nMatch deviceOwnerCustomerId with the account you use for 'alexa-mcp auth'.");
      return;
    }
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
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
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
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
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
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
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
  .command("switch-group <group> <state>")
  .description("Turn on/off all lights in a room group (e.g. Kitchen, Living room). Uses group membership from Alexa app.")
  .option("--all", "Control all appliances in group, not just lights", false)
  .action(async (group: string, state: string, opts: { all?: boolean }) => {
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      console.error("State must be 'on' or 'off'");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    try {
      const { controlled, errors } = await client.controlAppliancesByGroup(group, action, {
        lightsOnly: !opts.all,
      });
      if (controlled.length > 0) {
        console.log(`${action}: ${controlled.join(", ")}`);
      }
      if (errors.length > 0) {
        console.error(errors.join("\n"));
      }
      if (controlled.length === 0 && errors.length === 0) {
        console.error(`No lights in group "${group}". Try 'alexa-mcp groups' to see groups.`);
        process.exit(1);
      }
    } catch (e) {
      console.error(String(e));
      process.exit(1);
    }
  });

program
  .command("switch-room <pattern> <state>")
  .description(
    "Turn on/off all smart home devices matching a pattern (e.g. 'kitchen lights', 'living room'). Uses direct control—avoids profile issues."
  )
  .action(async (pattern: string, state: string) => {
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      console.error("State must be 'on' or 'off'");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    const { controlled, errors } = await client.controlAppliancesByPattern(pattern, action);
    if (controlled.length > 0) {
      console.log(`${action}: ${controlled.join(", ")}`);
    }
    if (errors.length > 0) {
      console.error(errors.join("\n"));
    }
    if (controlled.length === 0 && errors.length === 0) {
      console.error(`No devices matched "${pattern}". Try 'alexa-mcp appliances' to see names.`);
      process.exit(1);
    }
  });

program
  .command("switch <name> <state>")
  .description(
    "Turn single smart home device on/off by name. For room/pattern (e.g. 'kitchen lights'), use switch-room instead."
  )
  .option("-d, --device <echo>", "Echo for voice fallback when direct control fails", "")
  .action(async (name: string, state: string, opts: { device: string }) => {
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      console.error("State must be 'on' or 'off'");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    const app = await client.resolveApplianceByName(name);
    if (app?.endpointId) {
      await client.controlAppliance(app.endpointId, action);
      console.log(`Done: ${action} ${app.friendlyName} (direct control)`);
      return;
    }
    if (!opts.device) {
      console.error(
        `Could not resolve "${name}". Try 'alexa-mcp appliances' to see names. Use -d <Echo> for voice fallback.`
      );
      process.exit(1);
    }
    const d = await client.resolveDevice(opts.device);
    if (!d) {
      console.error(`Device not found: ${opts.device}`);
      process.exit(1);
    }
    const text = s === "on" ? `turn on ${name}` : `turn off ${name}`;
    await client.command(d.serialNumber, d.deviceType, d.deviceOwnerCustomerId, text);
    console.log(`Sent "${text}" via ${d.accountName} (voice fallback)`);
  });

program
  .command("groups")
  .description("List room/space groups (Kitchen, Living room, etc.)")
  .action(async () => {
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const groups = await client.listDeviceGroups();
    console.log(JSON.stringify(groups, null, 2));
  });

program
  .command("appliances")
  .description("List smart home devices")
  .action(async () => {
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const appliances = await client.listAppliances();
    console.log(JSON.stringify(appliances, null, 2));
  });

program
  .command("control <entityId> <action>")
  .description("Control smart home device (turnOn, turnOff, setBrightness)")
  .option("-b, --brightness <0-100>", "Brightness for setBrightness", (v) => parseInt(v, 10))
  .action(async (entityId: string, action: string, opts: { brightness?: number }) => {
    const cfg = getAuthConfig();
    if (!cfg) {
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
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
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
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const routines = await client.listRoutines();
    console.log(JSON.stringify(routines, null, 2));
  });

program
  .command("run <automationId>")
  .description("Run a routine by automation ID")
  .action(async (automationId: string) => {
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const routines = await client.listRoutines();
    const r = routines.find((x) => x.automationId === automationId);
    if (!r) {
      console.error(`Routine not found: ${automationId}`);
      process.exit(1);
    }
    const sequenceJson = r.sequence != null ? JSON.stringify(r.sequence) : undefined;
    await client.runRoutine(r.automationId, sequenceJson);
    console.log(`Ran routine: ${r.name}`);
  });

program
  .command("now-playing")
  .description("Show now-playing state for a device (track, artist, album, state, volume)")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .action(async (opts: { device: string }) => {
    if (!opts.device) {
      console.error("--device is required");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await client.resolveDevice(opts.device);
    if (!d) {
      console.error(`Device not found: ${opts.device}`);
      process.exit(1);
    }
    const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
    console.log(JSON.stringify({ device: d.accountName, ...state }, null, 2));
  });

program
  .command("volume")
  .description("Get or set speaker volume (0–100) on an Echo device")
  .argument("[level]", "Volume level 0–100 (omit to get current volume)", "")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .action(async (level: string, opts: { device: string }) => {
    if (!opts.device) {
      console.error("--device is required");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await client.resolveDevice(opts.device);
    if (!d) {
      console.error(`Device not found: ${opts.device}`);
      process.exit(1);
    }
    if (!level) {
      const vol = await client.getVolume(d.deviceType, d.serialNumber);
      console.log(JSON.stringify({ device: d.accountName, ...vol }, null, 2));
      return;
    }
    const v = parseInt(level, 10);
    if (isNaN(v) || v < 0 || v > 100) {
      console.error("Volume must be a number between 0 and 100");
      process.exit(1);
    }
    await client.setVolume(d.deviceType, d.serialNumber, v);
    console.log(`Volume set to ${v} on ${d.accountName}`);
  });

program
  .command("brightness")
  .description("Get or set brightness (0–100) on a smart home light by name")
  .argument("[level]", "Brightness level 0–100 (omit to get current brightness)", "")
  .option("-n, --name <name>", "Light device friendly name (required)", "")
  .action(async (level: string, opts: { name: string }) => {
    if (!opts.name) {
      console.error("--name is required (e.g. --name 'Lounge lamp')");
      process.exit(1);
    }
    const cfg = getAuthConfig();
    if (!cfg) {
      console.error("No refresh token.");
      process.exit(1);
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const app = await client.resolveApplianceByName(opts.name);
    if (!app) {
      console.error(`Device not found: "${opts.name}". Try 'alexa-mcp appliances' to see names.`);
      process.exit(1);
    }
    const eid = app.endpointId ?? app.entityId;
    if (!eid) {
      console.error(`No controllable endpoint for "${opts.name}"`);
      process.exit(1);
    }
    if (!level) {
      const state = await client.getBrightnessState(eid);
      console.log(JSON.stringify({ device: app.friendlyName, endpointId: eid, ...state }, null, 2));
      return;
    }
    const b = parseInt(level, 10);
    if (isNaN(b) || b < 0 || b > 100) {
      console.error("Brightness must be a number between 0 and 100");
      process.exit(1);
    }
    await client.controlAppliance(eid, "setBrightness", b);
    console.log(`Brightness set to ${b}% on ${app.friendlyName}`);
  });

const mediaCmd = program
  .command("media <command>")
  .description("Transport control: play, pause, resume, stop, next, previous (EU/UK)")
  .option("-d, --device <name>", "Device name or serial (required)", "");

const mediaCommands = ["play", "pause", "resume", "stop", "next", "previous"];

mediaCmd.action(async (command: string, opts: { device: string }) => {
  if (!opts.device) {
    console.error("--device is required");
    process.exit(1);
  }
  const c = command.toLowerCase();
  if (!mediaCommands.includes(c)) {
    console.error(`Command must be one of: ${mediaCommands.join(", ")}`);
    process.exit(1);
  }
  const cfg = getAuthConfig();
  if (!cfg) {
    console.error("No refresh token.");
    process.exit(1);
  }
  const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
  const d = await client.resolveDevice(opts.device);
  if (!d) {
    console.error(`Device not found: ${opts.device}`);
    process.exit(1);
  }
  const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
  const taskSessionId = state?.taskSessionId;
  if (!taskSessionId) {
    console.error(`No active playback on ${d.accountName}. Start something first (e.g. "Alexa, play jazz").`);
    process.exit(1);
  }
  await client.controlMediaSession(d, taskSessionId, c as "play" | "pause" | "resume" | "stop" | "next" | "previous");
  console.log(`${command} sent to ${d.accountName}`);
});

program.parse();
