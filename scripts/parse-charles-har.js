#!/usr/bin/env node
/**
 * Parse a Charles-exported HAR (Zip format: N-meta.json, N-req.json, N-res.json).
 * Usage: node scripts/parse-charles-har.js path/to/file.har
 * Extracts to docs/_har_extract/ then lists Alexa-related requests.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const harPath = process.argv[2] || path.join(__dirname, "../docs/alexa-090325.har");
const outDir = path.join(__dirname, "../docs/_har_extract");

if (!fs.existsSync(harPath)) {
  console.error("HAR file not found:", harPath);
  process.exit(1);
}

// Unzip
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}
fs.mkdirSync(outDir, { recursive: true });
execSync(`unzip -o -q "${harPath}" -d "${outDir}"`, { stdio: "pipe" });

// List Alexa-related requests from meta
const files = fs.readdirSync(outDir).filter((f) => f.endsWith("-meta.json"));
const alexaHosts = ["eu-api-alexa", "alexa.amazon", "api.eu.amazonalexa", "api.amazonalexa"];
const seen = new Set();
const entries = [];

for (const f of files) {
  const n = f.replace("-meta.json", "");
  const meta = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
  const host = meta.host || "";
  const method = meta.method || "";
  if (method === "CONNECT") continue;
  if (!alexaHosts.some((h) => host.includes(h))) continue;
  const url = (meta.scheme || "https") + "://" + host + (meta.path || "");
  const key = method + " " + url.replace(/\?.*/, "");
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push({ n, method, url });
}

console.log("Alexa-related requests (non-CONNECT):\n");
entries.forEach((e) => console.log(e.method, e.url));
console.log("\nTotal unique:", entries.length);
console.log("\nTo inspect request/response for entry N: cat docs/_har_extract/N-req.json docs/_har_extract/N-res.json");
