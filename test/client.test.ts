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

describe("AlexaClient", () => {
  let client: AlexaClient;

  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    client = new AlexaClient({ refreshToken: "Atnr|test" });
  });

  it("getDevices returns devices from API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
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
      }),
    } as Response);

    const devices = await client.getDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].accountName).toBe("Office Echo");
    expect(devices[0].serialNumber).toBe("G090");
  });

  it("resolveDevice finds device by name", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
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
      }),
    } as Response);

    const d = await client.resolveDevice("Office");

    expect(d).not.toBeNull();
    expect(d!.accountName).toBe("Office Echo");
  });

  it("resolveDevice returns null when not found", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
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
      }),
    } as Response);

    const d = await client.resolveDevice("nonexistent");

    expect(d).toBeNull();
  });

  it("listAppliances returns appliances from phoenix", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        networkDetail: [
          {
            applianceDetails: {
              key1: {
                entityId: "e1",
                applianceId: "a1",
                friendlyName: "Kitchen Light",
                applianceTypes: ["LIGHT"],
                isReachable: true,
              },
            },
          },
        ],
      }),
    } as Response);

    const appliances = await client.listAppliances();

    expect(appliances).toHaveLength(1);
    expect(appliances[0].friendlyName).toBe("Kitchen Light");
    expect(appliances[0].entityId).toBe("e1");
  });
});
