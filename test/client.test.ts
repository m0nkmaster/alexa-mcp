import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlexaClient } from "../src/client.js";

vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

vi.mock("../src/auth.js", () => ({
  authenticate: vi.fn().mockResolvedValue({
    cookies: "session-id=1; csrf=xyz",
    csrf: "xyz",
  }),
}));

const { fetch } = await import("undici");

/** Response-like mock: client uses res.text() then JSON.parse, so provide text(). */
function mockRes(body: unknown, ok = true): any {
  const str = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => str,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

describe("AlexaClient", () => {
  let client: AlexaClient;

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    client = new AlexaClient({ refreshToken: "Atnr|test" });
  });

  it("getDevices returns devices from API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        devices: [
          {
            accountName: "Office Echo",
            serialNumber: "G090",
            deviceType: "A1RAB",
            deviceFamily: "ECHO",
            deviceOwnerCustomerId: "ARK5DC",
            online: true,
          },
        ],
      })
    );

    const devices = await client.getDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].accountName).toBe("Office Echo");
    expect(devices[0].serialNumber).toBe("G090");
  });

  it("resolveDevice finds device by name", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        devices: [
          {
            accountName: "Office Echo",
            serialNumber: "G090",
            deviceType: "A1RAB",
            deviceFamily: "ECHO",
            deviceOwnerCustomerId: "ARK5DC",
            online: true,
          },
        ],
      })
    );

    const d = await client.resolveDevice("Office");

    expect(d).not.toBeNull();
    expect(d!.accountName).toBe("Office Echo");
  });

  it("resolveDevice returns null when not found", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        devices: [
          {
            accountName: "Office Echo",
            serialNumber: "G090",
            deviceType: "A1RAB",
            deviceFamily: "ECHO",
            deviceOwnerCustomerId: "ARK5DC",
            online: true,
          },
        ],
      })
    );

    const d = await client.resolveDevice("nonexistent");

    expect(d).toBeNull();
  });

  it("listAppliances returns appliances from v2/endpoints when eu-api", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        endpoints: [
          {
            serialNumber: "s1",
            deviceType: "LIGHT",
            deviceAccountId: "a1",
          },
        ],
      })
    );
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({ layouts: {} })); // no layout IDs to attach

    const appliances = await client.listAppliances();

    expect(appliances).toHaveLength(1);
    expect(appliances[0].friendlyName).toBe("s1");
    expect(appliances[0].entityId).toBe("s1");
  });

  it("listAppliances returns empty when eu-api v2 returns no endpoints", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({ endpoints: [] }));
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({ layouts: {} }));

    const appliances = await client.listAppliances();

    expect(appliances).toHaveLength(0);
  });

  it("getVolume returns volume from API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({ volume: 50, muted: false }));

    const vol = await client.getVolume("A1RABVCI4QCIKC", "G090XG123");

    expect(vol.volume).toBe(50);
    expect(vol.muted).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/devices/A1RABVCI4QCIKC/G090XG123/audio/v2/volume"),
      expect.any(Object)
    );
  });

  it("getVolume returns 0 when API returns empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({}));

    const vol = await client.getVolume("A1RABVCI4QCIKC", "G090XG123");

    expect(vol.volume).toBe(0);
  });

  it("setVolume calls PUT with correct body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({}));

    await client.setVolume("A1RABVCI4QCIKC", "G090XG123", 75);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/devices/A1RABVCI4QCIKC/G090XG123/audio/v2/speakerVolume"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ volume: 75 }),
      })
    );
  });

  it("getBrightnessState returns brightness from GraphQL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        data: {
          endpoint: {
            id: "amzn1.alexa.endpoint.abc123",
            features: [
              { name: "brightness", brightness: { value: 75 } },
              { name: "power", powerState: { value: "ON" } },
            ],
          },
        },
      })
    );

    const state = await client.getBrightnessState("amzn1.alexa.endpoint.abc123");

    expect(state.brightness).toBe(75);
    expect(state.powerState).toBe("ON");
  });

  it("getBrightnessState returns empty object on API error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockRes({ errors: ["not found"] }, false));

    const state = await client.getBrightnessState("amzn1.alexa.endpoint.unknown");

    expect(state.brightness).toBeUndefined();
    expect(state.powerState).toBeUndefined();
  });

  it("listAppliances returns appliances from app API (US)", async () => {
    const usClient = new AlexaClient({ refreshToken: "Atnr|test", domain: "amazon.com" });
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        endpoints: [
          {
            serialNumber: "s1",
            deviceType: "LIGHT",
            deviceAccountId: "a1",
            __type: "DmsEndpoint",
          },
        ],
      })
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockRes({
        layouts: {
          "layout-uuid": {
            template: {
              header: { primaryItem: { interfaceName: "Alexa.PowerController" } },
            },
          },
        },
      })
    );

    const appliances = await usClient.listAppliances();

    expect(appliances).toHaveLength(1);
    expect(appliances[0].entityId).toBe("s1");
    expect(appliances[0].friendlyName).toBe("s1");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("na-api-alexa.amazon.com"),
      expect.any(Object)
    );
  });
});
