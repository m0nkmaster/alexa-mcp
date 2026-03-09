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
      description: "Send a voice command to Alexa (e.g. play music, set alarm, control smart home)",
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
      description: "List smart home appliances (lights, plugs, etc.)",
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
      description: "Turn on/off or set brightness of a smart home device",
      inputSchema: z.object({
        entityId: z.string().describe("Entity ID from list_appliances"),
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
    "alexa_switch_by_name",
    {
      title: "Turn Smart Home Device On/Off by Name",
      description: "Turn a smart plug or light on or off using its Alexa name (e.g. 'TV', 'Living Room Lamp'). Uses voice command; works when appliance list is empty.",
      inputSchema: z.object({
        device: z.string().describe("Echo device to send the command through (e.g. 'Lounge Echo', 'Office')"),
        name: z.string().describe("Smart home device name as known to Alexa (e.g. 'TV', 'Landing Lamp')"),
        state: z.enum(["on", "off"]),
      }),
    },
    async ({ device, name, state }) => {
      const client = await clientFactory();
      const d = await client.resolveDevice(device);
      if (!d) {
        return {
          content: [{ type: "text" as const, text: `Echo device not found: ${device}` }],
          isError: true,
        };
      }
      const text = state === "on" ? `turn on ${name}` : `turn off ${name}`;
      await client.command(
        d.serialNumber,
        d.deviceType,
        d.deviceOwnerCustomerId,
        text
      );
      return {
        content: [{ type: "text" as const, text: `Sent "${text}" via ${d.accountName}` }],
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
      description: "Get now-playing state for an Echo device (includes taskSessionId for transport control)",
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
