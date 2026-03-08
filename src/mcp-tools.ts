import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlexaClient } from "./client.js";
import { loadRefreshToken } from "./auth.js";

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
      if (!r || !r.sequence) {
        return {
          content: [{ type: "text" as const, text: `Routine not found: ${automationId}` }],
          isError: true,
        };
      }
      await client.runRoutine(r.automationId, JSON.stringify(r.sequence));
      return {
        content: [{ type: "text" as const, text: `Ran routine: ${r.name}` }],
      };
    }
  );
}

export async function createClient(): Promise<AlexaClient> {
  const token = loadRefreshToken();
  if (!token) {
    throw new Error(
      "No refresh token. Set ALEXA_REFRESH_TOKEN or run alexacli auth and use ~/.alexa-cli/config.json"
    );
  }
  return new AlexaClient({ refreshToken: token });
}
