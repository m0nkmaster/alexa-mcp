#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { AlexaClient, AmbiguousMatchError } from "./client.js";
import {
  loadConfig,
  saveConfig,
  deleteConfig,
  getConfigPath,
} from "./config-store.js";
import { runBrowserAuth } from "./auth-flow.js";
import { controlExitCode, controlResultFlags } from "./match.js";
import { emitError, emitResult, wantsJson } from "./cli-output.js";

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

function requireAuth(json?: boolean): { refreshToken: string; domain: "amazon.co.uk" | "amazon.com" | "amazon.de" } {
  const cfg = getAuthConfig();
  if (!cfg) {
    emitError({ error: "No refresh token. Set ALEXA_REFRESH_TOKEN or run 'alexa-mcp auth'." }, 1, { json });
  }
  return cfg;
}

function handleMatchError(e: unknown, json?: boolean): never {
  if (e instanceof AmbiguousMatchError) {
    emitError(
      {
        error: e.message,
        query: e.query,
        suggestions: e.suggestions,
      },
      1,
      { json }
    );
  }
  throw e;
}

async function resolveDeviceOrExit(
  client: AlexaClient,
  query: string,
  json?: boolean
) {
  try {
    const d = await client.resolveDevice(query);
    if (!d) {
      emitError({ error: `Device not found: ${query}` }, 1, { json });
    }
    return d;
  } catch (e) {
    handleMatchError(e, json);
  }
}

async function resolveApplianceOrExit(
  client: AlexaClient,
  name: string,
  json?: boolean
) {
  try {
    const app = await client.resolveApplianceByName(name);
    if (!app) {
      emitError(
        { error: `Device not found: "${name}". Try 'alexa-mcp appliances' to see names.` },
        1,
        { json }
      );
    }
    return app;
  } catch (e) {
    handleMatchError(e, json);
  }
}

