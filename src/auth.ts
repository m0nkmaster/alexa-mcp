import { getConfig, type Domain } from "./config.js";
import { fetch } from "undici";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AlexaCredentials {
  cookies: string;
  csrf: string;
}

export interface AuthOptions {
  refreshToken: string;
  domain?: Domain;
}

const CONFIG_PATH = join(homedir(), ".alexa-cli", "config.json");

export function loadRefreshToken(): string | null {
  const env = process.env.ALEXA_REFRESH_TOKEN;
  if (env) return env;
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return data.refresh_token ?? data.refreshToken ?? null;
  } catch {
    return null;
  }
}

export async function authenticate(options: AuthOptions): Promise<AlexaCredentials> {
  const { refreshToken, domain = "amazon.co.uk" } = options;
  const config = getConfig(domain);
  const cookieDomain = `.${config.domain}`;

  const tokenRes = await fetch("https://api.amazon.com/ap/exchangetoken/cookies", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-amzn-identity-auth-domain": `api.${config.domain}`,
    },
    body: new URLSearchParams({
      app_name: "Amazon Alexa",
      requested_token_type: "auth_cookies",
      source_token_type: "refresh_token",
      source_token: refreshToken,
      domain: cookieDomain,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`);
  }

  const tokenData = (await tokenRes.json()) as {
    response?: { tokens?: { cookies?: Record<string, Array<{ Name: string; Value: string }>> } };
  };
  const cookieList = tokenData.response?.tokens?.cookies?.[cookieDomain];
  if (!cookieList?.length) {
    throw new Error("No cookies in token response");
  }

  const cookieParts = cookieList.map((c) => {
    let v = c.Value;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return `${c.Name}=${v}`;
  });

  const cookieString = cookieParts.join("; ");

  const csrfRes = await fetch(`${config.alexaBase}/api/language`, {
    headers: {
      Cookie: cookieString,
      Accept: "application/json",
    },
  });

  if (!csrfRes.ok) {
    throw new Error(`CSRF fetch failed: ${csrfRes.status}`);
  }

  const setCookie = csrfRes.headers.get("set-cookie");
  let csrf = "";
  if (setCookie) {
    const match = setCookie.match(/csrf=([^;]+)/);
    if (match) csrf = match[1];
  }
  if (!csrf) {
    throw new Error("Could not extract CSRF token");
  }

  const fullCookie = `${cookieString}; csrf=${csrf}`;

  return { cookies: fullCookie, csrf };
}
