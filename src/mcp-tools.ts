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
        "List smart home appliances (lights, plugs, etc.) with endpointId (amzn1.alexa.endpoint.*) and friendlyName when available. Use endpointId with control_appliance for direct control. Filter by type: light, switch, plug, sensor, camera.",
      inputSchema: z.object({
        type: z.string().optional().describe("Filter by device type: light, switch, plug, sensor, camera"),
      }),
    },
    async ({ type }) => {
      const client = await clientFactory();
      let appliances = await client.listAppliances();
      if (type) {
        const t = type.toLowerCase();
        appliances = appliances.filter((a) => {
          const caps = (a.capabilities ?? []).join(" ").toLowerCase();
          const name = (a.friendlyName ?? "").toLowerCase();
          switch (t) {
            case "light": return caps.includes("brightness") || caps.includes("colortemperature") || /light|lamp|bulb/.test(name);
            case "switch": return caps.includes("power") && !caps.includes("brightness");
            case "plug": return /plug/.test(name);
            case "sensor": return /sensor|motion|contact|temperature/.test(caps);
            case "camera": return /camera|doorbell/.test(name);
            default: return true;
          }
        });
      }
      const output = appliances.map(({ entityId, ...rest }) => rest);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_device_status",
    {
      title: "Get Device Status",
      description:
        "Get the current state of a smart home device by name: power, brightness, colorTemperature, and reachability. Queries live state from GraphQL.",
      inputSchema: z.object({
        name: z.string().describe("Smart home device friendly name (e.g. 'Kitchen spot 1', 'Lounge lamp')"),
      }),
    },
    async ({ name }) => {
      const client = await clientFactory();
      const app = await client.resolveApplianceByName(name);
      if (!app) {
        return {
          content: [{ type: "text" as const, text: `Device not found: "${name}". Use list_appliances to see available device names.` }],
          isError: true,
        };
      }
      const eid = app.endpointId ?? app.entityId;
      const state = eid ? await client.getEndpointState(eid) : {};
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ friendlyName: app.friendlyName, endpointId: eid, isReachable: app.isReachable, ...state }, null, 2),
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
        "Turn on/off, set brightness, or set color temperature of a smart home device. Use endpointId (amzn1.alexa.endpoint.*) from list_appliances for direct GraphQL control. Opaque IDs use phoenix API.",
      inputSchema: z.object({
        entityId: z
          .string()
          .describe(
            "Endpoint ID (amzn1.alexa.endpoint.*) or entity ID from list_appliances. Prefer endpointId for direct control."
          ),
        action: z.enum(["turnOn", "turnOff", "setBrightness", "setColorTemperature"]),
        brightness: z.number().min(0).max(100).optional().describe("Required for setBrightness"),
        colorTemperatureInKelvin: z.number().min(2000).max(6500).optional().describe("Required for setColorTemperature (2000-6500K)"),
      }),
    },
    async ({ entityId, action, brightness, colorTemperatureInKelvin }) => {
      const client = await clientFactory();
      if (action === "setBrightness" && brightness === undefined) {
        return {
          content: [{ type: "text" as const, text: "brightness required for setBrightness" }],
          isError: true,
        };
      }
      if (action === "setColorTemperature" && colorTemperatureInKelvin === undefined) {
        return {
          content: [{ type: "text" as const, text: "colorTemperatureInKelvin required for setColorTemperature" }],
          isError: true,
        };
      }
      await client.controlAppliance(entityId, action, brightness, colorTemperatureInKelvin);
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
    "alexa_group_members",
    {
      title: "List Group Members",
      description:
        "List all smart home devices in a named room group (e.g. 'Kitchen', 'Living room'). Returns full appliance info for each member.",
      inputSchema: z.object({
        groupName: z.string().describe("Room group name (e.g. 'Kitchen', 'Living room')"),
      }),
    },
    async ({ groupName }) => {
      const client = await clientFactory();
      const members = await client.listGroupMembers(groupName);
      if (members.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No group found matching "${groupName}". Use list_device_groups to see groups.` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(members, null, 2),
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
      description: "Run an Alexa routine by automation ID, exact name, or partial name match",
      inputSchema: z.object({
        automationId: z.string().optional().describe("Automation ID from list_routines"),
        name: z.string().optional().describe("Run by exact routine name (case-insensitive)"),
        partial: z.string().optional().describe("Run by partial routine name match"),
      }),
    },
    async ({ automationId, name, partial }) => {
      const client = await clientFactory();
      if (!automationId && !name && !partial) {
        return {
          content: [{ type: "text" as const, text: "Provide automationId, name, or partial" }],
          isError: true,
        };
      }
      const routines = await client.listRoutines();
      let r: (typeof routines)[0] | undefined;
      if (automationId) {
        r = routines.find((x) => x.automationId === automationId);
        if (!r) {
          return {
            content: [{ type: "text" as const, text: `Routine not found: ${automationId}` }],
            isError: true,
          };
        }
      } else if (name) {
        const q = name.toLowerCase();
        r = routines.find((x) => x.name.toLowerCase() === q);
        if (!r) {
          return {
            content: [{ type: "text" as const, text: `Routine not found with name: "${name}"` }],
            isError: true,
          };
        }
      } else if (partial) {
        const q = partial.toLowerCase();
        const matches = routines.filter((x) => x.name.toLowerCase().includes(q));
        if (matches.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No routines matched: "${partial}"` }],
            isError: true,
          };
        }
        if (matches.length > 1) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ matches: matches.map((m) => ({ automationId: m.automationId, name: m.name })) }, null, 2) }],
            isError: true,
          };
        }
        r = matches[0];
      }
      const sequenceJson = r!.sequence != null ? JSON.stringify(r!.sequence) : undefined;
      await client.runRoutine(r!.automationId, sequenceJson);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ran: r!.name, automationId: r!.automationId }) }],
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
      const state = await client.getEndpointState(eid);
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
    "alexa_batch_control_appliances",
    {
      title: "Batch Control Smart Home Devices",
      description:
        "Control multiple smart home devices with the same action and values. Much faster than individual calls for many devices. Supports both GraphQL and Phoenix endpoints.",
      inputSchema: z.object({
        entityIds: z.array(z.string()).describe("Array of entity IDs or endpoint IDs"),
        action: z.enum(["turnOn", "turnOff", "setBrightness", "setColorTemperature"]),
        brightness: z.number().min(0).max(100).optional().describe("Required for setBrightness"),
        colorTemperatureInKelvin: z.number().min(2000).max(6500).optional().describe("Required for setColorTemperature (2000-6500K)"),
      }),
    },
    async ({ entityIds, action, brightness, colorTemperatureInKelvin }) => {
      const client = await clientFactory();
      if (action === "setBrightness" && brightness === undefined) {
        return {
          content: [{ type: "text" as const, text: "brightness required for setBrightness" }],
          isError: true,
        };
      }
      if (action === "setColorTemperature" && colorTemperatureInKelvin === undefined) {
        return {
          content: [{ type: "text" as const, text: "colorTemperatureInKelvin required for setColorTemperature" }],
          isError: true,
        };
      }
      const [results, appliances] = await Promise.all([
        client.batchControlAppliances(entityIds, action, brightness, colorTemperatureInKelvin),
        client.listAppliances(),
      ]);
      const nameMap = new Map(appliances.map((a) => [a.entityId, a.friendlyName]));
      const output = Object.fromEntries(
        results.map((r) => [
          r.entityId,
          {
            friendlyName: nameMap.get(r.entityId) ?? r.entityId,
            success: r.success,
            ...(r.error ? { error: r.error } : {}),
          },
        ])
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
      };
    }
  );

  server.registerTool(
    "alexa_batch_control_appliances_custom",
    {
      title: "Batch Control Smart Home Devices (Custom)",
      description:
        "Control multiple smart home devices with different actions/values. Maximum flexibility - each device can have different settings.",
      inputSchema: z.object({
        requests: z.array(z.object({
          entityId: z.string().describe("Entity ID or endpoint ID"),
          action: z.enum(["turnOn", "turnOff", "setBrightness", "setColorTemperature"]),
          brightness: z.number().min(0).max(100).optional().describe("Required for setBrightness"),
          colorTemperatureInKelvin: z.number().min(2000).max(6500).optional().describe("Required for setColorTemperature (2000-6500K)"),
        })).describe("Array of device control requests"),
      }),
    },
    async ({ requests }) => {
      const client = await clientFactory();
      for (const req of requests) {
        if (req.action === "setBrightness" && req.brightness === undefined) {
          return {
            content: [{ type: "text" as const, text: `brightness required for setBrightness on ${req.entityId}` }],
            isError: true,
          };
        }
        if (req.action === "setColorTemperature" && req.colorTemperatureInKelvin === undefined) {
          return {
            content: [{ type: "text" as const, text: `colorTemperatureInKelvin required for setColorTemperature on ${req.entityId}` }],
            isError: true,
          };
        }
      }
      await client.batchControlAppliancesCustom(requests);
      return {
        content: [{ type: "text" as const, text: `Batch done: ${requests.length} custom operations` }],
      };
    }
  );

  server.registerTool(
    "alexa_set_color_temperature_by_name",
    {
      title: "Set Light Color Temperature by Name",
      description:
        "Set the color temperature of a smart home light by its friendly name. Resolves device by name then sends setColorTemperature via GraphQL. For endpointId, use control_appliance instead.",
      inputSchema: z.object({
        name: z.string().describe("Light device friendly name (e.g. 'Lounge lamp', 'Bedroom light')"),
        colorTemperatureInKelvin: z.number().int().min(2000).max(6500).describe("Color temperature in Kelvin (2000-6500K)"),
      }),
    },
    async ({ name, colorTemperatureInKelvin }) => {
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
      await client.controlAppliance(eid, "setColorTemperature", undefined, colorTemperatureInKelvin);
      return {
        content: [
          {
            type: "text" as const,
            text: `Color temperature set to ${colorTemperatureInKelvin}K on ${app.friendlyName}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "alexa_get_color_temperature_by_name",
    {
      title: "Get Light Color Temperature by Name",
      description:
        "Get the current color temperature, brightness, and power state of a smart home light by its friendly name. Queries GraphQL for live state.",
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
      const state = await client.getEndpointState(eid);
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
