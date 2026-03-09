export type Domain = "amazon.co.uk" | "amazon.com" | "amazon.de";

export interface DomainConfig {
  domain: Domain;
  laylaBase: string;
  alexaBase: string;
  /** EU mobile app API host (used by Alexa app for UK); optional. */
  euApiBase?: string;
  locale: string;
  cookieSuffix: string;
}

export interface AlexaMcpConfig {
  refreshToken: string;
  domain: Domain;
}

const CONFIGS: Record<Domain, DomainConfig> = {
  "amazon.co.uk": {
    domain: "amazon.co.uk",
    laylaBase: "https://layla.amazon.co.uk",
    alexaBase: "https://alexa.amazon.co.uk",
    euApiBase: "https://eu-api-alexa.amazon.co.uk",
    locale: "en-GB",
    cookieSuffix: "acbuk",
  },
  "amazon.com": {
    domain: "amazon.com",
    laylaBase: "https://pitangui.amazon.com",
    alexaBase: "https://alexa.amazon.com",
    locale: "en-US",
    cookieSuffix: "acb",
  },
  "amazon.de": {
    domain: "amazon.de",
    laylaBase: "https://layla.amazon.de",
    alexaBase: "https://alexa.amazon.de",
    euApiBase: "https://eu-api-alexa.amazon.de",
    locale: "de-DE",
    cookieSuffix: "acbde",
  },
};

export function getConfig(domain: Domain = "amazon.co.uk"): DomainConfig {
  return CONFIGS[domain];
}
