// The phone bookmarklet: run its code against captured Walmart page data, then open the result the way the app does.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const BM = require("../js/bookmarklet.js");
const B = require("../js/backup.js");
const W = require("../js/walmart.js");
const V = require("../js/verdict.js");
const { data } = require("./fixtures/walmart-compact.js");
const SITE = "https://quochhdo.github.io/self-check/";

// A minimal Walmart product page for the bookmarklet's code: its page data, address, and alert/fetch.
function runOn({ host = "www.walmart.com", path, pageData, fetched }) {
  const out = { href: null, alerts: [] };
  const next = d => JSON.stringify({ props: { pageProps: { initialData: { data: d } } } });
  const ctx = {
    location: { hostname: host, pathname: path, get href() { return "https://" + host + path; }, set href(v) { out.href = v; } },
    document: { getElementById: id => id === "__NEXT_DATA__" && pageData ? { textContent: next(pageData) } : null },
    fetch: async () => ({ text: async () => `<html><script id="__NEXT_DATA__" type="application/json">${next(fetched)}</script></html>` }),
    alert: m => out.alerts.push(m), btoa: s => Buffer.from(s, "binary").toString("base64"), unescape, encodeURIComponent, JSON, String, Promise,
  };
  const code = decodeURIComponent(BM.url(SITE).slice("javascript:".length));
  return vm.runInNewContext(code, ctx).then(() => out);
}
const token = href => href.slice((SITE + "#wm=").length);

test("on a product page it opens the app with the product, and the app reads the panel", async () => {
  const out = await runOn({ path: "/ip/Chobani-Greek/21291511", pageData: data("chobani greek yogurt") });
  assert.ok(out.href.startsWith(SITE + "#wm=j."), out.href.slice(0, 60));
  const p = W.product(await B.decodeProduct(token(out.href)));
  assert.equal(p.name, "Chobani Non-Fat Greek Yogurt Plain 32 oz Tub");
  const pl = W.plan(p);
  assert.equal(pl.kind, "panel");
  assert.equal(V.assess(pl.food, V.DEFAULT_PROFILE).word, "Get it");
});

test("after Walmart changes pages without a reload, it fetches the current product instead of using stale data", async () => {
  const out = await runOn({ path: "/ip/Oreo/5035879686", pageData: data("chobani greek yogurt"), fetched: data("oreo cookies") });
  assert.match(W.product(await B.decodeProduct(token(out.href))).name, /^OREO/);
});

test("no-panel and produce pages carry what the app needs (barcode, category)", async () => {
  const jif = W.plan(W.product(await B.decodeProduct(token((await runOn({ path: "/ip/Jif/777839120", pageData: data("jif creamy peanut butter") })).href))));
  assert.deepEqual(jif, { kind: "barcode", code: "051500255162" });
  const avo = W.plan(W.product(await B.decodeProduct(token((await runOn({ path: "/ip/Avocado/44390949", pageData: data("fresh hass avocado") })).href))));
  assert.equal(avo.kind, "name");
});

test("anywhere else it explains instead of sending anything", async () => {
  const out = await runOn({ host: "www.example.com", path: "/ip/x/123", pageData: data("oreo cookies") });
  assert.equal(out.href, null);
  assert.match(out.alerts[0], /Open a Walmart product page first/);
  const search = await runOn({ path: "/search", pageData: null });
  assert.equal(search.href, null);
});

test("the app refuses anything that isn't a bookmarklet product", async () => {
  assert.equal(await B.decodeProduct("j." + Buffer.from('{"app":"other"}').toString("base64url")), null);
  assert.equal(await B.decodeProduct("z.abc"), null);
  assert.equal(await B.decodeProduct("j.%%%"), null);
});
