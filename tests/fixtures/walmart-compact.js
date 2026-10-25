// Rebuilds Walmart page data ({ product, idml }) from the compact captured form in walmart-audit.json.
// Row tags: cal; kN (key nutrient N); kN+ (child of value N); kN+> (child of that child); kN> (child of the main nutrient); serv.
const nut = (name, amount, dvp) => ({ name, amount, dvp, standardServingAmount: null, childNutrients: null });
function build({ h, ing, rows }) {
  const [usItemId, name, upc, brand, cat] = h.split(" ¦ ");
  let nf = { calorieInfo: null, keyNutrients: null, vitaminMinerals: null, servingInfo: null };
  if (rows.length) {
    const values = [], serv = []; let cal = null, lastChild = null;
    for (const line of rows) {
      const [tag, n, a, d] = line.split("|");
      if (tag === "cal") cal = { name: "Calorie Information", mainNutrient: nut(n, a, d), childNutrients: null };
      else if (tag === "serv") serv.push({ name: n, value: a, attribute: null, values: null });
      else if (tag.endsWith("+>")) { lastChild.childNutrients = [...(lastChild.childNutrients || []), nut(n, a, d)]; }
      else if (tag.endsWith("+")) { const v = values[values.length - 1]; lastChild = nut(n, a, d); v.childNutrients = [...(v.childNutrients || []), lastChild]; }
      else if (tag.endsWith(">")) { const v = values[values.length - 1]; v.mainNutrient.childNutrients = [...(v.mainNutrient.childNutrients || []), nut(n, a, d)]; }
      else values.push({ name: null, mainNutrient: nut(n, a, d), childNutrients: null });
    }
    nf = { calorieInfo: cal, keyNutrients: { name: "Key Nutrients", values }, vitaminMinerals: null, servingInfo: { name: "Serving Information", values: serv } };
  }
  return { product: { usItemId, name, upc, brand, category: { path: cat.split(" > ").map(name => ({ name })) } },
    idml: { ingredients: { ingredients: ing ? { name: "Ingredients", value: ing } : null }, nutritionFacts: nf } };
}
const AUDIT = require("./walmart-audit.json").products;
module.exports = { build, AUDIT, data: k => build(AUDIT[k]) };
