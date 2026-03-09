import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "../dist/cli.js");

export interface ExecCliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Run the alexa-mcp CLI with given args. Requires built dist.
 */
export function execCli(args: string[]): Promise<ExecCliResult> {
  return new Promise((resolve) => {
    const proc = spawn("node", [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code, signal) => {
      resolve({
        stdout,
        stderr,
        code: code ?? (signal ? -1 : 0),
      });
    });
    proc.on("error", (err) => {
      resolve({ stdout, stderr, code: -1 });
    });
  });
}
