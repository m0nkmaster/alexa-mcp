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
  /** Amazon customer ID of the account that owns this device (for profile matching) */
  deviceOwnerCustomerId?: string;
}

export interface Routine {
  automationId: string;
  name: string;
  sequence: unknown;
  status?: string;
  type?: string;
}

export interface DeviceGroup {
  name: string;
  groupId: string;
  type: string;
  applianceCount: number;
}

export interface DeviceGroupWithAppliances extends DeviceGroup {
  /** Chr entity IDs (UUIDs) for direct control; use as amzn1.alexa.endpoint.{id} for GraphQL. */
  chrEntityIds: string[];
}

export interface AudioGroup {
  id: string;
  name: string;
  members: Array<{ deviceType: string; dsn: string; speakerChannel: string }>;
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
   * Uses setEndpointFeatures mutation (matches Alexa mobile app); updatePowerFeatureForEndpoints can fail silently.
   */
  private async graphqlControl(
    endpointId: string,
    action: "turnOn" | "turnOff" | "setBrightness",
    brightness?: number
  ): Promise<void> {
    if (action === "setBrightness") {
      if (brightness === undefined) throw new Error("brightness required for setBrightness");
      await this.postGraphql({
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
    const featureOp = action === "turnOn" ? "turnOn" : "turnOff";
    await this.postGraphql({
      operationName: "setPower",
      variables: {
        endpointId,
        featureOperationName: featureOp,
      },
      query:
        "mutation setPower($endpointId: String, $featureOperationName: FeatureOperationName!) { setEndpointFeatures(setEndpointFeaturesInput: {featureControlRequests: [{endpointId: $endpointId, featureName: power, featureOperationName: $featureOperationName}]}) { featureControlResponses { code endpointId featureOperationName __typename } errors { code message featureOperationName __typename } __typename } }",
    });
  }

  /** POST to nexus/v1/graphql with app-like headers (matches Alexa mobile app). */
  private async postGraphql(body: { operationName: string; variables: Record<string, unknown>; query: string }): Promise<unknown> {
    return this.request({
      method: "POST",
      url: "/nexus/v1/graphql",
      body,
      throwOnError: true,
      errorPrefix: "GraphQL ",
      extraHeaders: this.graphqlHeaders(),
    });
  }

  /** Batch GraphQL requests (array of operations); used for fetching friendly names. */
  private async postGraphqlBatch(
    bodies: Array<{ operationName: string; variables: Record<string, unknown>; query: string }>
  ): Promise<unknown[]> {
    if (bodies.length === 0) return [];
    const result = await this.request<unknown[]>({
      method: "POST",
      url: "/nexus/v1/graphql",
      body: bodies,
      throwOnError: true,
      errorPrefix: "GraphQL batch ",
      extraHeaders: this.graphqlHeaders(),
    });
    return Array.isArray(result) ? result : [];
  }

  private graphqlHeaders(): Record<string, string> {
    return {
      "x-amzn-client": "AlexaApp",
      "x-amzn-build-version": "2.2.706594",
      "x-amzn-os-name": "ios",
      "x-amzn-devicetype": "phone",
      "x-amzn-devicetype-id": "A2IVLV5VM2W81",
      "x-amzn-marketplace-id": "A1F83G8C2ARO7P",
      "User-Agent": "Alexa/2.2.706594 CFNetwork/3860.500.111 Darwin/25.4.0",
      Accept: "*/*",
    };
  }

  /** GraphQL ControlPageBanner query returns friendlyNameObject.value.text. */
  private static readonly FRIENDLY_NAME_QUERY = `query ControlPageBanner($endpointId: String!) {
    endpoint(id: $endpointId) {
      id
      friendlyNameObject { value { text __typename } __typename }
      __typename
    }
  }`;

  /** Batch-fetch friendly names for endpoint IDs. Returns map endpointId -> friendlyName. */
  private async fetchFriendlyNames(endpointIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const amzn = endpointIds.filter((id) => id.startsWith("amzn1."));
    if (amzn.length === 0) return map;
    const bodies = amzn.map((endpointId) => ({
      operationName: "ControlPageBanner",
      variables: { endpointId },
      query: AlexaClient.FRIENDLY_NAME_QUERY,
    }));
    const results = await this.postGraphqlBatch(bodies);
    for (let i = 0; i < amzn.length; i++) {
      const r = results[i] as { data?: { endpoint?: { friendlyNameObject?: { value?: { text?: string } } } } } | undefined;
      const text = r?.data?.endpoint?.friendlyNameObject?.value?.text;
      if (text) map.set(amzn[i], text);
    }
    return map;
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
    const r = await this.fetchSmarthomeV2Endpoints();
    const rawLayoutKeys = await this.fetchLayouts();
    const layoutIds = rawLayoutKeys
      .filter((id) => id.startsWith("amzn1.") || /^[0-9a-f-]{36}$/i.test(id))
      .map((id) => (id.startsWith("amzn1.") ? id : `amzn1.alexa.endpoint.${id}`));

    const parseSmarthomeV2Response = (
      data: unknown,
      endpointIds?: string[],
      friendlyNames?: Map<string, string>
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
        const friendlyName =
          (endpointId && friendlyNames?.get(endpointId)) ?? serial;
        return {
          entityId: endpointId ?? serial,
          endpointId,
          applianceId: ep.deviceAccountId ?? serial,
          friendlyName,
          applianceTypes: deviceType ? [deviceType] : [],
          isReachable: true,
          deviceOwnerCustomerId: ep.deviceOwnerCustomerId,
        };
      });
    };

    const endpoints = (r.data as { endpoints?: unknown[] })?.endpoints ?? [];
    const useLayoutIds =
      layoutIds.length === endpoints.length && layoutIds.length > 0;

    if (r.status !== 200) {
      if (layoutIds.length === 0) return [];
      const friendlyNames = await this.fetchFriendlyNames(layoutIds);
      return layoutIds.map((endpointId) => ({
        entityId: endpointId,
        endpointId,
        applianceId: endpointId,
        friendlyName: friendlyNames.get(endpointId) ?? endpointId,
        applianceTypes: [] as string[],
        isReachable: true,
      }));
    }

    let appliances: Appliance[];
    if (useLayoutIds) {
      const friendlyNames = await this.fetchFriendlyNames(layoutIds);
      appliances = parseSmarthomeV2Response(r.data, layoutIds, friendlyNames);
    } else if (layoutIds.length > 0) {
      const friendlyNames = await this.fetchFriendlyNames(layoutIds);
      appliances = layoutIds.map((endpointId) => ({
        entityId: endpointId,
        endpointId,
        applianceId: endpointId,
        friendlyName: friendlyNames.get(endpointId) ?? endpointId,
        applianceTypes: [] as string[],
        isReachable: true,
      }));
    } else {
      appliances = parseSmarthomeV2Response(r.data);
    }
    return appliances;
  }

  /** Resolve smart home device by friendly name (case-insensitive partial match). Prefer direct GraphQL control. */
  async resolveApplianceByName(name: string): Promise<Appliance | null> {
    const appliances = await this.listAppliances();
    const q = name.toLowerCase().trim();
    const match = appliances.find((a) => {
      const fn = a.friendlyName?.toLowerCase() ?? "";
      return fn.includes(q) || q.includes(fn);
    });
    return match ?? null;
  }

  /**
   * Resolve smart home devices by pattern (e.g. "kitchen lights").
   * Matches appliances whose friendlyName contains all space-separated words (case-insensitive).
   * "lights" also matches "light" and vice versa. Returns all matches for room/group control.
   */
  async resolveAppliancesByPattern(pattern: string): Promise<Appliance[]> {
    const appliances = await this.listAppliances();
    const words = pattern.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const matchWord = (fn: string, w: string): boolean => {
      if (fn.includes(w)) return true;
      if (w.endsWith("s") && fn.includes(w.slice(0, -1))) return true; // "lights" → "light"
      if (!w.endsWith("s") && fn.includes(w + "s")) return true; // "light" → "lights"
      return false;
    };
    return appliances.filter((a) => {
      const fn = a.friendlyName?.toLowerCase() ?? "";
      return words.every((w) => matchWord(fn, w));
    });
  }

  /**
   * Control all appliances matching a pattern (e.g. "kitchen lights").
   * Uses direct GraphQL/phoenix control—avoids profile/account issues from voice commands.
   * Returns names of controlled devices and any errors.
   */
  async controlAppliancesByPattern(
    pattern: string,
    action: "turnOn" | "turnOff"
  ): Promise<{ controlled: string[]; errors: string[] }> {
    const appliances = await this.resolveAppliancesByPattern(pattern);
    const id = (a: Appliance) => a.endpointId ?? a.entityId;
    const targets = appliances
      .map((a) => ({ eid: id(a), name: a.friendlyName ?? a.entityId }))
      .filter((t): t is { eid: string; name: string } => !!t.eid);
    const errors = appliances
      .filter((a) => !id(a))
      .map((a) => `${a.friendlyName ?? "?"}: no endpointId/entityId`);
    const results = await Promise.allSettled(targets.map((t) => this.controlAppliance(t.eid, action)));
    const controlled: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") controlled.push(targets[i].name);
      else errors.push(`${targets[i].name}: ${String(r.reason)}`);
    });
    return { controlled, errors };
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

