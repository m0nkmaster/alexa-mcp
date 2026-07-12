/**
 * Shared CLI output helpers: structured JSON vs human text, structured errors.
 */

export type OutputMode = { json?: boolean };

/** Print a successful result as JSON (pretty) or a human one-liner. */
export function emitResult(
  data: Record<string, unknown>,
  opts: OutputMode,
  humanLine?: string
): void {
  if (opts.json || humanLine === undefined) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(humanLine);
}

/** Print a structured error to stderr (and optionally stdout as JSON), then exit. */
export function emitError(
  error: Record<string, unknown> & { error: string },
  exitCode = 1,
  opts?: OutputMode
): never {
  const payload = { ...error, success: false };
  if (opts?.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(JSON.stringify(payload));
  }
  process.exit(exitCode);
}

/** Prefer --json from command opts or global program opts. */
export function wantsJson(opts: { json?: boolean }, globalJson?: boolean): boolean {
  return Boolean(opts.json ?? globalJson);
}
