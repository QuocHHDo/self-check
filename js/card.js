// What the extension's product card says: a one-line reason, bars for the three daily limits, the reasons that
// decided the verdict (the rest folded away), and a better swap. Pure functions on top of verdict.js, so the card can't
// disagree with the app and the tests can check the wording.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./verdict.js"));
  else root.SelfCheckCard = factory(root.SelfCheckVerdict);
})(typeof self !== "undefined" ? self : this, function (V) {
  const pct = (x, t) => Math.round(x / t * 100);
  // Short labels for scored reasons (r.n from assess), for the headline.
  const PLUS = { pro: (f, p, r) => r.d >= 2 ? "high protein for the calories" : "decent protein", fib: "a good fiber source", whole: f => f.c === "fruit" ? "whole fruit" : "a whole vegetable",
    grain: "whole grain", volume: "lots of food for few calories", goodfat: "mostly healthy fats", evidence: "backed by research beyond the label" };
  const MINUS = {
    sat: (f, p) => `${pct(f.sat, p.sat)}% of your saturated-fat limit`, na: (f, p) => `${pct(f.na, p.na)}% of your sodium limit`,
    add: (f, p) => `${pct(f.add, p.add)}% of your added-sugar limit`, trans: () => "some trans fat", sug: () => "a lot of sugar",
    treat: () => "a treat", processed: () => "processed meat", empty: () => "little protein or fiber", cal: f => `${Math.round(f.cal)} calories with little protein`,
  };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const label = (map, r, f, p) => { const m = map[r.n]; return typeof m === "function" ? m(f, p, r) : m || ""; };
  const byWeight = list => [...list].sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  // One sentence on why: the strongest plus and minus ("Mostly healthy fats, but 15% of your saturated-fat limit.").
  // Falls back to the verdict's own line when something other than the score decided it (skip list, missing data).
  function headline(f, p, a = V.assess(f, p)) {
    if (a.tier === "skip" || a.tier === "fine") return a.why;
    const scored = a.reasons.filter(r => r.n && r.d);
    const plus = byWeight(scored.filter(r => r.d > 0)).map(r => label(PLUS, r, f, p)).filter(Boolean);
    const minus = byWeight(scored.filter(r => r.d < 0)).map(r => label(MINUS, r, f, p)).filter(Boolean);
    const overridden = a.reasons.some(r => r.k === "warn" && /^Can't (rate it|be) "Get it"/.test(r.t));
    if (overridden) return a.why;
    // "Limit it" leads with what's wrong; "In moderation" weighs one against the other.
    if (a.tier === "bad" && minus.length) return `${cap(minus[0])}${minus[1] ? ` and ${minus[1]}` : ""}${plus.length ? `, despite ${plus[0]}` : ""}.`;
    if (plus.length && minus.length) return `${cap(plus[0])}, but ${minus[0]}.`;
    if (minus.length) return `${cap(minus[0])}${minus[1] ? ` and ${minus[1]}` : ""}.`;
    if (plus.length) return a.tier === "good" ? `${cap(plus[0])}${plus[1] ? ` and ${plus[1]}` : ""}.` : `${cap(plus[0])}, but not much else going for it.`;
    // Nothing scored either way: the verdict's own explanation ("Not much fiber or protein for its 150 calories…").
    const warn = a.reasons.find(r => r.k === "warn" && !/^Partial data/.test(r.t));
    return warn ? warn.t.replace(/, so it won't do much to keep you full\.$/, ".") : a.why;
  }

  // Saturated fat, sodium and added sugar against your daily limits, with the verdict's own cutoffs as ticks.
  const LIMITS = ["sat", "na", "add"];
  function limitBars(f, p) {
    const b = V.breakdown(f, p);
    if (!b) return [];
    return b.rows.filter(r => LIMITS.includes(r.k)).map(r => ({
      k: r.k, name: { sat: "Sat fat", na: "Sodium", add: "Added sugar" }[r.k], known: r.known,
      share: r.known ? r.v : null, fill: r.known ? Math.min(1, Math.max(0, r.v) / r.max) : 0, marks: r.marks.filter(m => m < r.max).map(m => m / r.max),
      tone: !r.known ? "na" : r.points <= -2 ? "bad" : r.points < 0 ? "warn" : "ok",
      value: r.known ? `${r.atLeast ? "≥" : ""}${r.k === "na" ? Math.round(f.na).toLocaleString("en-US") + " mg" : V.fmt(f[r.k]) + " g"} · ${pct(r.v, 1)}%` : "not listed",
    }));
  }

  // The reasons that decided the verdict come first (biggest effect first, plus anything that capped it); the rest,
  // and additive flags, are folded under "more".
  function reasons(a, flagged = []) {
    const scored = byWeight(a.reasons.filter(r => r.n && r.d)).slice(0, 2);
    const capped = a.reasons.filter(r => r.k === "warn" && (/^Can't/.test(r.t) || /^Spicy/.test(r.t)));
    const top = [...capped, ...scored];
    const rest = [...a.reasons.filter(r => !top.includes(r)), ...flagged.map(x => ({ k: "warn", t: `${x.name}${x.code ? ` (${x.code})` : ""}: ${x.flag.t}` }))];
    return { top, rest };
  }

  // A better option of the same kind, and a Walmart search for it ("Peanut butter, natural" → "natural peanut butter").
  function swap(f, foods, p) {
    const s = V.findSwaps(f, foods, p, 1)[0];
    if (!s) return null;
    return { food: s.food, verdict: s.verdict, query: searchName(s.food.n), lighter: s.lighter || null };
  }
  function searchName(n) {
    const [head, ...rest] = String(n).split(",").map(x => x.trim()).filter(Boolean);
    const extra = rest.join(" ").replace(/\b(plain|regular|store|canned|cooked|raw|unsweetened|fresh|frozen)\b/gi, "").replace(/\s+/g, " ").trim();
    return (extra && extra.split(" ").length <= 2 ? `${extra} ${head}` : head).toLowerCase();
  }
  const walmartSearch = q => "https://www.walmart.com/search?q=" + encodeURIComponent(q);

  // What a dollar buys, by the app's rule (js/prices.js value): protein when the food is a real protein source
  // (at least 5 g and 20% of calories), else fiber when it's a good source (2.8 g+).
  function perDollar(f, cost) {
    if (!(cost > 0) || !f) return null;
    if ((f.pro || 0) >= 5 && f.cal > 0 && f.pro * 4 / f.cal >= 0.2) return `${Math.round(f.pro / cost)} g protein per $1`;
    if ((f.fib || 0) >= 2.8) return `${Math.round(f.fib / cost * 10) / 10} g fiber per $1`;
    return null;
  }
  const money = v => `$${v.toFixed(2)}`;

  return { headline, limitBars, reasons, swap, searchName, walmartSearch, perDollar, money };
});
