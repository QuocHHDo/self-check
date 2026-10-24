// Converts USDA FoodData Central and Open Food Facts records into the app's food shape.
// Pure functions so the tests can check them against sample API responses.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./verdict.js"));
  else root.SelfCheckSources = factory(root.SelfCheckVerdict);
})(typeof self !== "undefined" ? self : this, function (V) {
  const PROCESSED = /bacon|sausage|salami|pepperoni|\bham\b|hot dog|frankfurter|bologna|jerky|deli|cured|smoked|corned/i;
  const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  function makeFood(name, serving, v, extra) {
    const f = { n: String(name).slice(0, 70), a: [], s: String(serving || "1 serving").slice(0, 50), c: "lookup", tags: [] };
    for (const k of V.NUM_KEYS) f[k] = Math.round(num(v[k]) * 10) / 10;
    f.sat = Math.min(f.sat, f.fat);
    f.add = Math.min(f.add, f.sug);
    if (PROCESSED.test(f.n)) f.tags.push("processed");
    return Object.assign(f, extra);
  }

  // USDA nutrient ids. Energy has three ids depending on data type; sugars has two.
  const USDA_IDS = { cal: [1008, 2048, 2047], pro: [1003], fat: [1004], carb: [1005], fib: [1079], sug: [2000, 1063], add: [1235], sat: [1258], trans: [1257], chol: [1253], na: [1093] };
  const titleCase = s => s.toLowerCase().replace(/(^|[ ,(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

  // One item from /fdc/v1/foods/search (Foundation, SR Legacy, Survey): values are per 100 g.
  function fromUsda(item) {
    const byId = {};
    for (const n of item.foodNutrients || []) {
      const id = n.nutrientId ?? (n.nutrient && n.nutrient.id);
      const value = n.value ?? n.amount;
      const unit = String(n.unitName || (n.nutrient && n.nutrient.unitName) || "").toUpperCase();
      if (id == null || value == null) continue;
      if (byId[id] != null && unit === "KJ") continue; // keep kcal when both units are listed
      byId[id] = unit === "KJ" ? value / 4.184 : value;
    }
    const v = {};
    for (const [k, ids] of Object.entries(USDA_IDS)) { const id = ids.find(i => byId[i] != null); v[k] = id != null ? byId[id] : 0; }
    return makeFood(titleCase(String(item.description || "USDA food")), "100 g", v, { src: "usda", fdcId: item.fdcId });
  }

  // One product from Open Food Facts /api/v2/product/{barcode}.json. Uses per-serving values when present, else per 100 g.
  // Open Food Facts stores sodium and cholesterol in grams.
  function fromOff(code, p) {
    const n = p.nutriments || {};
    const per = n["energy-kcal_serving"] != null ? "_serving" : "_100g";
    const g = k => (n[k + per] != null ? Number(n[k + per]) : undefined);
    const kcal = g("energy-kcal") ?? (g("energy") != null ? g("energy") / 4.184 : undefined);
    const sodiumG = g("sodium") ?? (g("salt") != null ? g("salt") / 2.5 : undefined);
    const v = {
      cal: kcal, fat: g("fat"), sat: g("saturated-fat"), trans: g("trans-fat"),
      chol: g("cholesterol") != null ? g("cholesterol") * 1000 : 0,
      na: sodiumG != null ? sodiumG * 1000 : 0,
      carb: g("carbohydrates"), fib: g("fiber"), sug: g("sugars"), add: g("added-sugars"), pro: g("proteins"),
    };
    const core = [kcal, g("fat"), g("saturated-fat"), sodiumG, g("carbohydrates"), g("sugars"), g("proteins")];
    const partial = core.some(x => x == null);
    const brand = String(p.brands || "").split(",")[0].trim();
    const product = p.product_name || p.generic_name || `Product ${code}`;
    const name = brand && !product.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${product}` : product;
    const serving = per === "_serving" ? (p.serving_size || "1 serving") : "100 g";
    return makeFood(name, serving, v, { src: "off", code: String(code), partial });
  }

  function usdaSearchUrl(query, key) {
    return "https://api.nal.usda.gov/fdc/v1/foods/search?" + new URLSearchParams({ query, dataType: "Foundation,SR Legacy,Survey (FNDDS)", pageSize: "8", api_key: key || "DEMO_KEY" });
  }
  const offProductUrl = code => `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,generic_name,brands,nutriments,serving_size`;


  // The exact prompt the Claude version uses to look up a food; the Claude-vs-USDA eval sends the same text.
  function claudePrompt(text) {
    return `Give typical nutrition facts for one common US serving of the food "${text}" as bought at a grocery store.
Reply with only a JSON object in this shape:
{"found":true,"name":"Title Case food name","serving":"1 cup (240 g)","cal":0,"fat":0,"sat":0,"trans":0,"chol":0,"na":0,"carb":0,"fib":0,"sug":0,"add":0,"pro":0,"spicy":false,"processedMeat":false}
Units: cal in kcal; chol and na in milligrams; every other number in grams. Use typical USDA FoodData Central values; for a branded or variable product, use a typical mid-range version. "add" is added sugars only. "spicy" is true only if the food is inherently hot. "processedMeat" is true for cured, smoked or deli meats.
If "${text}" is not a food, reply {"found":false}.`;
  }

  // Pull the JSON object out of a model reply that may have text or a code fence around it.
  function parseJsonReply(reply) {
    const s = String(reply || "");
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fence ? fence[1] : s;
    const i = body.indexOf("{"), j = body.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("no JSON object in reply");
    return JSON.parse(body.slice(i, j + 1));
  }

  // A Claude lookup reply (the JSON shape asked for in claudePrompt) as an app food.
  function fromClaude(d, query) {
    if (!d || d.found === false || !d.name) return null;
    const f = makeFood(d.name, d.serving, d, { src: "claude", a: query ? [String(query).toLowerCase()] : [] });
    f.tags = [...(d.spicy ? ["spicy"] : []), ...(d.processedMeat ? ["processed"] : [])];
    return f;
  }

  return { PROCESSED, makeFood, fromUsda, fromOff, usdaSearchUrl, offProductUrl, claudePrompt, parseJsonReply, fromClaude };
});
