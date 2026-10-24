// Converts USDA FoodData Central and Open Food Facts records into the app's food shape.
// Pure functions so the tests can check them against sample API responses.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./verdict.js"));
  else root.SelfCheckSources = factory(root.SelfCheckVerdict);
})(typeof self !== "undefined" ? self : this, function (V) {
  const PROCESSED = /bacon|sausage|salami|pepperoni|\bham\b|hot dog|frankfurter|bologna|jerky|deli|cured|smoked|corned/i;
  const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  // Values a source didn't report are listed in `missing` (and stored as 0 only as a placeholder):
  // the label shows them as "—" and the verdict leaves them out.
  // Added sugar counts as known only when the source reports it, and never when total sugars are unknown;
  // otherwise it's shown as "—" and left out of the verdict. A raw food, or one with under 1 g of total sugar, can't be
  // hiding added sugar, so for those the unknown value doesn't block a "Get it" (addLikelyZero).
  function settleAddedSugar(f, reported, raw) {
    if (!reported || f.missing.includes("sug")) { if (!f.missing.includes("add")) f.missing.push("add"); f.add = 0; }
    f.addLikelyZero = f.missing.includes("add") && (!!raw || (!f.missing.includes("sug") && f.sug < 1));
    f.partial = f.missing.some(k => k !== "trans" && k !== "chol");
    return f;
  }

  function makeFood(name, serving, v, extra = {}) {
    const f = { n: String(name).slice(0, 70), a: [], s: String(serving || "1 serving").slice(0, 50), c: "lookup", tags: [] };
    for (const k of V.NUM_KEYS) f[k] = Math.round(num(v[k]) * 10) / 10;
    f.sat = Math.min(f.sat, f.fat);
    f.add = Math.min(f.add, f.sug);
    if (PROCESSED.test(f.n)) f.tags.push("processed");
    Object.assign(f, extra);
    f.missing = [...new Set(extra.missing || [])];
    // Trans fat and cholesterol are routinely absent from non-US labels: shown as "—" but not worth a partial-data warning.
    f.partial = f.missing.some(k => k !== "trans" && k !== "chol");
    return f;
  }

  // USDA nutrient ids. Energy has three ids depending on data type; sugars has two.
  // Foundation records use some newer ids: total fat 1085 (NLEA), carbs by summation 1050.
  const USDA_IDS = { cal: [1008, 2048, 2047], pro: [1003], fat: [1004, 1085], carb: [1005, 1050], fib: [1079], sug: [2000, 1063], add: [1235], sat: [1258], trans: [1257], chol: [1253], na: [1093] };
  // USDA descriptions are often ALL CAPS. Capitalize words, but keep minor words ("or", "with") lowercase unless first.
  const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "without"]);
  const titleCase = s => s.toLowerCase().replace(/(^|[ ,(/-])([a-z][a-z']*)/g, (m, a, w, i) => a + (i > 0 && MINOR_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)));

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
    const v = {}, missing = [];
    for (const [k, ids] of Object.entries(USDA_IDS)) {
      const id = ids.find(i => byId[i] != null);
      if (id != null) v[k] = byId[id]; else { v[k] = 0; if (k !== "add" && k !== "trans") missing.push(k); }
    }
    const desc = String(item.description || "");
    // No energy value but the macros are there: estimate calories with 4/4/9.
    let calEstimated = false;
    if (missing.includes("cal") && !missing.includes("pro") && !missing.includes("fat") && !missing.includes("carb")) {
      v.cal = 4 * v.pro + 4 * v.carb + 9 * v.fat; missing.splice(missing.indexOf("cal"), 1); calEstimated = true;
    }
    const cat = item.foodCategory && typeof item.foodCategory === "object" ? item.foodCategory.description : item.foodCategory;
    const f = makeFood(titleCase(String(item.description || "USDA food")), "100 g", v,
      { src: "usda", fdcId: item.fdcId, dataType: item.dataType, missing, calEstimated, foodCategory: cat ? String(cat) : undefined });
    // SR Legacy, Foundation and Survey records almost never report added sugar (nutrient 1235).
    return settleAddedSugar(f, byId[1235] != null, /\braw\b/i.test(desc));
  }

  // One product from Open Food Facts /api/v2/product/{barcode}.json, per the package's serving:
  //  1. the label's own per-serving values (*_serving) when present;
  //  2. else per-100 g values scaled to serving_quantity (grams) when the serving size is known;
  //  3. else per 100 g, labeled "100 g (no serving size on file)".
  // Open Food Facts stores sodium and cholesterol in grams.
  function servingQuantity(p) {
    const q = Number(p.serving_quantity);
    if (Number.isFinite(q) && q > 0) return q; // grams, or ml for drinks (treated as grams)
    const m = String(p.serving_size || "").match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
    return m ? Number(m[1].replace(",", ".")) : null;
  }
  function fromOff(code, p) {
    const n = p.nutriments || {};
    const hasServing = n["energy-kcal_serving"] != null || n["energy_serving"] != null;
    const qty = hasServing ? null : servingQuantity(p);
    const factor = hasServing ? 1 : qty ? qty / 100 : 1;
    const per = hasServing ? "_serving" : "_100g";
    const val = k => (n[k] != null && n[k] !== "" && Number.isFinite(Number(n[k])) ? Number(n[k]) : undefined);
    // Per-serving value; when only that line is missing on a per-serving label, scale its per-100 g value.
    const g = k => val(k + per) != null ? val(k + per) * factor
      : hasServing && val(k + "_100g") != null && servingQuantity(p) ? val(k + "_100g") * servingQuantity(p) / 100 : undefined;
    const kcal = g("energy-kcal") ?? (g("energy") != null ? g("energy") / 4.184 : undefined);
    const sodiumG = g("sodium") ?? (g("salt") != null ? g("salt") / 2.5 : undefined);
    const v = {
      cal: kcal, fat: g("fat"), sat: g("saturated-fat"), trans: g("trans-fat"),
      chol: g("cholesterol") != null ? g("cholesterol") * 1000 : undefined,
      na: sodiumG != null ? sodiumG * 1000 : undefined,
      carb: g("carbohydrates"), fib: g("fiber"), sug: g("sugars"), add: g("added-sugars"), pro: g("proteins"),
    };
    // Open Food Facts leaves out whatever the package label doesn't list (EU labels skip fiber, cholesterol, trans fat, added sugar).
    const missing = V.NUM_KEYS.filter(k => v[k] == null || !Number.isFinite(Number(v[k])));
    const brand = String(p.brands || "").split(",")[0].trim();
    const product = p.product_name || p.generic_name || `Product ${code}`;
    const name = brand && !product.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${product}` : product;
    const serving = hasServing ? (p.serving_size || "1 serving") : qty ? (p.serving_size && /\d/.test(p.serving_size) ? p.serving_size : `${qty} g`) : "100 g (no serving size on file)";
    const ingredients = String(p.ingredients_text_en || p.ingredients_text || "").trim().slice(0, 1500);
    const f = makeFood(name, serving, v, { src: "off", code: String(code), missing, per100: !hasServing && !qty, categories: (p.categories_tags || []).slice(0, 30),
      // Additives and processing level, when Open Food Facts has analyzed the ingredient list.
      additives: Array.isArray(p.additives_tags) ? p.additives_tags.slice(0, 40).map(String) : undefined,
      nova: [1, 2, 3, 4].includes(Number(p.nova_group)) ? Number(p.nova_group) : undefined,
      ingredients: ingredients || undefined });
    return settleAddedSugar(f, v.add != null, false);
  }

  function usdaSearchUrl(query, key) {
    return "https://api.nal.usda.gov/fdc/v1/foods/search?" + new URLSearchParams({ query, dataType: "Foundation,SR Legacy,Survey (FNDDS)", pageSize: "8", api_key: key || "DEMO_KEY" });
  }
  const usdaFoodUrl = (id, key) => `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(id)}?` + new URLSearchParams({ api_key: key || "DEMO_KEY" });
  // Shareable link ids: looked-up foods link by their source id so the link works on a device that never saw them.
  const linkId = (f, slug) => f.src === "usda" && f.fdcId ? `usda-${f.fdcId}` : f.src === "off" && f.code ? `off-${f.code}` : slug(f.n);
  function parseLinkId(h) {
    const id = decodeURIComponent(String(h || "").replace(/^#/, ""));
    let m;
    if ((m = id.match(/^usda-(\d{1,10})$/))) return { kind: "usda", id: Number(m[1]) };
    if ((m = id.match(/^off-(\d{8,14})$/))) return { kind: "off", code: m[1] };
    return id ? { kind: "slug", slug: id } : null;
  }
  const offProductUrl = code => `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,generic_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,categories_tags,additives_tags,nova_group,ingredients_text,ingredients_text_en`;


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

  return { PROCESSED, makeFood, settleAddedSugar, fromUsda, fromOff, usdaSearchUrl, usdaFoodUrl, linkId, parseLinkId, titleCase, offProductUrl, claudePrompt, parseJsonReply, fromClaude };
});
