// Reads a Walmart product page for the browser extension: the page's own data (__NEXT_DATA__), its Nutrition Facts
// panel when it has one, and which source to use when it doesn't. Pure functions so the tests can run them on real
// page data. Walmart's panel comes in several shapes ("Saturated Fat" or "Sat. Fat", on its own line or nested under
// Total Fat), so nutrients are found by name anywhere in it.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./verdict.js"), require("./sources.js"), require("./search.js"));
  else root.SelfCheckWalmart = factory(root.SelfCheckVerdict, root.SelfCheckSources, root.SelfCheckSearch);
})(typeof self !== "undefined" ? self : this, function (V, S, Q) {
  // Product id from a product URL: /ip/Some-Name/10315479 → "10315479".
  const productId = url => { const m = String(url).match(/\/ip\/(?:[^/?#]+\/)?(\d{4,15})(?:[/?#]|$)/); return m ? m[1] : null; };

  // The page data from a document or from fetched HTML.
  function nextData(src) {
    let text = null;
    if (typeof src === "string") { const m = src.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); text = m && m[1]; }
    else if (src && src.getElementById) { const el = src.getElementById("__NEXT_DATA__"); text = el && el.textContent; }
    if (!text) return null;
    try { const d = JSON.parse(text); return d && d.props && d.props.pageProps && d.props.pageProps.initialData && d.props.pageProps.initialData.data || null; } catch { return null; }
  }

  // The parts of the page data the extension uses.
  function product(data) {
    if (!data || !data.product) return null;
    const p = data.product, idml = data.idml || {};
    const ing = idml.ingredients && idml.ingredients.ingredients;
    return {
      id: p.usItemId ? String(p.usItemId) : null, name: p.name || "", upc: p.upc ? String(p.upc).replace(/\D/g, "") : "", brand: p.brand || "",
      category: ((p.category && p.category.path) || []).map(c => c && c.name).filter(Boolean),
      ingredients: ing && typeof ing.value === "string" ? ing.value : "",
      nutrition: idml.nutritionFacts || null,
    };
  }

  // "1.5g" → { v: 1.5, u: "g" }; "<1g" and "less than 1g" → half the bound; "140" → { v: 140, u: "" }.
  function amount(s) {
    const t = String(s == null ? "" : s).trim().toLowerCase();
    const m = t.match(/^(<|less than)?\s*([\d.]+)\s*(mcg|mg|g|kcal)?$/);
    if (!m) return null;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) return null;
    return { v: m[1] ? v / 2 : v, u: m[3] || "" };
  }
  // Nutrient names on Walmart's panel → the app's keys.
  const NAMES = [[/^calories?$/, "cal"], [/^total fat$/, "fat"], [/^sat(urated)? fat$/, "sat"], [/^trans fat$/, "trans"], [/^cholest(erol)?$/, "chol"],
    [/^sodium$/, "na"], [/^(total )?carb(ohydrate)?s?$/, "carb"], [/^(dietary )?fiber$/, "fib"], [/^(total )?sugars?$/, "sug"],
    [/^(incl(udes|\.)? )?added sugars?$/, "add"], [/^protein$/, "pro"]];
  const keyOf = name => { const n = String(name || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim(); const hit = NAMES.find(([re]) => re.test(n)); return hit ? hit[1] : null; };

  // Every nutrient row in the panel, wherever it sits.
  function rows(nf) {
    const out = [];
    const visit = n => { if (!n || typeof n !== "object") return; if (n.name && n.amount != null) out.push(n); for (const c of n.childNutrients || []) visit(c); };
    if (nf && nf.calorieInfo) visit(nf.calorieInfo.mainNutrient);
    for (const v of (nf && nf.keyNutrients && nf.keyNutrients.values) || []) { visit(v.mainNutrient); for (const c of v.childNutrients || []) visit(c); }
    return out;
  }
  const servingOf = nf => { const s = ((nf && nf.servingInfo && nf.servingInfo.values) || []).find(x => /serving size/i.test(x.name || "")); return s && s.value ? String(s.value) : ""; };

  // The panel as an app food, or null when the page has no usable panel (no calories, protein, fat or carbs).
  function fromPanel(p) {
    if (!p || !p.nutrition) return null;
    const v = {}, found = new Set();
    for (const r of rows(p.nutrition)) {
      const k = keyOf(r.name), a = amount(r.amount);
      if (!k || !a || found.has(k)) continue;
      let x = a.v;
      if (k === "na" || k === "chol") x = a.u === "g" ? x * 1000 : a.u === "mcg" ? x / 1000 : x; // mg
      else if (k !== "cal") x = a.u === "mg" ? x / 1000 : a.u === "mcg" ? x / 1e6 : x; // g
      v[k] = x; found.add(k);
    }
    if (!["cal", "fat", "carb", "pro"].some(k => found.has(k))) return null;
    const missing = V.NUM_KEYS.filter(k => !found.has(k));
    const f = S.makeFood(shortName(p), servingOf(p.nutrition) || "1 serving", v, { src: "walmart", missing, upc: p.upc, ingredients: p.ingredients || undefined });
    return S.settleAddedSugar(f, found.has("add"), false);
  }

  // Product names are long ("Cheerios, Heart Healthy Gluten Free Breakfast Cereal, Family Size, 18 oz"); keep the
  // first part that says what it is.
  function shortName(p) {
    const n = String(p.name || "").replace(/\s+/g, " ").trim();
    return n.length <= 60 ? n : n.slice(0, 57).replace(/[ ,]+\S*$/, "") + "…";
  }

  // Produce sticker codes (a 4–5 digit PLU, stored as zeros + PLU + check digit, e.g. 000000940115 for 94011) and
  // in-store weighed items (UPCs starting with 2) aren't real product barcodes: looking them up returns unrelated
  // products, so these are matched to built-in foods by name instead. Real barcodes have 7+ significant digits.
  const isPlu = upc => { const core = String(upc || "").replace(/^0+/, ""); return core.length > 0 && core.length <= 6; };
  const isWeighed = upc => /^0?2\d{10}$/.test(String(upc || ""));
  const FRESH = /fresh produce|fresh fruit|fresh vegetable|meat & seafood|fresh meat|fresh seafood|^produce$/i;
  const isFood = p => p && (p.category.some(c => /^food$|grocery|beverage|produce|dairy|meat|frozen|pantry|snack|protein/i.test(c)) || !!p.nutrition);

  // How to get this product's nutrition: { kind: "panel" | "name" | "barcode" | "none", ... }.
  function plan(p) {
    if (!p) return { kind: "none", why: "Not a product page." };
    const f = fromPanel(p);
    if (f) return { kind: "panel", food: f };
    if (!isFood(p)) return { kind: "none", why: "Not a food." };
    const fresh = p.category.some(c => FRESH.test(c));
    if (isPlu(p.upc) || isWeighed(p.upc) || (fresh && !p.upc)) return { kind: "name", query: produceQuery(p.name) };
    if (p.upc && p.upc.replace(/^0+/, "").length >= 7) return { kind: "barcode", code: p.upc };
    return fresh ? { kind: "name", query: produceQuery(p.name) } : { kind: "none", why: "No nutrition facts or barcode on this page." };
  }

  // "Marketside Fresh Organic Bananas, Bunch" → "Bananas".
  const PRODUCE_NOISE = /\b(marketside|great value|freshness guaranteed|fresh|organic|each|bunch|bag|bundle|package|pack|count|ct|lb|lbs|oz|whole|large|medium|small|premium|conventional)\b|\d+(\.\d+)?/gi;
  const produceQuery = name => String(name || "").split(",")[0].replace(PRODUCE_NOISE, " ").replace(/\s+/g, " ").trim();

  // A built-in food for a name-matched product, or null when the match isn't confident.
  function byName(query, foods) {
    if (!query) return null;
    const r = Q.resolve(query, foods);
    return r.kind === "open" || r.kind === "closest" ? r.food : null;
  }

  return { productId, nextData, product, amount, keyOf, rows, fromPanel, plan, produceQuery, byName, isPlu, isWeighed, shortName };
});
