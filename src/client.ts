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
    const text = await res.text();
    if (!text.trim()) {
      if (process.env.ALEXA_DEBUG) {
        console.error(
          `[alexa-mcp] GET ${baseUrl}${url} → ${res.status} (empty body)`
        );
      }
      return {};
    }
    return JSON.parse(text) as unknown;
  }

  /** GET from eu-api host when set (UK/EU app uses this). */
  private async getFromEuApi(url: string): Promise<unknown> {
    const config = getConfig(this.domain);
    if (!config.euApiBase) return {};
    const creds = await this.ensureAuth();
    const fullUrl = `${config.euApiBase.replace(/\/$/, "")}${url.startsWith("/") ? url : "/" + url}`;
    const res = await fetch(fullUrl, {
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!res.ok) return {};
    const text = await res.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }

  /** Fetch Phoenix (smart home) with optional locale/UA. Returns parsed JSON or {} on empty/299. */
  private async fetchPhoenix(base: "layla" | "alexa"): Promise<{ data: unknown; status: number; bodyLength: number }> {
    const config = getConfig(this.domain);
    const baseUrl = base === "layla" ? config.laylaBase : config.alexaBase;
    return this.fetchPhoenixAt(baseUrl);
  }

  /** Fetch Phoenix from an arbitrary base URL (e.g. eu-api-alexa.amazon.co.uk from app capture). */
  private async fetchPhoenixAt(baseUrl: string): Promise<{ data: unknown; status: number; bodyLength: number }> {
    const creds = await this.ensureAuth();
    const config = getConfig(this.domain);
    const url = `${baseUrl.replace(/\/$/, "")}/api/phoenix`;
    const res = await fetch(url, {
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": config.locale,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const text = await res.text();
    if (process.env.ALEXA_DEBUG) {
      console.error(`[alexa-mcp] GET ${url} → ${res.status} (body length ${text.length})`);
    }
    if (!res.ok) {
      return { data: {}, status: res.status, bodyLength: text.length };
    }
    if (!text.trim()) {
      return { data: {}, status: res.status, bodyLength: 0 };
    }
    try {
      return { data: JSON.parse(text) as unknown, status: res.status, bodyLength: text.length };
    } catch {
      return { data: {}, status: res.status, bodyLength: text.length };
    }
  }

  /**
   * POST /api/smarthome/v2/endpoints (eu-api-alexa) — used by the Alexa app for device list.
   * Returns endpoints array; names may be encrypted (we use serialNumber as display when missing).
   */
  private async fetchSmarthomeV2Endpoints(): Promise<{ data: unknown; status: number }> {
    const config = getConfig(this.domain);
    if (!config.euApiBase) {
      return { data: {}, status: 0 };
    }
    const creds = await this.ensureAuth();
    const url = `${config.euApiBase.replace(/\/$/, "")}/api/smarthome/v2/endpoints`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Cookie: creds.cookies,
        csrf: creds.csrf,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
        "Accept-Language": config.locale + "," + config.locale + ";q=1.0",
        "User-Agent": "AppleWebKit PitanguiBridge/2.2.706594.0 (iPhone; iOS)",
      },
      body: JSON.stringify({ endpointContexts: ["GROUP"] }),
    });
    const text = await res.text();
    if (process.env.ALEXA_DEBUG) {
      console.error(`[alexa-mcp] POST ${url} → ${res.status} (body length ${text.length})`);
    }
    if (!res.ok) {
      return { data: {}, status: res.status };
    }
    if (!text.trim()) {
      return { data: {}, status: res.status };
    }
    try {
      return { data: JSON.parse(text) as unknown, status: res.status };
    } catch {
      return { data: {}, status: res.status };
    }
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
    const text = await res.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as unknown;
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
    const text = await res.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as unknown;
  }

  async getDevices(): Promise<Device[]> {
    const config = getConfig(this.domain);
    if (config.euApiBase) {
      const data = (await this.getFromEuApi("/api/devices-v2/device?cached=true")) as { devices?: Device[] };
      const devices = data?.devices ?? [];
      if (devices.length > 0) return devices;
    }
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
    const parsePhoenixResponse = (data: unknown): Appliance[] => {
      const d = data as {
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
      for (const nd of d.networkDetail ?? []) {
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
    };

    const parseSmarthomeV2Response = (data: unknown): Appliance[] => {
      const d = data as { endpoints?: Array<{
        __type?: string;
        identifier?: { deviceType?: string; deviceSerialNumber?: string };
        serialNumber?: string;
        deviceType?: string;
        deviceAccountId?: string;
        deviceOwnerCustomerId?: string;
      }> };
      const endpoints = d.endpoints ?? [];
      return endpoints.map((ep) => {
        const serial = ep.serialNumber ?? ep.identifier?.deviceSerialNumber ?? "";
        const deviceType = ep.deviceType ?? ep.identifier?.deviceType ?? "";
        return {
          entityId: serial,
          applianceId: ep.deviceAccountId ?? serial,
          friendlyName: serial,
          applianceTypes: deviceType ? [deviceType] : [],
          isReachable: true,
        };
      });
    };

    const config = getConfig(this.domain);

    // 1) Try POST /api/smarthome/v2/endpoints (eu-api) — same as Alexa app (from HAR capture).
    if (config.euApiBase) {
      const r = await this.fetchSmarthomeV2Endpoints();
      if (r.status === 200) {
        const appliances = parseSmarthomeV2Response(r.data);
        if (appliances.length > 0) {
          return appliances;
        }
      }
    }

    // 2) Fall back to GET /api/phoenix on layla/alexa/eu-api.
    const basesToTry: string[] = [];
    if (config.euApiBase) basesToTry.push(config.euApiBase);
    const tryAlexaFirst = this.domain === "amazon.co.uk" || this.domain === "amazon.de";
    basesToTry.push(tryAlexaFirst ? config.alexaBase : config.laylaBase);
    basesToTry.push(tryAlexaFirst ? config.laylaBase : config.alexaBase);

    let data: unknown;
    let appliances = parsePhoenixResponse({});
    for (const baseUrl of basesToTry) {
      const r = await this.fetchPhoenixAt(baseUrl);
      data = r.data;
      appliances = parsePhoenixResponse(data);
      if (appliances.length > 0) break;
      const hasKeys = typeof data === "object" && data !== null && Object.keys(data).length > 0;
      if (hasKeys) break;
    }

    if (appliances.length === 0 && process.env.ALEXA_DEBUG) {
      console.error(
        "[alexa-mcp] appliances: 0 devices. Phoenix response keys:",
        typeof data === "object" && data !== null ? Object.keys(data) : data
      );
    }

    return appliances;
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
