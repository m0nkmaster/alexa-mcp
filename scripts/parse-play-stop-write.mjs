import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harPath = path.join(__dirname, "..", "docs", "alexa-play-stop.har");
const outPath = path.join(__dirname, "..", "docs", "play_stop_findings.txt");

const lines = [];
try {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const entries = har.log.entries || [];
  lines.push("Total entries: " + entries.length);

  const np = entries.filter((e) => {
    const u = e.request?.url || "";
    return u.includes("control-media-session") || u.includes("/np/");
  });
  lines.push("Entries with /np/ or control-media-session: " + np.length);

  np.forEach((e, i) => {
    lines.push("");
    lines.push("--- " + i + " " + e.request.method + " " + (e.request.url || "").slice(0, 120));
    if (e.request?.postData?.text) {
      lines.push("Request body: " + e.request.postData.text);
    }
    if (e.response?.content?.text) {
      lines.push("Response (first 1500 chars): " + e.response.content.text.slice(0, 1500));
    }
  });
} catch (err) {
  lines.push("Error: " + err.message);
  lines.push(err.stack);
}
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
