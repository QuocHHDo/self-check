// Downloads the price sources for scripts/build-prices.mjs into <dir>:
//   BLS series through the public API (https://api.bls.gov). v2 with a free key (env BLS_API_KEY) when set,
//   else v1, which needs no key (25 series per request). Written in the same tab-separated layout as BLS's
//   bulk files (ap.data.3.Food, cu.data.11.USFoodBeverage); item names come from data/prices/bls-items.tsv.
//   USDA ERS fruit and vegetable CSVs, refreshed in data/prices/ when the ERS page links them.
//   node scripts/fetch-prices.mjs <dir>
import fs from "node:fs";
import path from "node:path";
import { PRICE_MAP } from "./price-map.mjs";

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/fetch-prices.mjs <dir>"); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const ROOT = new URL("..", import.meta.url).pathname;
const KEY = process.env.BLS_API_KEY || "";
const year = new Date().getUTCFullYear();

const codes = [...new Set(Object.values(PRICE_MAP).map(s => s.bls).filter(Boolean))];
const apSeries = codes.flatMap(c => [`APU0300${c}`, `APU0000${c}`]);
const cuSeries = ["SEFK", "SEFL", "SEFM01", "SEFM02", "SEFM03", "SEFN03"].map(s => `CUUR0000${s}`);

async function fetchSeries(ids) {
  const per = KEY ? 50 : 25, rows = [];
  for (let i = 0; i < ids.length; i += per) {
    const body = { seriesid: ids.slice(i, i + per), startyear: "2023", endyear: String(year), ...(KEY ? { registrationkey: KEY } : {}) };
    const res = await fetch(`https://api.bls.gov/publicAPI/${KEY ? "v2" : "v1"}/timeseries/data/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.status !== "REQUEST_SUCCEEDED") throw new Error(`BLS API: ${json.status} ${JSON.stringify(json.message || "").slice(0, 300)}`);
    for (const s of json.Results.series) for (const d of s.data) rows.push([s.seriesID, d.year, d.period, d.value].join("\t"));
    console.log(`BLS ${i + 1}-${Math.min(i + per, ids.length)} of ${ids.length}: ${json.Results.series.reduce((t, s) => t + s.data.length, 0)} values`);
  }
  return "series_id\tyear\tperiod\tvalue\n" + rows.join("\n") + "\n";
}
try {
  fs.writeFileSync(path.join(out, "ap.data.3.Food"), await fetchSeries(apSeries));
  fs.writeFileSync(path.join(out, "cu.data.11.USFoodBeverage"), await fetchSeries(cuSeries));
} catch (e) {
  console.log(`::error::${String(e.message || e).replace(/\n/g, " ")}`); // shows as an annotation on the run
  process.exit(1);
}
fs.copyFileSync(path.join(ROOT, "data/prices/bls-items.tsv"), path.join(out, "ap.item"));

// ERS: links carry a version query (?v=…), so read them from the data page. Keep the committed copy on failure.
const UA = { "user-agent": "self-check price refresh (https://github.com/QuocHHDo/self-check)" };
try {
  const page = await (await fetch("https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices", { headers: UA })).text();
  for (const [kind, file] of [["fruits", "ers-fruit-prices.csv"], ["vegetables", "ers-vegetable-prices.csv"]]) {
    const m = page.match(new RegExp(`href="([^"]*all-${kind}-average-prices-csv-format[^"]*)"`, "i"));
    if (!m) { console.log(`ERS ${kind}: link not found, keeping the committed copy`); continue; }
    const url = m[1].startsWith("http") ? m[1] : "https://www.ers.usda.gov" + m[1];
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    if (!res.ok || !/AveragePricePerCupEquivalent/.test(text)) { console.log(`ERS ${kind}: unexpected response (${res.status}), keeping the committed copy`); continue; }
    fs.writeFileSync(path.join(ROOT, "data/prices", file), text);
    console.log(`ERS ${kind}: ${text.split("\n").length - 2} rows`);
  }
} catch (e) { console.log("ERS: " + e.message + "; keeping the committed copies"); }
