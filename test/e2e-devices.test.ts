import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execCli } from "./e2e-harness.js";

const LAMP = "Lounge Lamp";
const ECHO = "Lounge Echo";
const GROUP = "Living Room";

const TEST_TIMEOUT = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


describe.skipIf(!process.env.TEST_INTEGRATION)("e2e device control", () => {
  beforeAll(async () => {
    const { stdout, stderr, code } = await execCli(["auth", "status", "--verify"]);
    const out = stdout + stderr;
    if (code !== 0 || !out.includes("Status: valid")) {
      throw new Error(
        `E2E requires valid Alexa credentials.\n` +
          `Run: alexa-mcp auth\n` +
          `Or:  ALEXA_REFRESH_TOKEN=<token> npm run test:e2e:devices\n` +
          `auth status output: ${out.trim()}`
      );
    }
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Device discovery
  // ---------------------------------------------------------------------------
  describe("device discovery", () => {
    it(
      `'${ECHO}' appears in devices list`,
      async () => {
        const { stdout, code } = await execCli(["devices"]);
        expect(code).toBe(0);
        const devices = JSON.parse(stdout.trim()) as Array<{ accountName: string }>;
        const found = devices.some((d) =>
          d.accountName.toLowerCase().includes(ECHO.toLowerCase())
        );
        expect(found, `Expected to find "${ECHO}" in devices`).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      `'${LAMP}' appears in appliances list`,
      async () => {
        const { stdout, code } = await execCli(["appliances"]);
        expect(code).toBe(0);
        const appliances = JSON.parse(stdout.trim()) as Array<{ friendlyName: string }>;
        const found = appliances.some((a) =>
          a.friendlyName.toLowerCase().includes(LAMP.toLowerCase())
        );
        expect(found, `Expected to find "${LAMP}" in appliances`).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      `'${GROUP}' appears in groups list`,
      async () => {
        const { stdout, code } = await execCli(["groups"]);
        expect(code).toBe(0);
        const groups = JSON.parse(stdout.trim()) as Array<{ name: string }>;
        const found = groups.some((g) =>
          g.name.toLowerCase().includes(GROUP.toLowerCase())
        );
        expect(found, `Expected to find "${GROUP}" in groups`).toBe(true);
      },
      TEST_TIMEOUT
    );
  });

  // ---------------------------------------------------------------------------
  // Lounge Lamp — plug socket on/off
  // ---------------------------------------------------------------------------
  describe(`${LAMP} (plug socket)`, () => {
    it(
      "turns on",
      async () => {
        const { stdout, stderr, code } = await execCli(["switch", LAMP, "on"]);
        expect(code, stderr).toBe(0);
        const out = stdout + stderr;
        expect(out).toMatch(/turnOn|turn on|done/i);
      },
      TEST_TIMEOUT
    );

    it(
      "turns off",
      async () => {
        await sleep(2_000);
        const { stdout, stderr, code } = await execCli(["switch", LAMP, "off"]);
        expect(code, stderr).toBe(0);
        const out = stdout + stderr;
        expect(out).toMatch(/turnOff|turn off|done/i);
      },
      TEST_TIMEOUT
    );
  });

  // ---------------------------------------------------------------------------
  // Living Room group — on/off all lights/lamps
  // ---------------------------------------------------------------------------
  describe(`${GROUP} (group)`, () => {
    it(
      "turns on all lights in group",
      async () => {
        const { stdout, stderr, code } = await execCli(["switch-group", GROUP, "on"]);
        expect(code, stderr).toBe(0);
        const out = stdout + stderr;
        expect(out).toMatch(/turnOn/i);
      },
      TEST_TIMEOUT
    );

    it(
      "turns off all lights in group",
      async () => {
        await sleep(2_000);
        const { stdout, stderr, code } = await execCli(["switch-group", GROUP, "off"]);
        expect(code, stderr).toBe(0);
        const out = stdout + stderr;
        expect(out).toMatch(/turnOff/i);
      },
      TEST_TIMEOUT
    );
  });

  // ---------------------------------------------------------------------------
  // Lounge Echo — TTS
  // ---------------------------------------------------------------------------
  describe(`${ECHO} (TTS)`, () => {
    it(
      "speaks text",
      async () => {
        const { stdout, stderr, code } = await execCli([
          "speak",
          "Alexa MCP end to end test",
          "--device",
          ECHO,
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("Spoke on");
      },
      TEST_TIMEOUT
    );
  });

  // ---------------------------------------------------------------------------
  // Lounge Echo — music playback and media transport
  // ---------------------------------------------------------------------------
  describe(`${ECHO} (music playback)`, () => {
    beforeAll(async () => {
      // Start music and give Alexa time to begin playback before transport tests
      await execCli(["command", "play some jazz music", "--device", ECHO]);
      await sleep(5_000);
    }, 30_000);

    afterAll(async () => {
      // Best-effort cleanup — stop any active playback when the suite finishes
      await execCli(["command", "stop", "--device", ECHO]);
    }, 15_000);

    it(
      "sends voice command to play music",
      async () => {
        const { stdout, stderr, code } = await execCli([
          "command",
          "play some jazz music",
          "--device",
          ECHO,
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("Command sent to");
      },
      TEST_TIMEOUT
    );

    it(
      "now-playing returns JSON with device name",
      async () => {
        const { stdout, stderr, code } = await execCli(["now-playing", "--device", ECHO]);
        expect(code, stderr).toBe(0);
        const data = JSON.parse(stdout.trim()) as Record<string, unknown>;
        expect(typeof data).toBe("object");
        expect((data.device as string).toLowerCase()).toContain(
          ECHO.toLowerCase()
        );
      },
      TEST_TIMEOUT
    );

    it(
      "pauses music",
      async () => {
        const { stdout, stderr, code } = await execCli([
          "media",
          "pause",
          "--device",
          ECHO,
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("pause sent to");
      },
      TEST_TIMEOUT
    );

    it(
      "resumes music",
      async () => {
        await sleep(2_000);
        const { stdout, stderr, code } = await execCli([
          "media",
          "resume",
          "--device",
          ECHO,
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("resume sent to");
      },
      TEST_TIMEOUT
    );

    it(
      "stops music",
      async () => {
        await sleep(2_000);
        const { stdout, stderr, code } = await execCli([
          "command",
          "stop",
          "--device",
          ECHO,
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("Command sent to");
      },
      TEST_TIMEOUT
    );
  });

  // ---------------------------------------------------------------------------
  // Lounge Echo — announce
  // ---------------------------------------------------------------------------
  describe(`${ECHO} (announce)`, () => {
    beforeAll(async () => {
      // Rate-limit guard: behaviors/preview API enforces ~1 req/5s per account
      await sleep(5_000);
    }, 10_000);

    it(
      "sends announcement to all devices",
      async () => {
        const { stdout, stderr, code } = await execCli([
          "announce",
          "Alexa MCP test complete",
        ]);
        expect(code, stderr).toBe(0);
        expect(stdout + stderr).toContain("Announcement sent");
      },
      TEST_TIMEOUT
    );
  });
});
