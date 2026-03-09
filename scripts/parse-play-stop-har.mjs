#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harPath = process.argv[2] || path.join(__dirname, "../docs/alexa-play-stop.har");
const outPath = path.join(__dirname, "../docs/_har_play_stop_out.txt");
const out = [];
try {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const entries = har.log.entries || [];
  out.push("Total entries: " + entries.length);
  const np = entries.filter((e) => {
    const u = e.request?.url || "";
    return u.includes("control-media-session") || u.includes("/np/");
  });
  out.push("Entries with /np/ or control-media-session: " + np.length);
  np.forEach((e, i) => {
    out.push("\n--- " + i + " " + e.request.method + " " + e.request.url);
    if (e.request.postData?.text) out.push("Request body: " + e.request.postData.text);
    if (e.response?.content?.text) out.push("Response (first 1200): " + e.response.content.text.slice(0, 1200));
  });
} catch (err) {
  out.push("Error: " + err.message + "\n" + err.stack);
}
fs.writeFileSync(outPath, out.join("\n"), "utf8");
console.log(out.join("\n"));
