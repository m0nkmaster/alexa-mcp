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
function mockRes(body: unknown, ok = true) {
  const str = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => str,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  } as Response;
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
