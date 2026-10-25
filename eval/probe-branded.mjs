// One-off probe of USDA FoodData Central "Branded" data for barcode lookups:
//  1. how many Walmart store-brand products it has (Great Value, Equate, Marketside, Sam's Choice),
//  2. whether searching by a product's UPC finds it, and in which formats (12-, 13-, 14-digit),
//  3. raw search + detail records to use as test fixtures.
// Needs USDA_API_KEY. Writes eval/branded-probe.json.
import fs from "node:fs";

const KEY = process.env.USDA_API_KEY || "DEMO_KEY";
const API = "https://api.nal.usda.gov/fdc/v1";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(url, body) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(1500 * (i + 1));
  }
  throw new Error("failed: " + url);
}
const search = (query, extra = {}) => call(`${API}/foods/search?api_key=${KEY}`, { query, dataType: ["Branded"], pageSize: 50, ...extra });
const getUrl = (query, extra = "") => call(`${API}/foods/search?api_key=${KEY}&dataType=Branded&pageSize=25&query=${encodeURIComponent(query)}${extra}`);
const digits = s => String(s || "").replace(/\D/g, "").replace(/^0+/, "");

const out = { when: new Date().toISOString(), brands: {}, upcTests: [], samples: [] };

// 1. Store-brand coverage
for (const brand of ["Great Value", "Equate", "Marketside", "Sam's Choice", "bettergoods"]) {
  const r = await search(`"${brand}"`, { brandOwner: "Walmart" }).catch(() => null);
  const r2 = await search(brand);
  const items = (r2.foods || []);
  out.brands[brand] = {
    totalHitsWithOwnerFilter: r ? r.totalHits : null,
    totalHitsPlain: r2.totalHits,
    owners: [...new Set(items.map(f => f.brandOwner))].slice(0, 10),
    brandNames: [...new Set(items.map(f => f.brandName))].slice(0, 10),
    sample: items.slice(0, 8).map(f => ({ fdcId: f.fdcId, description: f.description, brandOwner: f.brandOwner, brandName: f.brandName, gtinUpc: f.gtinUpc, servingSize: f.servingSize, servingSizeUnit: f.servingSizeUnit, household: f.householdServingFullText, published: f.publishedDate })),
  };
  await sleep(300);
}

// 2. UPC lookups: take real UPCs from step 1 plus a few national brands, and search by each format.
const pool = [];
for (const b of Object.values(out.brands)) for (const s of b.sample) if (s.gtinUpc && pool.length < 14) pool.push(s);
for (const q of ["nutella hazelnut spread", "cheerios", "coca-cola", "quest protein bar", "doritos nacho cheese"]) {
  const r = await search(q); const f = (r.foods || [])[0];
  if (f && f.gtinUpc) pool.push({ fdcId: f.fdcId, description: f.description, brandOwner: f.brandOwner, gtinUpc: f.gtinUpc });
  await sleep(300);
}
for (const p of pool) {
  const core = digits(p.gtinUpc);
  const forms = { asListed: p.gtinUpc, upc12: core.padStart(12, "0"), ean13: core.padStart(13, "0"), gtin14: core.padStart(14, "0") };
  const res = {};
  for (const [k, v] of Object.entries(forms)) {
    const r = await getUrl(v).catch(e => ({ error: String(e) }));
    const foods = (r && r.foods) || [];
    res[k] = { query: v, totalHits: r ? r.totalHits : null, exactAt: foods.findIndex(f => digits(f.gtinUpc) === core), first: foods[0] ? foods[0].gtinUpc : null };
    await sleep(250);
  }
  out.upcTests.push({ ...p, results: res });
}

// 3. Raw records for fixtures: the search item and the detail (/food/{id}) for three products.
for (const p of pool.slice(0, 3).concat(pool.slice(-2))) {
  const s = await getUrl(p.gtinUpc);
  const item = ((s && s.foods) || []).find(f => digits(f.gtinUpc) === digits(p.gtinUpc)) || null;
  const detail = await call(`${API}/food/${p.fdcId}?api_key=${KEY}`).catch(() => null);
  out.samples.push({ searchItem: item, detail });
  await sleep(300);
}
fs.writeFileSync("eval/branded-probe.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ brands: Object.fromEntries(Object.entries(out.brands).map(([k, v]) => [k, [v.totalHitsWithOwnerFilter, v.totalHitsPlain]])), upc: out.upcTests.map(t => [t.gtinUpc, Object.fromEntries(Object.entries(t.results).map(([k, v]) => [k, v.exactAt]))]) }, null, 1));
