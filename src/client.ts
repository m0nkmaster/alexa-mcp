import { getConfig, type Domain } from "./config.js";
import { authenticate, type AlexaCredentials } from "./auth.js";
import { fetch } from "undici";

export interface Device {
  accountName: string;
  serialNumber: string;
  deviceType: string;
  deviceFamily: string;
  deviceOwnerCustomerId: string;
  online: boolean;
  capabilities?: string[];
}

export interface Appliance {
  entityId: string;
  applianceId: string;
  friendlyName: string;
  friendlyDescription?: string;
  applianceTypes: string[];
  isReachable: boolean;
}

export interface Routine {
  automationId: string;
  name: string;
  sequence: unknown;
  status?: string;
  type?: string;
}

export interface ClientOptions {
  refreshToken: string;
  domain?: Domain;
}

export class AlexaClient {
  private creds: AlexaCredentials | null = null;
  private readonly refreshToken: string;
  private readonly domain: Domain;

  constructor(options: ClientOptions) {
    this.refreshToken = options.refreshToken;
    this.domain = options.domain ?? "amazon.co.uk";
  }

  private async ensureAuth(): Promise<AlexaCredentials> {
    if (this.creds) return this.creds;
    this.creds = await authenticate({
      refreshToken: this.refreshToken,
      domain: this.domain,
    });
    return this.creds;
  }

  private async get(
    url: string,
    base: "layla" | "alexa" = "layla"
  ): Promise<unknown> {
    const creds = await this.ensureAuth();
    const config = getConfig(this.domain);
    const baseUrl = base === "layla" ? config.laylaBase : config.alexaBase;
    const res = await fetch(`${baseUrl}${url}`, {
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return (await res.json()) as unknown;
  }

  private async post(
    url: string,
    body: unknown,
    base: "layla" | "alexa" = "layla"
  ): Promise<unknown> {
    const creds = await this.ensureAuth();
    const config = getConfig(this.domain);
    const baseUrl = base === "layla" ? config.laylaBase : config.alexaBase;
    const res = await fetch(`${baseUrl}${url}`, {
      method: "POST",
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return (await res.json()) as unknown;
  }

  private async put(url: string, body: unknown): Promise<unknown> {
    const creds = await this.ensureAuth();
    const config = getConfig(this.domain);
    const res = await fetch(`${config.laylaBase}${url}`, {
      method: "PUT",
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return (await res.json()) as unknown;
  }

  async getDevices(): Promise<Device[]> {
    const data = (await this.get("/api/devices-v2/device?cached=true")) as {
      devices?: Device[];
    };
    return data.devices ?? [];
  }

  async resolveDevice(deviceQuery: string): Promise<Device | null> {
    const devices = await this.getDevices();
    const q = deviceQuery.toLowerCase().trim();
    const bySerial = devices.find((d) => d.serialNumber === deviceQuery);
    if (bySerial) return bySerial;
    const byName = devices.find((d) =>
      d.accountName.toLowerCase().includes(q)
    );
    if (byName) return byName;
    return null;
  }

  async speak(
    deviceSerial: string,
    deviceType: string,
    customerId: string,
    text: string
  ): Promise<void> {
    const config = getConfig(this.domain);
    const sequence = {
      "@type": "com.amazon.alexa.behaviors.model.Sequence",
      startNode: {
        "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
        type: "Alexa.Speak",
        operationPayload: {
          deviceType,
          deviceSerialNumber: deviceSerial,
          customerId,
          locale: config.locale,
          textToSpeak: text,
        },
      },
    };
    await this.post("/api/behaviors/preview", {
      behaviorId: "PREVIEW",
      sequenceJson: JSON.stringify(sequence),
      status: "ENABLED",
    });
  }

  async announce(customerId: string, text: string): Promise<void> {
    const config = getConfig(this.domain);
    const sequence = {
      "@type": "com.amazon.alexa.behaviors.model.Sequence",
      startNode: {
        "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
        type: "AlexaAnnouncement",
        operationPayload: {
          expireAfter: "PT5S",
          content: [
            {
              locale: config.locale,
              display: { title: "Announcement", body: text },
              speak: { type: "text", value: text },
            },
          ],
          target: { customerId },
        },
      },
    };
    await this.post("/api/behaviors/preview", {
      behaviorId: "PREVIEW",
      sequenceJson: JSON.stringify(sequence),
      status: "ENABLED",
    });
  }

  async command(
    deviceSerial: string,
    deviceType: string,
    customerId: string,
    text: string
  ): Promise<void> {
    const config = getConfig(this.domain);
    const sequence = {
      "@type": "com.amazon.alexa.behaviors.model.Sequence",
      startNode: {
        "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
        type: "Alexa.TextCommand",
        skillId: "amzn1.ask.1p.tellalexa",
        operationPayload: {
          deviceType,
          deviceSerialNumber: deviceSerial,
          customerId,
          locale: config.locale,
          text,
        },
      },
    };
    await this.post("/api/behaviors/preview", {
      behaviorId: "PREVIEW",
      sequenceJson: JSON.stringify(sequence),
      status: "ENABLED",
    });
  }

  async listAppliances(): Promise<Appliance[]> {
    const data = (await this.get("/api/phoenix")) as {
      networkDetail?: Array<{
        applianceDetails?: Record<
          string,
          {
            entityId: string;
            applianceId: string;
            friendlyName: string;
            friendlyDescription?: string;
            applianceTypes: string[];
            isReachable: boolean;
          }
        >;
      }>;
    };
    const out: Appliance[] = [];
    for (const nd of data.networkDetail ?? []) {
      for (const k of Object.keys(nd.applianceDetails ?? {})) {
        const a = nd.applianceDetails![k];
        out.push({
          entityId: a.entityId,
          applianceId: a.applianceId,
          friendlyName: a.friendlyName,
          friendlyDescription: a.friendlyDescription,
          applianceTypes: a.applianceTypes,
          isReachable: a.isReachable,
        });
      }
    }
    return out;
  }

  async controlAppliance(
    entityId: string,
    action: "turnOn" | "turnOff" | "setBrightness",
    brightness?: number
  ): Promise<void> {
    const params: Record<string, unknown> = { action };
    if (action === "setBrightness") {
      if (brightness === undefined)
        throw new Error("brightness required for setBrightness");
      params.brightness = brightness;
    }
    await this.put("/api/phoenix/state", {
      controlRequests: [
        {
          entityId,
          entityType: "APPLIANCE",
          parameters: params,
        },
      ],
    });
  }

  async setBrightness(entityId: string, brightness: number): Promise<void> {
    await this.put("/api/phoenix/state", {
      controlRequests: [
        {
          entityId,
          entityType: "APPLIANCE",
          parameters: { action: "setBrightness", brightness },
        },
      ],
    });
  }

  async listRoutines(): Promise<Routine[]> {
    const data = (await this.get("/api/behaviors/v2/automations", "alexa")) as
      | Routine[]
      | { automations?: Routine[] };
    if (Array.isArray(data)) return data;
    return data.automations ?? [];
  }

  async runRoutine(automationId: string, sequenceJson: string): Promise<void> {
    await this.post("/api/behaviors/preview", {
      behaviorId: automationId,
      sequenceJson,
      status: "ENABLED",
    });
  }
}
