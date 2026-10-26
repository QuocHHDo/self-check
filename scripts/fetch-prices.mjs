// Downloads the price sources for scripts/build-prices.mjs into <dir>:
//   BLS bulk files (https://download.bls.gov/pub/time.series/): average prices (ap.data.3.Food) and CPI food
//   indexes (cu.data.11.USFoodBeverage). BLS blocks automated downloads that don't carry a contact email in the
//   user agent, so set BLS_CONTACT (a repository secret in the workflow; never committed).
//   USDA ERS fruit and vegetable CSVs, refreshed in data/prices/ when the ERS page links them.
//   BLS_CONTACT=you@example.com node scripts/fetch-prices.mjs <dir>
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
if (!out) { console.error("usage: BLS_CONTACT=<email> node scripts/fetch-prices.mjs <dir>"); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const ROOT = new URL("..", import.meta.url).pathname;
const contact = (process.env.BLS_CONTACT || "").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
  console.log("::error::Set BLS_CONTACT to a contact email (repository secret). BLS rejects automated downloads without one.");
  process.exit(1);
}
const BLS_UA = { "user-agent": `self-check price refresh (${contact})` };

async function bls(pathPart, file) {
  const res = await fetch(`https://download.bls.gov/pub/time.series/${pathPart}`, { headers: BLS_UA });
  const text = await res.text();
  if (!res.ok || !text.startsWith("series_id")) {
    console.log(`::error::BLS ${pathPart} answered ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(out, file), text);
  console.log(`BLS ${pathPart}: ${(text.length / 1e6).toFixed(1)} MB`);
}
await bls("ap/ap.data.3.Food", "ap.data.3.Food");
await bls("cu/cu.data.11.USFoodBeverage", "cu.data.11.USFoodBeverage");
fs.copyFileSync(path.join(ROOT, "data/prices/bls-items.tsv"), path.join(out, "ap.item"));

// ERS: links carry a version query (?v=…), so read them from the data page. Keep the committed copy on failure.
const UA = { "user-agent": "self-check price refresh (https://github.com/QuocHHDo/should-i-buy-it)" };
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
