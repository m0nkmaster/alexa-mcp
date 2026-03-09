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
  /** GraphQL endpoint ID (amzn1.alexa.endpoint.*) when available from layout; used for eu-api control */
  endpointId?: string;
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

  /** Low-level app API request (eu-api / na-api). */
  private async request<T = unknown>(opts: {
    method: "GET" | "POST" | "PUT";
    url: string;
    body?: unknown;
    throwOnError: boolean;
    errorPrefix?: string;
    extraHeaders?: Record<string, string>;
  }): Promise<T> {
    const config = getConfig(this.domain);
    const creds = await this.ensureAuth();
    const fullUrl = `${config.appApiBase.replace(/\/$/, "")}${opts.url.startsWith("/") ? opts.url : "/" + opts.url}`;
    const headers: Record<string, string> = {
      Cookie: creds.cookies,
      csrf: creds.csrf,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...opts.extraHeaders,
    };
    const init: RequestInit = {
      method: opts.method,
      headers,
    };
    if (opts.body !== undefined && opts.method !== "GET") {
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(fullUrl, init as import("undici").RequestInit);
    const text = await res.text();
    if (!res.ok) {
      if (process.env.ALEXA_DEBUG) {
        console.error(`[alexa-mcp] ${opts.method} ${fullUrl} → ${res.status}: ${text.slice(0, 200)}`);
      }
      if (opts.throwOnError) {
        const prefix = opts.errorPrefix ?? "API error ";
        throw new Error(`${prefix}${res.status}: ${text.slice(0, 200)}`);
      }
      return {} as T;
    }
    if (!text.trim()) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  /** GET from app API. Returns {} on failure (non-throwing). */
  private async getFromAppApi(url: string): Promise<unknown> {
    return this.request({ method: "GET", url, throwOnError: false });
  }

  /** GET app endpoint. Throws on failure. */
  private async getApp(url: string): Promise<unknown> {
    return this.request({ method: "GET", url, throwOnError: true });
  }

  /** POST app endpoint. Throws on failure. */
  private async postApp(url: string, body: unknown): Promise<unknown> {
    return this.request({ method: "POST", url, body, throwOnError: true });
  }

  /** PUT app endpoint. Throws on failure. */
  private async putApp(url: string, body: unknown): Promise<unknown> {
    return this.request({ method: "PUT", url, body, throwOnError: true });
  }

  /** POST to app API (e.g. control-media-session). Throws on failure. */
  private async postFromAppApi(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown }> {
    const data = await this.request<unknown>({
      method: "POST",
      url,
      body,
      throwOnError: true,
      errorPrefix: "Media API error ",
    });
    return { ok: true, data };
  }

  /**
   * GET /api/smarthome/v1/presentation/devices/control — layout IDs to capabilities.
   * Returns layout keys (endpoint IDs like amzn1.alexa.endpoint.*) when available.
   */
  private async fetchLayouts(): Promise<string[]> {
    try {
      const data = (await this.getFromAppApi(
        "/api/smarthome/v1/presentation/devices/control"
      )) as { layouts?: Record<string, unknown> };
      const layouts = data?.layouts;
      if (layouts && typeof layouts === "object") {
        return Object.keys(layouts);
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * POST /nexus/v1/graphql (eu-api) — power/brightness control. Uses endpointId (amzn1.alexa.endpoint.*).
   */
  private async graphqlControl(
    endpointId: string,
    action: "turnOn" | "turnOff" | "setBrightness",
    brightness?: number
  ): Promise<void> {
    if (action === "setBrightness") {
      if (brightness === undefined) throw new Error("brightness required for setBrightness");
      await this.postApp("/nexus/v1/graphql", {
        operationName: "setBrightness",
        variables: {
          featureControlRequests: [
            {
              endpointId,
              featureName: "brightness",
              featureOperationName: "setBrightness",
              payload: { brightness },
            },
          ],
        },
        query: "mutation setBrightness($featureControlRequests: [FeatureControlRequestInput!]!) { setBrightness(featureControlRequests: $featureControlRequests) }",
      });
      return;
    }
    await this.postApp("/nexus/v1/graphql", {
      operationName: "updatePowerFeatureForEndpoints",
      variables: {
        featureControlRequests: [
          {
            endpointId,
            featureName: "power",
            featureOperationName: action === "turnOn" ? "turnOn" : "turnOff",
          },
        ],
      },
      query: "mutation updatePowerFeatureForEndpoints($featureControlRequests: [FeatureControlRequestInput!]!) { updatePowerFeatureForEndpoints(featureControlRequests: $featureControlRequests) }",
    });
  }

  /**
   * POST /api/smarthome/v2/endpoints — used by the Alexa app for device list.
   * Returns endpoints array; names may be encrypted (we use serialNumber as display when missing).
   */
  private async fetchSmarthomeV2Endpoints(): Promise<{ data: unknown; status: number }> {
    const config = getConfig(this.domain);
    const creds = await this.ensureAuth();
    const url = `${config.appApiBase.replace(/\/$/, "")}/api/smarthome/v2/endpoints`;
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

  async getDevices(): Promise<Device[]> {
    const data = (await this.getFromAppApi("/api/devices-v2/device?cached=true")) as { devices?: Device[] };
    return data?.devices ?? [];
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
    await this.postApp("/api/behaviors/preview", {
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
    await this.postApp("/api/behaviors/preview", {
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
    await this.postApp("/api/behaviors/preview", {
      behaviorId: "PREVIEW",
      sequenceJson: JSON.stringify(sequence),
      status: "ENABLED",
    });
  }

  async listAppliances(): Promise<Appliance[]> {
    const parseSmarthomeV2Response = (
      data: unknown,
      endpointIds?: string[]
    ): Appliance[] => {
      const d = data as {
        endpoints?: Array<{
          __type?: string;
          identifier?: { deviceType?: string; deviceSerialNumber?: string };
          serialNumber?: string;
          deviceType?: string;
          deviceAccountId?: string;
          deviceOwnerCustomerId?: string;
        }>;
      };
      const endpoints = d.endpoints ?? [];
      return endpoints.map((ep, i) => {
        const serial = ep.serialNumber ?? ep.identifier?.deviceSerialNumber ?? "";
        const deviceType = ep.deviceType ?? ep.identifier?.deviceType ?? "";
        const endpointId = endpointIds && i < endpointIds.length ? endpointIds[i] : undefined;
        return {
          entityId: endpointId ?? serial,
          endpointId,
          applianceId: ep.deviceAccountId ?? serial,
          friendlyName: serial,
          applianceTypes: deviceType ? [deviceType] : [],
          isReachable: true,
        };
      });
    };

    const r = await this.fetchSmarthomeV2Endpoints();
    if (r.status !== 200) return [];
    const endpoints = (r.data as { endpoints?: unknown[] })?.endpoints ?? [];
    const layoutIds = await this.fetchLayouts();
    const useLayoutIds =
      layoutIds.length === endpoints.length &&
      layoutIds.every((id) => id.startsWith("amzn1."));
    return parseSmarthomeV2Response(r.data, useLayoutIds ? layoutIds : undefined);
  }

  async controlAppliance(
    entityId: string,
    action: "turnOn" | "turnOff" | "setBrightness",
    brightness?: number
  ): Promise<void> {
    const useGraphql = entityId.startsWith("amzn1.alexa.endpoint.");
    if (useGraphql) {
      await this.graphqlControl(entityId, action, brightness);
      return;
    }
    const params: Record<string, unknown> = { action };
    if (action === "setBrightness") {
      if (brightness === undefined)
        throw new Error("brightness required for setBrightness");
      params.brightness = brightness;
    }
    await this.putApp("/api/phoenix/state", {
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
    const useGraphql = entityId.startsWith("amzn1.alexa.endpoint.");
    if (useGraphql) {
      await this.graphqlControl(entityId, "setBrightness", brightness);
      return;
    }
    await this.putApp("/api/phoenix/state", {
      controlRequests: [
        {
          entityId,
          entityType: "APPLIANCE",
          parameters: { action: "setBrightness", brightness },
        },
      ],
    });
  }

  /** Get full automation (includes sequence) from app API. Used for run. */
  async getAutomation(automationId: string): Promise<{ automationId: string; name?: string; sequence?: unknown; sequenceJson?: string } | null> {
    try {
      const data = (await this.getApp(
        `/api/behaviors/automations/${encodeURIComponent(automationId)}`
      )) as { automationId?: string; name?: string; sequence?: unknown; sequenceJson?: string };
      if (!data?.automationId) return null;
      return {
        automationId: data.automationId,
        name: data.name,
        sequence: data.sequence,
        sequenceJson:
          typeof data.sequenceJson === "string"
            ? data.sequenceJson
            : data.sequence != null
              ? JSON.stringify(data.sequence)
              : undefined,
      };
    } catch {
      return null;
    }
  }

  async listRoutines(): Promise<Routine[]> {
    const data = (await this.getApp("/api/routines/routinesandgroups")) as {
      routines?: Array<{
        automationId?: string;
        primary?: string;
        secondary?: string;
        utterance?: string;
        utterances?: string[];
        status?: string;
        type?: string;
      }>;
    };
    const routines = data?.routines ?? [];
    return routines.map((r) => ({
      automationId: r.automationId ?? "",
      name: r.primary ?? r.secondary ?? "",
      sequence: undefined,
      status: r.status,
      type: r.type,
    }));
  }

  async runRoutine(automationId: string, sequenceJson?: string): Promise<void> {
    let payload = sequenceJson;
    if (!payload) {
      const automation = await this.getAutomation(automationId);
      payload = automation?.sequenceJson ?? automation?.sequence != null ? JSON.stringify(automation.sequence) : undefined;
      if (!payload) {
        throw new Error(`Could not get sequence for routine ${automationId}. Fetch automation failed or list did not include sequence.`);
      }
    }
    await this.postApp("/api/behaviors/preview", {
      behaviorId: automationId,
      sequenceJson: payload,
      status: "ENABLED",
    });
  }

  /** Media: now-playing state for a device. Returns taskSessionId when something is playing. */
  async getNowPlaying(
    deviceSerialNumber: string,
    deviceType: string
  ): Promise<{ taskSessionId?: string; [key: string]: unknown }> {
    const q = new URLSearchParams({
      deviceSerialNumber,
      deviceType,
      screenWidth: "375",
    });
    const data = (await this.getFromAppApi(
      `/api/np/player?${q.toString()}`
    )) as { taskSessionId?: string; [key: string]: unknown };
    return data ?? {};
  }

  /** Media: list active media sessions. */
  async listMediaSessions(): Promise<unknown> {
    return this.getFromAppApi("/api/np/list-media-sessions");
  }

  /** Media: transport control (play, pause, resume, stop, next, previous). */
  async controlMediaSession(
    device: Device,
    taskSessionId: string,
    command:
      | "play"
      | "pause"
      | "resume"
      | "stop"
      | "next"
      | "previous"
  ): Promise<void> {
    const commandTypes: Record<string, string> = {
      play: "NPPlayCommand",
      pause: "NPPauseCommand",
      resume: "NPResumeCommand",
      stop: "NPStopCommand",
      next: "NPNextCommand",
      previous: "NPPreviousCommand",
    };
    const typeName = commandTypes[command];
    if (!typeName) throw new Error(`Unknown media command: ${command}`);

    const controllerEndpoint = {
      __type: "NPSingletonEndpoint:1",
      id: {
        __type: "NPEndpointIdentifier:1",
        deviceSerialNumber: device.serialNumber,
        deviceType: device.deviceType,
      },
    };

    await this.postFromAppApi("/api/np/control-media-session", {
      taskSessionId,
      command: { type: typeName },
      controllerEndpoint,
    });
  }
}