program
  .name("alexa-mcp")
  .description("Alexa device and smart home control CLI")
  .version(pkg.version ?? "0.1.0")
  .option("--json", "Output structured JSON where applicable");

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
  .option("--json", "Output as JSON")
  .action(async (opts: { verify?: boolean; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const cfg = loadConfig();
    if (!cfg) {
      if (json) {
        console.log(JSON.stringify({ configured: false }, null, 2));
      } else {
        console.log("Not configured. Run 'alexa-mcp auth' to authenticate.");
      }
      return;
    }
    const masked = cfg.refreshToken.length > 8 ? cfg.refreshToken.slice(0, 8) + "..." : cfg.refreshToken;
    if (!opts.verify) {
      emitResult(
        { configured: true, domain: cfg.domain, token: masked, config: getConfigPath() },
        { json },
        `Domain: ${cfg.domain}\nToken: ${masked}\nConfig: ${getConfigPath()}`
      );
      return;
    }
    try {
      const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
      const devices = await client.getDevices();
      const ownerIds = [...new Set(devices.map((d) => d.deviceOwnerCustomerId).filter(Boolean))];
      emitResult(
        {
          configured: true,
          domain: cfg.domain,
          token: masked,
          valid: true,
          deviceCount: devices.length,
          ownerIds,
          config: getConfigPath(),
        },
        { json },
        [
          `Domain: ${cfg.domain}`,
          `Token: ${masked}`,
          `Status: valid (${devices.length} devices)`,
          ownerIds.length > 0
            ? `Account (deviceOwnerCustomerId): ${ownerIds.join(", ")}\nUse this same account for smart home control. Compare with device/appliance owner IDs.`
            : undefined,
          `Config: ${getConfigPath()}`,
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (e) {
      emitError({ error: `Status: invalid (${e})`, domain: cfg.domain }, 1, { json });
    }
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
  .option("--json", "Output as JSON")
  .action(async (opts: { owners?: boolean; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const devices = await client.getDevices();
    if (opts.owners && !json) {
      for (const d of devices) {
        console.log(`${d.accountName}\t${d.deviceOwnerCustomerId}`);
      }
      console.log("\nMatch deviceOwnerCustomerId with the account you use for 'alexa-mcp auth'.");
      return;
    }
    console.log(JSON.stringify(devices, null, 2));
  });

program
  .command("speak")
  .description("Speak text on a single Echo device (use announce to broadcast to all devices)")
  .argument("[text]", "Text to speak (or use --text)")
  .option("-t, --text <text>", "Text to speak (alternative to positional argument)")
  .option("-d, --device <name>", "Device name or serial (required)")
  .option("--json", "Output as JSON")
  .action(async (textArg: string | undefined, opts: { text?: string; device?: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const text = (opts.text ?? textArg ?? "").trim();
    if (!text) {
      emitError({ error: "Provide text as a positional argument or --text <text>" }, 1, { json });
    }
    if (!opts.device) {
      emitError({ error: "--device is required" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await resolveDeviceOrExit(client, opts.device, json);
    await client.speak(d.serialNumber, d.deviceType, d.deviceOwnerCustomerId, text);
    emitResult(
      { success: true, action: "speak", device: d.accountName, text },
      { json },
      `Spoke on ${d.accountName}`
    );
  });

program
  .command("announce")
  .description(
    "Broadcast an announcement to ALL Echo devices on the account (AlexaAnnouncement). Not device-specific — for one-device speech use: alexa-mcp speak --text <text> --device <name>"
  )
  .argument("[text]", "Announcement text (or use --text)")
  .option("-t, --text <text>", "Announcement text (alternative to positional argument)")
  .option(
    "-d, --device <name>",
    "Not supported — announce always broadcasts to all devices; use speak for one device"
  )
  .option("--json", "Output as JSON")
  .action(async (textArg: string | undefined, opts: { text?: string; device?: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const text = (opts.text ?? textArg ?? "").trim();
    if (!text) {
      emitError({ error: "Provide text as a positional argument or --text <text>" }, 1, { json });
    }
    if (opts.device) {
      emitError(
        {
          error:
            "announce broadcasts to ALL devices; targeted AlexaAnnouncement is not supported. Use speak for one-device speech: alexa-mcp speak --text <text> --device <name>",
          hint: "alexa-mcp speak --text <text> --device <name>",
        },
        1,
        { json }
      );
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const devices = await client.getDevices();
    if (devices.length === 0) {
      emitError({ error: "No devices found" }, 1, { json });
    }
    await client.announce(devices[0].deviceOwnerCustomerId, text);
    emitResult(
      {
        success: true,
        action: "announce",
        scope: "all_devices",
        text,
        message: "Announcement broadcast to all Echo devices on the account",
      },
      { json },
      "Announcement broadcast to all Echo devices"
    );
  });

program
  .command("command")
  .description("Send voice command to a device")
  .argument("[text]", "Command text (or use --text)")
  .option("-t, --text <text>", "Command text (alternative to positional argument)")
  .option("-d, --device <name>", "Device name or serial (required)")
  .option("--json", "Output as JSON")
  .action(async (textArg: string | undefined, opts: { text?: string; device?: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const text = (opts.text ?? textArg ?? "").trim();
    if (!text) {
      emitError({ error: "Provide text as a positional argument or --text <text>" }, 1, { json });
    }
    if (!opts.device) {
      emitError({ error: "--device is required" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await resolveDeviceOrExit(client, opts.device, json);
    await client.command(d.serialNumber, d.deviceType, d.deviceOwnerCustomerId, text);
    emitResult(
      { success: true, action: "command", device: d.accountName, text },
      { json },
      `Command sent to ${d.accountName}`
    );
  });

program
  .command("switch-group <group> <state>")
  .description(
    "Turn on/off lights in a room group (e.g. Kitchen). Skips unresolved group members by default. Returns JSON {action, group, controlled, errors, unresolved, success, partial}."
  )
  .option("--all", "Control all appliances in group, not just lights", false)
  .option(
    "--include-unresolved",
    "Also attempt control on unresolved/stale group endpoint IDs",
    false
  )
  .option("--dry-run", "Show planned targets (name + endpointId) without controlling", false)
  .option("--json", "Output as JSON (default for this command)")
  .action(async (
    group: string,
    state: string,
    opts: { all?: boolean; includeUnresolved?: boolean; dryRun?: boolean; json?: boolean }
  ) => {
    const json = wantsJson(opts, program.opts().json);
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      emitError({ error: "State must be 'on' or 'off'" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    try {
      const result = await client.controlAppliancesByGroup(group, action, {
        lightsOnly: !opts.all,
        includeUnresolved: opts.includeUnresolved,
        dryRun: opts.dryRun,
      });
      const payload = {
        action,
        group,
        dryRun: Boolean(opts.dryRun),
        controlled: result.controlled,
        errors: result.errors,
        unresolved: result.unresolved,
        ...(result.planned ? { planned: result.planned } : {}),
        success: opts.dryRun
          ? (result.planned?.length ?? 0) > 0
          : result.success,
        partial: result.partial,
      };
      console.log(JSON.stringify(payload, null, 2));
      if (opts.dryRun) {
        if ((result.planned?.length ?? 0) === 0) process.exit(1);
        return;
      }
      if (result.controlled.length === 0 && result.errors.length === 0) {
        console.error(
          JSON.stringify({
            error: `No lights in group "${group}". Try 'alexa-mcp groups' to see groups.`,
          })
        );
        process.exit(1);
      }
      process.exitCode = controlExitCode(result.controlled.length, result.errors.length);
    } catch (e) {
      try {
        handleMatchError(e, true);
      } catch {
        emitError({ error: String(e) }, 1, { json: true });
      }
    }
  });

program
  .command("switch-room <pattern> <state>")
  .description(
    "Turn on/off smart home devices matching a pattern (e.g. 'kitchen lights'). Tries all-word match first; falls back to any-word. Returns JSON {action, pattern, controlled, errors, success, partial}."
  )
  .option("--dry-run", "Show planned targets (name + endpointId) without controlling", false)
  .option("--json", "Output as JSON (default for this command)")
  .action(async (pattern: string, state: string, opts: { dryRun?: boolean; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      emitError({ error: "State must be 'on' or 'off'" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    const result = await client.controlAppliancesByPattern(pattern, action, {
      dryRun: opts.dryRun,
    });
    const payload = {
      action,
      pattern,
      dryRun: Boolean(opts.dryRun),
      controlled: result.controlled,
      errors: result.errors,
      ...(result.planned ? { planned: result.planned } : {}),
      success: opts.dryRun
        ? (result.planned?.length ?? 0) > 0 && result.errors.length === 0
        : result.success,
      partial: result.partial,
    };
    console.log(JSON.stringify(payload, null, 2));
    if (opts.dryRun) {
      if ((result.planned?.length ?? 0) === 0) process.exit(1);
      return;
    }
    if (result.controlled.length === 0 && result.errors.length === 0) {
      console.error(
        JSON.stringify({
          error: `No devices matched "${pattern}". Try 'alexa-mcp appliances' to see names.`,
        })
      );
      process.exit(1);
    }
    process.exitCode = controlExitCode(result.controlled.length, result.errors.length);
  });

program
  .command("switch <name> <state>")
  .description(
    "Turn single smart home device on/off by name. Returns live device state JSON after applying. For room/pattern (e.g. 'kitchen lights'), use switch-room instead."
  )
  .option("-d, --device <echo>", "Echo for voice fallback when direct control fails", "")
  .option("--json", "Output as JSON (default for this command)")
  .action(async (name: string, state: string, opts: { device: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const s = state.toLowerCase();
    if (s !== "on" && s !== "off") {
      emitError({ error: "State must be 'on' or 'off'" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const action = s === "on" ? "turnOn" : "turnOff";
    let app;
    try {
      app = await client.resolveApplianceByName(name);
    } catch (e) {
      handleMatchError(e, true);
    }
    if (app?.endpointId) {
      try {
        await client.controlAppliance(app.endpointId, action);
        const live = await client.getEndpointState(app.endpointId);
        console.log(
          JSON.stringify(
            { success: true, friendlyName: app.friendlyName, endpointId: app.endpointId, ...live },
            null,
            2
          )
        );
        return;
      } catch (e) {
        emitError(
          {
            error: String(e),
            friendlyName: app.friendlyName,
            endpointId: app.endpointId,
            action,
          },
          1,
          { json: true }
        );
      }
    }
    if (!opts.device) {
      emitError(
        {
          error: `Could not resolve "${name}". Try 'alexa-mcp appliances' to see names. Use -d <Echo> for voice fallback.`,
        },
        1,
        { json: true }
      );
    }
    const d = await resolveDeviceOrExit(client, opts.device, true);
    const text = s === "on" ? `turn on ${name}` : `turn off ${name}`;
    await client.command(d.serialNumber, d.deviceType, d.deviceOwnerCustomerId, text);
    console.log(
      JSON.stringify({
        success: true,
        friendlyName: name,
        action,
        method: "voice",
        device: d.accountName,
      })
    );
  });

program
  .command("groups")
  .description("List room/space groups (Kitchen, Living room, etc.)")
  .action(async () => {
    const cfg = requireAuth(true);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const groups = await client.listDeviceGroups();
    console.log(JSON.stringify(groups, null, 2));
  });

function filterAppliancesByType(appliances: import("./client.js").Appliance[], type: string): import("./client.js").Appliance[] {
  return appliances.filter((a) => {
    const caps = (a.capabilities ?? []).join(" ").toLowerCase();
    const name = (a.friendlyName ?? "").toLowerCase();
    switch (type) {
      case "light": return caps.includes("brightness") || caps.includes("colortemperature") || /light|lamp|bulb/.test(name);
      case "switch": return caps.includes("power") && !caps.includes("brightness");
      case "plug": return /plug/.test(name);
      case "sensor": return /sensor|motion|contact|temperature/.test(caps);
      case "camera": return /camera|doorbell/.test(name);
      default: return true;
    }
  });
}

program
  .command("appliances")
  .description("List smart home devices")
  .option("--type <type>", "Filter by type: light, switch, plug, sensor, camera")
  .action(async (opts: { type?: string }) => {
    const cfg = requireAuth(true);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    let appliances = await client.listAppliances();
    if (opts.type) {
      appliances = filterAppliancesByType(appliances, opts.type.toLowerCase());
    }
    const output = appliances.map(({ entityId: _entityId, ...rest }) => rest);
    console.log(JSON.stringify(output, null, 2));
  });

program
  .command("status <name>")
  .description("Get current state of a smart home device by name")
  .action(async (name: string) => {
    const cfg = requireAuth(true);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const app = await resolveApplianceOrExit(client, name, true);
    const eid = app.endpointId ?? app.entityId;
    const state = eid ? await client.getEndpointState(eid) : {};
    console.log(
      JSON.stringify(
        { friendlyName: app.friendlyName, endpointId: eid, isReachable: app.isReachable, ...state },
        null,
        2
      )
    );
  });

program
  .command("group-members <group>")
  .description(
    "List devices in a named room group, separating resolved members from unresolved/stale endpoint IDs"
  )
  .action(async (group: string) => {
    const cfg = requireAuth(true);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    let result;
    try {
      result = await client.listGroupMembers(group);
    } catch (e) {
      handleMatchError(e, true);
    }
    if (!result) {
      emitError(
        { error: `No group found matching "${group}". Try 'alexa-mcp groups' to see groups.` },
        1,
        { json: true }
      );
    }
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("control <entityId> <action>")
  .description("Control smart home device (turnOn, turnOff, setBrightness, setColorTemperature). Returns live state JSON after applying.")
  .option("-b, --brightness <0-100>", "Brightness for setBrightness", (v) => parseInt(v, 10))
  .option("-k, --kelvin <2000-6500>", "Color temperature in Kelvin for setColorTemperature", (v) => parseInt(v, 10))
  .action(async (entityId: string, action: string, opts: { brightness?: number; kelvin?: number }) => {
    const cfg = requireAuth(true);
    const validActions = ["turnOn", "turnOff", "setBrightness", "setColorTemperature"];
    if (!validActions.includes(action)) {
      emitError({ error: `Action must be one of: ${validActions.join(", ")}` }, 1, { json: true });
    }
    if (action === "setBrightness" && opts.brightness === undefined) {
      emitError({ error: "--brightness required for setBrightness" }, 1, { json: true });
    }
    if (action === "setColorTemperature" && opts.kelvin === undefined) {
      emitError({ error: "--kelvin required for setColorTemperature" }, 1, { json: true });
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    try {
      await client.controlAppliance(
        entityId,
        action as "turnOn" | "turnOff" | "setBrightness" | "setColorTemperature",
        opts.brightness,
        opts.kelvin
      );
      const state = entityId.startsWith("amzn1.alexa.endpoint.")
        ? await client.getEndpointState(entityId)
        : {};
      console.log(JSON.stringify({ success: true, entityId, action, ...state }, null, 2));
    } catch (e) {
      emitError({ error: String(e), entityId, action }, 1, { json: true });
    }
  });

program
  .command("routines")
  .description("List routines")
  .action(async () => {
    const cfg = requireAuth(true);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const routines = await client.listRoutines();
    console.log(JSON.stringify(routines, null, 2));
  });

program
  .command("run [automationId]")
  .description("Run a routine by ID, exact name (--name), or partial name (--partial)")
  .option("--name <name>", "Run routine by exact name (case-insensitive)")
  .option("--partial <text>", "Run routine by partial name match")
  .option("--json", "Output as JSON")
  .action(async (automationId: string | undefined, opts: { name?: string; partial?: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    const cfg = requireAuth(json);
    if (!automationId && !opts.name && !opts.partial) {
      emitError({ error: "Provide automationId, --name <name>, or --partial <text>" }, 1, { json });
    }
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const routines = await client.listRoutines();
    let r: (typeof routines)[0] | undefined;
    if (automationId) {
      r = routines.find((x) => x.automationId === automationId);
      if (!r) {
        emitError({ error: `Routine not found: ${automationId}` }, 1, { json });
      }
    } else if (opts.name) {
      const q = opts.name.toLowerCase();
      r = routines.find((x) => x.name.toLowerCase() === q);
      if (!r) {
        emitError({ error: `Routine not found with name: "${opts.name}"` }, 1, { json });
      }
    } else if (opts.partial) {
      const q = opts.partial.toLowerCase();
      const matches = routines.filter((x) => x.name.toLowerCase().includes(q));
      if (matches.length === 0) {
        emitError({ error: `No routines matched: "${opts.partial}"` }, 1, { json });
      }
      if (matches.length > 1) {
        emitError(
          {
            error: `Multiple matches. Provide --name or a more specific --partial.`,
            suggestions: matches.map((m) => m.name),
            matches: matches.map((m) => ({ automationId: m.automationId, name: m.name })),
          },
          1,
          { json: true }
        );
      }
      r = matches[0];
    }
    const sequenceJson = r!.sequence != null ? JSON.stringify(r!.sequence) : undefined;
    await client.runRoutine(r!.automationId, sequenceJson);
    emitResult(
      { success: true, ran: r!.name, automationId: r!.automationId },
      { json },
      undefined
    );
  });

program
  .command("now-playing")
  .description("Show now-playing state for a device (track, artist, album, state, volume)")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .option("--json", "Output as JSON (default for this command)")
  .action(async (opts: { device: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    if (!opts.device) {
      emitError({ error: "--device is required" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await resolveDeviceOrExit(client, opts.device, json);
    const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
    console.log(JSON.stringify({ device: d.accountName, ...state }, null, 2));
  });

program
  .command("volume")
  .description("Get or set speaker volume (0–100) on an Echo device")
  .argument("[level]", "Volume level 0–100 (omit to get current volume)", "")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .option("--json", "Output as JSON")
  .action(async (level: string, opts: { device: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    if (!opts.device) {
      emitError({ error: "--device is required" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const d = await resolveDeviceOrExit(client, opts.device, json);
    if (!level) {
      const vol = await client.getVolume(d.deviceType, d.serialNumber);
      console.log(JSON.stringify({ device: d.accountName, ...vol }, null, 2));
      return;
    }
    const v = parseInt(level, 10);
    if (isNaN(v) || v < 0 || v > 100) {
      emitError({ error: "Volume must be a number between 0 and 100" }, 1, { json });
    }
    await client.setVolume(d.deviceType, d.serialNumber, v);
    emitResult(
      { success: true, device: d.accountName, volume: v },
      { json },
      `Volume set to ${v} on ${d.accountName}`
    );
  });

program
  .command("brightness")
  .description("Get or set brightness (0–100) on a smart home light by name")
  .argument("[level]", "Brightness level 0–100 (omit to get current brightness)", "")
  .option("-n, --name <name>", "Light device friendly name (required)", "")
  .option("--json", "Output as JSON")
  .action(async (level: string, opts: { name: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    if (!opts.name) {
      emitError({ error: "--name is required (e.g. --name 'Lounge lamp')" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const app = await resolveApplianceOrExit(client, opts.name, json);
    const eid = app.endpointId ?? app.entityId;
    if (!eid) {
      emitError({ error: `No controllable endpoint for "${opts.name}"` }, 1, { json });
    }
    if (!level) {
      const state = await client.getEndpointState(eid);
      console.log(JSON.stringify({ device: app.friendlyName, endpointId: eid, ...state }, null, 2));
      return;
    }
    const b = parseInt(level, 10);
    if (isNaN(b) || b < 0 || b > 100) {
      emitError({ error: "Brightness must be a number between 0 and 100" }, 1, { json });
    }
    await client.controlAppliance(eid, "setBrightness", b);
    emitResult(
      { success: true, device: app.friendlyName, endpointId: eid, brightness: b },
      { json },
      `Brightness set to ${b}% on ${app.friendlyName}`
    );
  });

program
  .command("color-temp")
  .description("Get or set color temperature (2000–6500K) on a smart home light by name")
  .argument("[kelvin]", "Color temperature in Kelvin 2000-6500 (omit to get current color temperature)", "")
  .option("-n, --name <name>", "Light device friendly name (required)", "")
  .option("--json", "Output as JSON")
  .action(async (kelvin: string, opts: { name: string; json?: boolean }) => {
    const json = wantsJson(opts, program.opts().json);
    if (!opts.name) {
      emitError({ error: "--name is required" }, 1, { json });
    }
    const cfg = requireAuth(json);
    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const app = await resolveApplianceOrExit(client, opts.name, json);
    const eid = app.endpointId ?? app.entityId;
    if (!eid) {
      emitError({ error: `No controllable endpoint for "${opts.name}"` }, 1, { json });
    }
    if (!kelvin) {
      const state = await client.getEndpointState(eid);
      console.log(JSON.stringify({ device: app.friendlyName, endpointId: eid, ...state }, null, 2));
      return;
    }
    const k = parseInt(kelvin, 10);
    if (isNaN(k) || k < 2000 || k > 6500) {
      emitError({ error: "Color temperature must be a number between 2000 and 6500 Kelvin" }, 1, { json });
    }
    await client.controlAppliance(eid, "setColorTemperature", undefined, k);
    emitResult(
      { success: true, device: app.friendlyName, endpointId: eid, colorTemperature: k },
      { json },
      `Color temperature set to ${k}K on ${app.friendlyName}`
    );
  });

program
  .command("batch-control <action>")
  .description(
    "Batch control multiple smart home devices with same action/value. Returns {results, success, partial} with per-device map."
  )
  .argument("[entityIds...]", "Entity IDs or endpoint IDs (omit to read from stdin)")
  .option("-b, --brightness <0-100>", "Brightness for setBrightness", (v) => parseInt(v, 10))
  .option("-k, --kelvin <2000-6500>", "Color temperature in Kelvin for setColorTemperature", (v) => parseInt(v, 10))
  .option("--dry-run", "Show planned targets (name + endpointId) without controlling", false)
  .option("--json", "Output as JSON (default for this command)")
  .action(async (
    action: string,
    entityIds: string[],
    opts: { brightness?: number; kelvin?: number; dryRun?: boolean; json?: boolean }
  ) => {
    const json = wantsJson(opts, program.opts().json);
    const cfg = requireAuth(json);
    const validActions = ["turnOn", "turnOff", "setBrightness", "setColorTemperature"];
    if (!validActions.includes(action)) {
      emitError({ error: `Action must be one of: ${validActions.join(", ")}` }, 1, { json });
    }
    if (action === "setBrightness" && opts.brightness === undefined) {
      emitError({ error: "--brightness required for setBrightness" }, 1, { json });
    }
    if (action === "setColorTemperature" && opts.kelvin === undefined) {
      emitError({ error: "--kelvin required for setColorTemperature" }, 1, { json });
    }

    if (entityIds.length === 0) {
      const stdinData = await new Promise<string>((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => resolve(data.trim()));
        // If stdin is a TTY, end immediately so we don't hang
        if (process.stdin.isTTY) resolve("");
      });
      entityIds = stdinData.split("\n").filter((id) => id.trim());
    }

    if (entityIds.length === 0) {
      emitError(
        { error: "No entity IDs provided. Provide as arguments or via stdin." },
        1,
        { json }
      );
    }

    const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
    const appliances = await client.listAppliances();
    const byId = new Map<string, import("./client.js").Appliance>();
    for (const a of appliances) {
      if (a.entityId) byId.set(a.entityId, a);
      if (a.endpointId) byId.set(a.endpointId, a);
    }

    if (opts.dryRun) {
      const planned = entityIds.map((id) => {
        const app = byId.get(id);
        return {
          name: app?.friendlyName ?? id,
          endpointId: app?.endpointId ?? id,
          resolved: Boolean(app),
        };
      });
      console.log(
        JSON.stringify(
          {
            action,
            dryRun: true,
            planned,
            success: planned.length > 0,
            partial: false,
          },
          null,
          2
        )
      );
      return;
    }

    const results = await client.batchControlAppliances(
      entityIds,
      action as "turnOn" | "turnOff" | "setBrightness" | "setColorTemperature",
      opts.brightness,
      opts.kelvin
    );
    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;
    const flags = controlResultFlags(ok, fail);
    const output = Object.fromEntries(
      results.map((r) => [
        r.entityId,
        {
          friendlyName: byId.get(r.entityId)?.friendlyName ?? r.entityId,
          success: r.success,
          ...(r.error ? { error: r.error } : {}),
        },
      ])
    );
    console.log(
      JSON.stringify(
        {
          action,
          results: output,
          success: flags.success,
          partial: flags.partial,
          controlled: ok,
          errors: fail,
        },
        null,
        2
      )
    );
    process.exitCode = controlExitCode(ok, fail);
  });

const mediaCmd = program
  .command("media <command>")
  .description("Transport control: play, pause, resume, stop, next, previous (EU/UK)")
  .option("-d, --device <name>", "Device name or serial (required)", "")
  .option("--json", "Output as JSON");

const mediaCommands = ["play", "pause", "resume", "stop", "next", "previous"];

mediaCmd.action(async (command: string, opts: { device: string; json?: boolean }) => {
  const json = wantsJson(opts, program.opts().json);
  if (!opts.device) {
    emitError({ error: "--device is required" }, 1, { json });
  }
  const c = command.toLowerCase();
  if (!mediaCommands.includes(c)) {
    emitError({ error: `Command must be one of: ${mediaCommands.join(", ")}` }, 1, { json });
  }
  const cfg = requireAuth(json);
  const client = new AlexaClient({ refreshToken: cfg.refreshToken, domain: cfg.domain });
  const d = await resolveDeviceOrExit(client, opts.device, json);
  const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
  const taskSessionId = state?.taskSessionId;
  if (!taskSessionId) {
    emitError(
      {
        error: `No active playback on ${d.accountName}. Start something first (e.g. "Alexa, play jazz").`,
      },
      1,
      { json }
    );
  }
  await client.controlMediaSession(
    d,
    taskSessionId,
    c as "play" | "pause" | "resume" | "stop" | "next" | "previous"
  );
  emitResult(
    { success: true, command: c, device: d.accountName },
    { json },
    `${command} sent to ${d.accountName}`
  );
});

program.parse();
