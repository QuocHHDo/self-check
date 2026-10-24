#!/usr/bin/env node
// Builds a single self-contained HTML file (all scripts inlined) for hosts that serve one file,
// such as a Claude artifact. Usage:
//   node scripts/build-single.mjs out.html [config.json]
// config.json is merged into window.SELF_CHECK_CONFIG, e.g. {"mode":"claude","profile":{...}}.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [out, cfgPath] = process.argv.slice(2);
if (!out) { console.error("usage: node scripts/build-single.mjs out.html [config.json]"); process.exit(1); }
const cfg = { mode: "claude", ...(cfgPath ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {}) };

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const head = html.slice(html.indexOf("<head>") + 6, html.indexOf("</head>"));
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));

// Artifact hosts add their own doctype, charset and viewport; keep title, fonts and styles.
const keptHead = head.split("\n").filter(l => !/<meta charset|<meta name="viewport"|data-pages-only|apple-mobile-web-app|theme-color/.test(l)).join("\n").trim();
const safe = s => s.replace(/<\/script/gi, "<\\/script");
const inlined = body
  .replace(/<script>window\.SELF_CHECK_CONFIG[^<]*<\/script>/, `<script>window.SELF_CHECK_CONFIG = ${JSON.stringify(cfg)};</script>`)
  .replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n${safe(fs.readFileSync(path.join(ROOT, src), "utf8"))}\n</script>`);

fs.writeFileSync(out, keptHead + "\n" + inlined.trim() + "\n");
console.log(`Wrote ${out} (${Math.round(fs.statSync(out).size / 1024)} KB, mode ${cfg.mode})`);
