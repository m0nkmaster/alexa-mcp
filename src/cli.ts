#!/usr/bin/env node
import { Command } from "commander";
import { loadRefreshToken } from "./auth.js";
import { AlexaClient } from "./client.js";
import {
  loadConfig,
  saveConfig,
  deleteConfig,
  getConfigPath,
} from "./config-store.js";
import { runBrowserAuth } from "./auth-flow.js";

const program = new Command();

program
  .name("alexa-mcp")
  .description("Alexa device and smart home control CLI")
  .version("0.1.0");

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
  .action(async () => {
    const token = loadRefreshToken();
    if (!token) {
      console.error("No refresh token. Set ALEXA_REFRESH_TOKEN or run 'alexa-mcp auth'.");
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
  .command("switch <name> <state>")
  .description("Turn smart home device on/off by name (uses voice command; works when appliances list is empty)")
  .option("-d, --device <echo>", "Echo to send the command through (required)", "")
  .action(async (name: string, state: string, opts: { device: string }) => {
    if (!opts.device) {
      console.error("--device is required (Echo device name or serial)");
      process.exit(1);
    }
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      console.error("State must be 'on' or 'off'");
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
    const text = s === "on" ? `turn on ${name}` : `turn off ${name}`;
    await client.command(
      d.serialNumber,
      d.deviceType,
      d.deviceOwnerCustomerId,
      text
    );
    console.log(`Sent "${text}" via ${d.accountName}`);
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
  .description("Show now-playing state for a device (EU/UK)")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .action(async (opts: { device: string }) => {
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
    const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
    console.log(JSON.stringify({ device: d.accountName, ...state }, null, 2));
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
