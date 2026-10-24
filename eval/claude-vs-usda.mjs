#!/usr/bin/env node
// LLM eval: how accurate are Claude's nutrition lookups? For each food, sends the app's exact lookup prompt
// (js/sources.js claudePrompt) to Claude, then scores the answer against USDA FoodData Central, nutrient by
// nutrient and verdict by verdict. The built-in values (also written by Claude, from general knowledge) are
// scored the same way so the two can be compared.
//
//   ANTHROPIC_API_KEY=... USDA_API_KEY=... node eval/claude-vs-usda.mjs [--limit 60] [--model claude-sonnet-5-5]
//
// Writes eval/claude-report.md and eval/claude-results.json.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPARED, compareFood, fetchUsda, loadPinned, servingGrams } from "./compare-usda.mjs";

const require = createRequire(import.meta.url);
const { FOODS } = require("../js/foods.js");
const S = require("../js/sources.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_VERSION = "2026-10-21";

// An even spread across the list (every k-th food) so a small run still covers every category.
export function sampleFoods(foods, limit) {
  if (!limit || limit >= foods.length) return foods;
  const step = foods.length / limit;
  return Array.from({ length: limit }, (_, i) => foods[Math.floor(i * step)]);
}

export async function askClaude(text, { key, model }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: S.claudePrompt(text) }] }),
  });
  if (res.status === 429) throw new Error("Claude rate limited");
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const reply = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return S.fromClaude(S.parseJsonReply(reply), text);
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const pctf = x => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");

// rows: [{ name, claude: compareFood result | null, builtIn: compareFood result | null, error? }]
export function buildClaudeReport(rows, model) {
  const both = rows.filter(r => r.claude && r.builtIn && r.builtIn.confidence >= 0.5);
  const lines = ["# Claude nutrition lookups vs USDA FoodData Central", ""];
  lines.push(`Run ${new Date().toISOString().slice(0, 10)} with ${model}. ${rows.length} foods asked; ${both.length} scored against a confident USDA match (the same record for both columns).`, "");
  lines.push("Error = |value − USDA| ÷ USDA, with the same small floors as the built-in eval. “Claude now” is a fresh lookup with the app's prompt; “Built-in” is the value already in js/foods.js.", "");
  lines.push("## Median error by nutrient", "", "| Nutrient | Claude now | Built-in | Claude within 25% |", "| --- | --- | --- | --- |");
  for (const [k, , label] of COMPARED) {
    const c = both.map(r => r.claude.errors[k]).filter(x => x != null), b = both.map(r => r.builtIn.errors[k]).filter(x => x != null);
    lines.push(`| ${label} | ${pctf(median(c))} | ${pctf(median(b))} | ${pctf(c.filter(x => x <= 0.25).length / c.length)} |`);
  }
  const agreeC = both.filter(r => r.claude.verdictBuilt === r.claude.verdictUsda).length;
  const agreeB = both.filter(r => r.builtIn.verdictBuilt === r.builtIn.verdictUsda).length;
  lines.push("", "## Verdict agreement with USDA numbers", "", `Claude now: ${agreeC} of ${both.length} (${pctf(agreeC / both.length)}). Built-in: ${agreeB} of ${both.length} (${pctf(agreeB / both.length)}).`, "");
  const servingGap = both.filter(r => Math.abs(r.claude.grams - r.builtIn.grams) / r.builtIn.grams > 0.5);
  if (servingGap.length) lines.push(`${servingGap.length} foods got a very different serving size from Claude than the built-in list (over 50% apart in grams); errors are measured per each one's own serving, so this doesn't count against accuracy.`, "");
  lines.push("## Largest Claude errors", "", "| Food | Worst nutrient | Claude | USDA | Claude's serving |", "| --- | --- | --- | --- | --- |");
  for (const r of [...both].sort((a, b) => b.claude.maxError - a.claude.maxError).slice(0, 20)) {
    const [k, , label] = COMPARED.reduce((w, c) => ((r.claude.errors[c[0]] ?? -1) > (r.claude.errors[w[0]] ?? -1) ? c : w));
    lines.push(`| ${r.name} | ${label} (${pctf(r.claude.errors[k])}) | ${r.claude.built[k]} | ${r.claude.usda[k]} | ${r.claude.serving} |`);
  }
  const failed = rows.filter(r => r.error || !r.claude);
  if (failed.length) lines.push("", "## Not scored", "", failed.map(r => `- ${r.name}: ${r.error || "no usable answer"}`).join("\n"));
  return lines.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const key = process.env.ANTHROPIC_API_KEY, usdaKey = process.env.USDA_API_KEY;
  const model = opt("--model") || process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const limit = Number(opt("--limit") || 60);
  if (!key || !usdaKey) { console.error("Set ANTHROPIC_API_KEY and USDA_API_KEY."); process.exit(1); }
  const pinned = loadPinned();
  const rows = [];
  for (const f of sampleFoods(FOODS.filter(g => servingGrams(g.s)), limit)) {
    const row = { name: f.n, claude: null, builtIn: null };
    try {
      const usdaItem = await fetchUsda(f, usdaKey, pinned);
      if (!usdaItem) throw new Error("no USDA result");
      const usda = S.fromUsda(usdaItem);
      row.builtIn = compareFood(f, usda);
      const c = await askClaude(f.n, { key, model });
      if (c) row.claude = compareFood({ ...c, n: f.n }, usda);
      process.stdout.write(".");
    } catch (e) {
      row.error = e.message;
      if (/rate limited/.test(e.message)) { rows.push(row); break; }
    }
    rows.push(row);
    await new Promise(r => setTimeout(r, 200));
  }
  process.stdout.write("\n");
  const report = buildClaudeReport(rows, model);
  fs.writeFileSync(path.join(HERE, "claude-report.md"), report);
  fs.writeFileSync(path.join(HERE, "claude-results.json"), JSON.stringify(rows, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report.split("\n").slice(0, 22).join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
