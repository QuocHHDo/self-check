// Costco product pages, rebuilt from what live costco.com pages carried (Oct 26, 2026): JSON-LD Product and
// BreadcrumbList blocks, and the item's record in the Next.js stream data (quotes escaped, as on the page). Only the
// fields js/costco.js reads; prices are as shown that day.
const ITEMS = {
  cheerios: { pageId: "100381496", slug: "general-mills-cheerios-cereal-2035-oz-2-count", sku: "522107", name: "General Mills Cheerios Cereal, 20.35 oz, 2-count",
    brand: "Cheerios", price: 8.49, crumbs: ["Home", "Grocery & Household Essentials", "Breakfast", "Cereal"], upc: "016000435094", dept: "FOOD", deptNo: "13", uom: "OUNCE", factor: "40.7" },
  pb: { pageId: "100334841", slug: "kirkland-signature-organic-peanut-butter-28-oz-2-count", sku: "1065227", name: "Kirkland Signature Organic Creamy Peanut Butter, 28 oz, 2-count",
    brand: "Kirkland Signature", price: 11.69, image: "https://gdx-assets.costco.com/test/pb-label.jpg", crumbs: ["Home", "Grocery & Household Essentials", "Pantry & Dry Goods", "Nut Butters"], upc: "096619555017", dept: "FOOD", deptNo: "13", uom: "OUNCE", factor: "56" },
  bananas: { pageId: "100100008", slug: "bananas-3-lbs", sku: "30669", name: "Bananas, 3 lbs", brand: "", price: 1.99,
    crumbs: ["Home", "Grocery & Household Essentials", "Fruit & Vegetables"], upc: "40000030669", dept: "PRODUCE", deptNo: "65", uom: "POUND", factor: "3" },
  towels: { pageId: "100333813", slug: "kirkland-signature-create-a-size-paper-towels", sku: "1200224", name: "Kirkland Signature Create-A-Size Paper Towels, 12 Rolls",
    brand: "Kirkland Signature", price: 23.99, crumbs: ["Home", "Grocery & Household Essentials", "Kirkland Signature Grocery"], upc: "096619880676", dept: "SUNDRIES", deptNo: "14", uom: "EACH", factor: "1" },
  d3: { pageId: "4000243651", slug: "kirkland-signature-vitamin-d3-50-mcg-600-softgels", sku: "1732870", name: "Kirkland Signature Vitamin D3 50 mcg., 600 Softgels",
    brand: "Kirkland Signature", price: 13.99, crumbs: ["Home", "Health & Personal Care", "Vitamins, Herbals & Dietary Supplements"], upc: "196633766922", dept: "PHARMACY (OTC)", deptNo: "26", uom: "EACH", factor: "1" },
};
const url = k => `https://www.costco.com/p/-/${ITEMS[k].slug}/${ITEMS[k].pageId}`;
// The page's data parts. `layout` adds the title, the rating block and the buy box around them, for the browser tests.
function html(k, { layout = "" } = {}) {
  const v = ITEMS[k];
  const ld = { "@context": "https://schema.org", "@type": "Product", name: v.name, sku: v.sku, ...(v.image ? { image: [v.image] } : {}), ...(v.brand ? { brand: { "@type": "Brand", name: v.brand } } : {}),
    offers: { "@type": "Offer", price: String(v.price), priceCurrency: "USD" }, aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: "512" } };
  const bc = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: v.crumbs.map((name, i) => ({ "@type": "ListItem", position: i + 1, name })) };
  const rec = `{"id":"${v.sku}","clientId":"c${v.sku}","parentId":["${v.pageId}"],"itemType":"Item","upc":"${v.upc}","as400DeptNumber":"${v.deptNo}","uom":"${v.uom}","gtin":null,"factor":"${v.factor}","as400DeptName":"${v.dept}"}`;
  const flight = `(self.__next_f = self.__next_f || []).push([1,"5:${JSON.stringify({ item: "@@" }).replace(/"/g, '\\"').replace("\\\"@@\\\"", rec.replace(/"/g, '\\"'))}\\n"])`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${v.name} | Costco</title>
<script type="application/ld+json">${JSON.stringify(ld)}</script><script type="application/ld+json">${JSON.stringify(bc)}</script></head><body>${layout}
<script>${flight}</script></body></html>`;
}
module.exports = { ITEMS, url, html };
