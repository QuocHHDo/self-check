// Typical price per serving and value-for-money, from js/prices-data.js, with the user's own prices on top.
// Prices never affect the verdict: cheap isn't the same as healthy.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./prices-data.js"));
  else root.SelfCheckPrices = factory(root.SelfCheckPricesData);
})(typeof self !== "undefined" ? self : this, function (DATA) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = ym => ym ? `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}` : "";
  const money = v => v == null ? "" : v < 0.995 ? `$${v.toFixed(2)}` : `$${v.toFixed(2)}`;

  // own: { [food name]: { unit: number } }  — what the user pays per unit (lb, dozen, gal…), or
  //      { serving: number } for foods with no typical price.
  // Returns null when there's no price at all.
  function price(f, own = {}) {
    if (!f) return null;
    const d = DATA.foods[f.n], mine = own[f.n];
    const mult = f.mult || 1;
    if (mine && mine.serving > 0) return { cost: mine.serving * mult, perServing: mine.serving, mine: true, unitLabel: "serving", unitPrice: mine.serving, typical: d ? d[0] : null };
    if (!d) return null;
    const [cost, unitPrice, unitLabel, src, region, ym, note, per] = d;
    const one = mine && mine.unit > 0 ? mine.unit * (per || cost / unitPrice) : cost;
    return {
      cost: one * mult, perServing: one, typical: cost, unitPrice: mine && mine.unit > 0 ? mine.unit : unitPrice, unitLabel,
      mine: !!(mine && mine.unit > 0), src, region, month: monthLabel(ym), note,
      source: src === "bls" ? `BLS average price, ${region === "South" ? "South region" : "U.S. average"}, ${monthLabel(ym)}`
        : `USDA ERS 2023 price, adjusted to ${monthLabel(ym)} with the CPI`,
    };
  }

  // What a dollar buys: protein when the food is a real protein source, else fiber when it's a real fiber source.
  function value(f, p) {
    if (!p || !(p.perServing > 0)) return null;
    const per = k => (f[k] || 0) / p.perServing;
    if ((f.pro || 0) >= 5) return { k: "pro", v: per("pro"), text: `${Math.round(per("pro"))} g protein per $1` };
    if ((f.fib || 0) >= 2.8) return { k: "fib", v: per("fib"), text: `${Math.round(per("fib") * 10) / 10} g fiber per $1` };
    return null;
  }

  // Total for a plate: the sum of items that have a price, and how many don't.
  function plateCost(items, own = {}) {
    let total = 0, priced = 0;
    for (const { food, mult } of items || []) {
      const p = price({ ...food, mult: mult || 1 }, own);
      if (p) { total += p.cost; priced++; }
    }
    return { total, priced, missing: (items || []).length - priced };
  }

  return { price, value, plateCost, money, meta: DATA.meta, has: n => !!DATA.foods[n] };
});