  /** GET /api/phoenix/group — room/space groups (Living room, Kitchen, etc.) with appliance membership. */
  async listDeviceGroups(): Promise<DeviceGroup[]> {
    const groups = await this.listDeviceGroupsWithAppliances();
    return groups.map(({ chrEntityIds, ...g }) => ({ ...g, applianceCount: chrEntityIds.length }));
  }

  /** Like listDeviceGroups but includes chrEntityIds for each group (from chrEndpoints). */
  async listDeviceGroupsWithAppliances(): Promise<DeviceGroupWithAppliances[]> {
    const data = (await this.getApp("/api/phoenix/group")) as {
      applianceGroups?: Array<{
        name?: string;
        groupId?: string;
        type?: string;
        chrEndpoints?: Array<{ entityId?: string }>;
      }>;
    };
    const groups = data?.applianceGroups ?? [];
    return groups.map((g) => {
      const chrEntityIds = (g.chrEndpoints ?? [])
        .map((e) => e.entityId)
        .filter((id): id is string => !!id);
      return {
        name: g.name ?? "",
        groupId: g.groupId ?? "",
        type: g.type ?? "SPACE",
        applianceCount: chrEntityIds.length,
        chrEntityIds,
      };
    });
  }

  /**
   * Control appliances in a room/space group by name (e.g. "Kitchen").
   * Uses chrEntityIds from phoenix group → amzn1.alexa.endpoint.{id} for GraphQL.
   * lightsOnly (default true) filters to devices with light/lamp/bulb in friendlyName when available.
   */
  async controlAppliancesByGroup(
    groupName: string,
    action: "turnOn" | "turnOff",
    options?: { lightsOnly?: boolean }
  ): Promise<{ controlled: string[]; errors: string[] }> {
    const groups = await this.listDeviceGroupsWithAppliances();
    const q = groupName.toLowerCase().trim();
    const group = groups.find((g) => g.name.toLowerCase() === q || g.name.toLowerCase().includes(q));
    if (!group) {
      throw new Error(`Group not found: "${groupName}". Use list_device_groups to see groups.`);
    }
    const appliances = await this.listAppliances();
    const uuidToAppliance = new Map<string, Appliance>();
    for (const a of appliances) {
      const eid = a.endpointId ?? a.entityId;
      if (eid) {
        const uuid = eid.startsWith("amzn1.alexa.endpoint.") ? eid.replace("amzn1.alexa.endpoint.", "") : eid;
        uuidToAppliance.set(uuid.toLowerCase(), a);
      }
    }
    const lightsOnly = options?.lightsOnly ?? true;
    const lightRe = /light|lamp|bulb/i;
    const targets: { endpointId: string; name: string }[] = [];
    for (const chrId of group.chrEntityIds) {
      const app = uuidToAppliance.get(chrId.toLowerCase());
      const name = app?.friendlyName ?? chrId;
      if (lightsOnly && app && !lightRe.test(name)) continue; // skip non-lights when we have friendlyName
      const endpointId = chrId.includes(".") ? chrId : `amzn1.alexa.endpoint.${chrId}`;
      targets.push({ endpointId, name });
    }
    const results = await Promise.allSettled(
      targets.map((t) => this.controlAppliance(t.endpointId, action))
    );
    const controlled: string[] = [];
    const errors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") controlled.push(targets[i].name);
      else errors.push(`${targets[i].name}: ${String(r.reason)}`);
    });
    return { controlled, errors };
  }

  /** GET /api/wholeHomeAudio/v1/groups — multi-room audio speaker groups (Downstairs, Everywhere, etc.). */
  async listAudioGroups(): Promise<AudioGroup[]> {
    const data = (await this.getApp("/api/wholeHomeAudio/v1/groups")) as {
      groups?: Array<{ id?: string; name?: string; members?: Array<{ deviceType?: string; dsn?: string; speakerChannel?: string }> }>;
    };
    const groups = data?.groups ?? [];
    return groups.map((g) => ({
      id: g.id ?? "",
      name: g.name ?? "",
      members: (g.members ?? []).map((m) => ({
        deviceType: m.deviceType ?? "",
        dsn: m.dsn ?? "",
        speakerChannel: m.speakerChannel ?? "all",
      })),
    }));
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
