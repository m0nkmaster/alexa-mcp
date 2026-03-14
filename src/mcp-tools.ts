import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlexaClient } from "./client.js";
import { loadRefreshToken, loadDomain } from "./auth.js";

export function registerAlexaTools(
  server: McpServer,
  clientFactory: () => Promise<AlexaClient>
) {
  server.registerTool(
    "alexa_list_devices",
    {
      title: "List Alexa Devices",
      description: "List all Echo devices on the account",
      inputSchema: z.object({}),
    },
    async () => {
      const client = await clientFactory();
      const devices = await client.getDevices();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(devices, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_speak",
    {
      title: "Speak on Device",
      description: "Text-to-speech on a specific Echo device",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
        text: z.string().describe("Text to speak"),
      }),
    },
    async ({ device, text }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      await client.speak(
        d.serialNumber,
        d.deviceType,
        d.deviceOwnerCustomerId,
        text
      );
      return {
        content: [{ type: "text" as const, text: `Spoke on ${d.accountName}` }],
      };
    }
  );

  server.registerTool(
    "alexa_announce",
    {
      title: "Announce to All",
      description: "Announce a message to all Echo devices",
      inputSchema: z.object({
        text: z.string().describe("Message to announce"),
      }),
    },
    async ({ text }) => {
      const client = await clientFactory();
      const devices = await client.getDevices();
      if (devices.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No devices found" }],
          isError: true,
        };
      }
      const customerId = devices[0].deviceOwnerCustomerId;
      await client.announce(customerId, text);
      return {
        content: [{ type: "text" as const, text: "Announcement sent" }],
      };
    }
  );

  server.registerTool(
    "alexa_command",
    {
      title: "Voice Command",
      description:
        "Send a voice command to Alexa (e.g. play music, set alarm). For smart home control, prefer control_by_pattern or switch_by_name—voice commands can hit 'Can't control for other account' profile issues and we do not receive Alexa's response.",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
        text: z.string().describe("Command text (e.g. 'turn off living room light')"),
      }),
    },
    async ({ device, text }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      await client.command(
        d.serialNumber,
        d.deviceType,
        d.deviceOwnerCustomerId,
        text
      );
      return {
        content: [{ type: "text" as const, text: `Command sent to ${d.accountName}` }],
      };
    }
  );

  server.registerTool(
    "alexa_list_appliances",
    {
      title: "List Smart Home Devices",
      description:
        "List smart home appliances (lights, plugs, etc.) with endpointId (amzn1.alexa.endpoint.*) and friendlyName when available. Use endpointId with control_appliance for direct control.",
      inputSchema: z.object({}),
    },
    async () => {
      const client = await clientFactory();
      const appliances = await client.listAppliances();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(appliances, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_control_appliance",
    {
      title: "Control Smart Home Device",
      description:
        "Turn on/off or set brightness of a smart home device. Use endpointId (amzn1.alexa.endpoint.*) from list_appliances for direct GraphQL control. Opaque IDs use phoenix API.",
      inputSchema: z.object({
        entityId: z
          .string()
          .describe(
            "Endpoint ID (amzn1.alexa.endpoint.*) or entity ID from list_appliances. Prefer endpointId for direct control."
          ),
        action: z.enum(["turnOn", "turnOff", "setBrightness"]),
        brightness: z.number().min(0).max(100).optional().describe("Required for setBrightness"),
      }),
    },
    async ({ entityId, action, brightness }) => {
      const client = await clientFactory();
      if (action === "setBrightness" && brightness === undefined) {
        return {
          content: [{ type: "text" as const, text: "brightness required for setBrightness" }],
          isError: true,
        };
      }
      await client.controlAppliance(entityId, action, brightness);
      return {
        content: [{ type: "text" as const, text: `Done: ${action} ${entityId}` }],
      };
    }
  );

  server.registerTool(
    "alexa_control_by_group",
    {
      title: "Control Devices in Group (Room)",
      description:
        "Turn on/off smart home devices in an Alexa room group (e.g. 'Kitchen', 'Living room'). Uses list_device_groups—matches by group name and controls all lights in that group via direct GraphQL. Prefer over voice for 'all lights in group X'.",
      inputSchema: z.object({
        groupName: z
          .string()
          .describe("Room group name from list_device_groups (e.g. 'Kitchen', 'Living room')"),
        state: z.enum(["on", "off"]),
        lightsOnly: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true (default), only control devices with light/lamp/bulb in name"),
      }),
    },
    async ({ groupName, state, lightsOnly }) => {
      const client = await clientFactory();
      const action = state === "on" ? "turnOn" : "turnOff";
      try {
        const { controlled, errors } = await client.controlAppliancesByGroup(groupName, action, {
          lightsOnly,
        });
        const lines: string[] = [];
        if (controlled.length > 0) {
          lines.push(`Done (group ${groupName}): ${action} → ${controlled.join(", ")}`);
        }
        if (errors.length > 0) {
          lines.push(`Errors: ${errors.join("; ")}`);
        }
        if (controlled.length === 0 && errors.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No lights controlled in group "${groupName}". Try list_device_groups to see groups.`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          isError: errors.length > 0 && controlled.length === 0,
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: String(e) }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "alexa_control_by_pattern",
    {
      title: "Control Devices by Pattern (Room/Name)",
      description:
        "Turn on/off smart home devices matching a pattern (e.g. 'kitchen lights', 'living room'). Resolves devices by friendlyName and uses direct GraphQL control. For 'all lights in group Kitchen', use control_by_group instead.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe("Pattern to match (e.g. 'kitchen lights', 'living room'). All words must appear in device name."),
        state: z.enum(["on", "off"]),
      }),
    },
    async ({ pattern, state }) => {
      const client = await clientFactory();
      const action = state === "on" ? "turnOn" : "turnOff";
      const { controlled, errors } = await client.controlAppliancesByPattern(pattern, action);
      const lines: string[] = [];
      if (controlled.length > 0) {
        lines.push(`Done (direct control): ${action} → ${controlled.join(", ")}`);
      }
      if (errors.length > 0) {
        lines.push(`Errors: ${errors.join("; ")}`);
      }
      if (controlled.length === 0 && errors.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No devices matched "${pattern}". Use list_appliances to see device names.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        isError: errors.length > 0 && controlled.length === 0,
      };
    }
  );

  server.registerTool(
    "alexa_switch_by_name",
    {
      title: "Turn Smart Home Device On/Off by Name",
      description:
        "Turn a single smart plug or light on or off by its exact Alexa name (e.g. 'Lounge light 2', 'TV'). For room/pattern (e.g. 'kitchen lights'), use control_by_pattern instead—it avoids profile issues.",
      inputSchema: z.object({
        name: z.string().describe("Smart home device name as known to Alexa (e.g. 'Lounge light 2', 'TV')"),
        state: z.enum(["on", "off"]),
        device: z
          .string()
          .optional()
          .describe("Echo device for voice fallback only (e.g. 'Lounge Echo'); required if direct control fails"),
      }),
    },
    async ({ name, state, device }) => {
      const client = await clientFactory();
      const action = state === "on" ? "turnOn" : "turnOff";
      const app = await client.resolveApplianceByName(name);
      if (app?.endpointId) {
        await client.controlAppliance(app.endpointId, action);
        return {
          content: [{ type: "text" as const, text: `Done: ${action} ${app.friendlyName} (direct control)` }],
        };
      }
      if (!device) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Could not resolve "${name}" to a controllable device. Try list_appliances to see names. If the device exists, provide 'device' for voice fallback.`,
            },
          ],
          isError: true,
        };
      }
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Echo device not found: ${device}` }],
          isError: true,
        };
      }
      const text = state === "on" ? `turn on ${name}` : `turn off ${name}`;
      await client.command(d.serialNumber, d.deviceType, d.deviceOwnerCustomerId, text);
      return {
        content: [{ type: "text" as const, text: `Sent "${text}" via ${d.accountName} (voice fallback)` }],
      };
    }
  );

  server.registerTool(
    "alexa_list_device_groups",
    {
      title: "List Device Groups",
      description:
        "List room/space groups (Living room, Kitchen, etc.) from the Alexa app. Returns group names, IDs, and appliance counts.",
      inputSchema: z.object({}),
    },
    async () => {
      const client = await clientFactory();
      const groups = await client.listDeviceGroups();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(groups, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_control_group",
    {
      title: "Control Room Group (Lights)",
      description:
        "Turn on/off all lights in a room/space group (e.g. Kitchen, Living room). Uses group membership from the Alexa app. By default only controls devices with 'light', 'lamp', or 'bulb' in the name.",
      inputSchema: z.object({
        group: z.string().describe("Group/room name (e.g. 'Kitchen', 'Living room')"),
        state: z.enum(["on", "off"]),
        lightsOnly: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true, only control lights (default). If false, control all appliances in the group."),
      }),
    },
    async ({ group, state, lightsOnly }) => {
      const client = await clientFactory();
      const action = state === "on" ? "turnOn" : "turnOff";
      const { controlled, errors } = await client.controlAppliancesByGroup(group, action, { lightsOnly });
      const lines: string[] = [];
      if (controlled.length > 0) {
        lines.push(`Done: ${action} → ${controlled.join(", ")}`);
      }
      if (errors.length > 0) {
        lines.push(`Errors: ${errors.join("; ")}`);
      }
      if (controlled.length === 0 && errors.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No lights found in group "${group}". Use list_device_groups and list_appliances to inspect.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        isError: errors.length > 0 && controlled.length === 0,
      };
    }
  );

  server.registerTool(
    "alexa_list_audio_groups",
    {
      title: "List Audio Groups",
      description:
        "List multi-room audio groups (Downstairs, Everywhere, etc.) with Echo device members for whole-home music playback.",
      inputSchema: z.object({}),
    },
    async () => {
      const client = await clientFactory();
      const groups = await client.listAudioGroups();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(groups, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_list_routines",
    {
      title: "List Routines",
      description: "List Alexa routines",
      inputSchema: z.object({}),
    },
    async () => {
      const client = await clientFactory();
      const routines = await client.listRoutines();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(routines, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_auth_status",
    {
      title: "Auth Status",
      description: "Check Alexa authentication status. Returns whether configured and device count if valid.",
      inputSchema: z.object({}),
    },
    async () => {
      const token = loadRefreshToken();
      if (!token) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                configured: false,
                message: "Not configured. Run 'alexa-mcp auth' to authenticate.",
              }),
            },
          ],
        };
      }
      try {
        const client = await clientFactory();
        const devices = await client.getDevices();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                configured: true,
                valid: true,
                deviceCount: devices.length,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                configured: true,
                valid: false,
                error: String(e),
                message: "Token invalid. Run 'alexa-mcp auth' to re-authenticate.",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "alexa_run_routine",
    {
      title: "Run Routine",
      description: "Run an Alexa routine by automation ID",
      inputSchema: z.object({
        automationId: z.string().describe("Automation ID from list_routines"),
      }),
    },
    async ({ automationId }) => {
      const client = await clientFactory();
      const routines = await client.listRoutines();
      const r = routines.find((x) => x.automationId === automationId);
      if (!r) {
        return {
          content: [{ type: "text" as const, text: `Routine not found: ${automationId}` }],
          isError: true,
        };
      }
      const sequenceJson = r.sequence != null ? JSON.stringify(r.sequence) : undefined;
      await client.runRoutine(r.automationId, sequenceJson);
      return {
        content: [{ type: "text" as const, text: `Ran routine: ${r.name}` }],
      };
    }
  );

  server.registerTool(
    "alexa_now_playing",
    {
      title: "Now Playing",
      description:
        "Get now-playing state for an Echo device. Returns track title, artist, album, playback state, volume, and taskSessionId for transport control.",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
      }),
    },
    async ({ device }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ device: d.accountName, ...state }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_get_volume",
    {
      title: "Get Volume",
      description: "Get the current speaker volume (0–100) for an Echo device.",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
      }),
    },
    async ({ device }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      const vol = await client.getVolume(d.deviceType, d.serialNumber);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ device: d.accountName, ...vol }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_set_volume",
    {
      title: "Set Volume",
      description: "Set the speaker volume (0–100) on an Echo device.",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
        volume: z.number().int().min(0).max(100).describe("Volume level 0–100"),
      }),
    },
    async ({ device, volume }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      await client.setVolume(d.deviceType, d.serialNumber, volume);
      return {
        content: [
          {
            type: "text" as const,
            text: `Volume set to ${volume} on ${d.accountName}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_set_brightness_by_name",
    {
      title: "Set Light Brightness by Name",
      description:
        "Set the brightness of a smart home light by its friendly name. Resolves device by name then sends setBrightness via GraphQL. For endpointId, use control_appliance instead.",
      inputSchema: z.object({
        name: z.string().describe("Light device friendly name (e.g. 'Lounge lamp', 'Bedroom light')"),
        brightness: z.number().int().min(0).max(100).describe("Brightness level 0–100"),
      }),
    },
    async ({ name, brightness }) => {
      const client = await clientFactory();
      const app = await client.resolveApplianceByName(name);
      if (!app) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Device not found: "${name}". Use list_appliances to see available device names.`,
            },
          ],
          isError: true,
        };
      }
      const eid = app.endpointId ?? app.entityId;
      if (!eid) {
        return {
          content: [{ type: "text" as const, text: `No controllable ID for "${name}"` }],
          isError: true,
        };
      }
      await client.controlAppliance(eid, "setBrightness", brightness);
      return {
        content: [
          {
            type: "text" as const,
            text: `Brightness set to ${brightness}% on ${app.friendlyName}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_get_brightness_by_name",
    {
      title: "Get Light Brightness by Name",
      description:
        "Get the current brightness and power state of a smart home light by its friendly name. Queries GraphQL for live state.",
      inputSchema: z.object({
        name: z.string().describe("Light device friendly name (e.g. 'Lounge lamp', 'Bedroom light')"),
      }),
    },
    async ({ name }) => {
      const client = await clientFactory();
      const app = await client.resolveApplianceByName(name);
      if (!app) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Device not found: "${name}". Use list_appliances to see available device names.`,
            },
          ],
          isError: true,
        };
      }
      const eid = app.endpointId ?? app.entityId;
      if (!eid) {
        return {
          content: [{ type: "text" as const, text: `No endpoint ID for "${name}"` }],
          isError: true,
        };
      }
      const state = await client.getBrightnessState(eid);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { device: app.friendlyName, endpointId: eid, ...state },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_media_control",
    {
      title: "Media Control",
      description: "Play, pause, resume, stop, next, or previous on an Echo device's current playback",
      inputSchema: z.object({
        device: z.string().describe("Device name or serial number"),
        command: z
          .enum(["play", "pause", "resume", "stop", "next", "previous"])
          .describe("Transport command"),
      }),
    },
    async ({ device, command }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Device not found: ${device}` }],
          isError: true,
        };
      }
      const state = await client.getNowPlaying(d.serialNumber, d.deviceType);
      const taskSessionId = state?.taskSessionId;
      if (!taskSessionId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No active playback on ${d.accountName}. Start something (e.g. "Alexa, play jazz") then try again.`,
            },
          ],
          isError: true,
        };
      }
      await client.controlMediaSession(d, taskSessionId, command);
      return {
        content: [
          {
            type: "text" as const,
            text: `Sent ${command} to ${d.accountName}`,
          },
        ],
      };
    }
  );
}

export async function createClient(refreshTokenOverride?: string): Promise<AlexaClient> {
  const token = loadRefreshToken(refreshTokenOverride) ?? refreshTokenOverride;
  if (!token) {
    throw new Error(
      "No refresh token. Set ALEXA_REFRESH_TOKEN or run 'alexa-mcp auth' to authenticate."
    );
  }
  return new AlexaClient({ refreshToken: token, domain: loadDomain() });
}
