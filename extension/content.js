// Adds a "Should I Buy It?" card to Walmart product pages. Nutrition comes from, in order: the page's own Nutrition
// Facts panel; for fresh produce, a name match to the app's built-in foods; otherwise the product's barcode in Open
// Food Facts, then USDA Branded Foods. The verdict is the site's own (lib/verdict.js) with your saved goals.
(() => {
  "use strict";
  const V = self.SelfCheckVerdict, S = self.SelfCheckSources, W = self.SelfCheckWalmart, ADD = self.SelfCheckAdditives;
  const { FOODS } = self.SelfCheckData;
  const SITE = "https://quochhdo.github.io/self-check/";
  const firstUrl = location.href; // the embedded page data belongs to this URL; later (client-side) pages are fetched
  let lastUrl = null, run = 0, host = null, dismissed = null;

  const store = keys => new Promise(r => { try { chrome.storage.local.get(keys, v => r(v || {})); } catch { r({}); } });
  const save = obj => { try { chrome.storage.local.set(obj); } catch {} };
  const bg = url => new Promise(r => { try { chrome.runtime.sendMessage({ type: "fetch", url }, res => r(res || { ok: false, status: 0 })); } catch { r({ ok: false, status: 0 }); } });

  // ---------- data ----------
  async function pageProduct(url) {
    if (url === firstUrl) { const p = W.product(W.nextData(document)); if (p) return p; }
    const res = await fetch(url, { credentials: "include" });
    return W.product(W.nextData(await res.text()));
  }
  async function byBarcode(code, key) {
    const off = await bg(S.offProductUrl(code));
    if (off.ok && off.json && off.json.status === 1 && off.json.product) {
      const f = S.fromOff(code, off.json.product);
      if (!["cal", "fat", "carb", "pro"].every(k => V.isMissing(f, k))) return { food: f, via: `Open Food Facts, by barcode ${code}`, link: `#off-${code}` };
    }
    for (const q of S.usdaUpcQueries(code)) {
      const u = await bg(S.usdaUpcUrl(q, key));
      if (!u.ok) break;
      const hit = S.matchUpc(u.json && u.json.foods, code);
      if (hit) { const f = S.fromUsda(hit); return { food: f, via: `USDA Branded Foods, by barcode ${code}`, link: f.fdcId ? `#usda-${f.fdcId}` : null }; }
    }
    return null;
  }
  async function resolve(p, profile) {
    const plan = W.plan(p);
    if (plan.kind === "panel") return { food: plan.food, via: "Walmart's Nutrition Facts panel" };
    if (plan.kind === "name") {
      const f = W.byName(plan.query, FOODS);
      return f ? { food: f, via: `the app's built-in “${f.n}”, matched by name (typical values)`, link: "#" + V.slug(f.n), matched: true } : { none: "This page has no nutrition facts, and it didn't match a food the app knows." };
    }
    if (plan.kind === "barcode") return (await byBarcode(plan.code, profile.usdaKey)) || { none: "This page has no nutrition facts, and neither Open Food Facts nor USDA has its barcode." };
    return null; // not a food: no card
  }

  // ---------- card ----------
  const CSS = `
  :host { all: initial; }
  .card { --good:#2b7742; --good-soft:#dff0e2; --mid:#8e5f16; --mid-soft:#f6ead2; --bad:#b23a2f; --bad-soft:#f6dfdb; --ink:#161813; --muted:#5b6157; --line:#d8dccf; --bg:#ffffff;
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 330px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto;
    background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.18);
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) { .card { --good:#6fc487; --good-soft:#1c3322; --mid:#e0a94a; --mid-soft:#3a2e17; --bad:#ef8577; --bad-soft:#3d201c; --ink:#e8ebe2; --muted:#a1a898; --line:#30352b; --bg:#1b1e18; } }
  .top { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; }
  .brand { font: 700 11px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); flex: 1; }
  button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 8px; padding: 2px 8px; cursor: pointer; }
  button:focus-visible, a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .body { padding: 6px 12px 12px; display: grid; gap: 6px; }
  .verdict { font: 800 26px/1.1 system-ui, sans-serif; }
  .good .verdict { color: var(--good); } .mid .verdict { color: var(--mid); } .bad .verdict, .skip .verdict { color: var(--bad); } .fine .verdict { color: var(--muted); }
  .name { font-weight: 600; } .why { margin: 0; } .muted { color: var(--muted); font-size: 12.5px; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; font-size: 13px; }
  .ic { font-weight: 800; text-align: center; } .pos .ic { color: var(--good); } .neg .ic { color: var(--bad); } .warn .ic { color: var(--mid); } .note .ic { color: var(--muted); }
  a { color: var(--good); }
  .pill { all: unset; cursor: pointer; position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; padding: 8px 14px; border-radius: 999px; font: 700 13px system-ui, sans-serif;
    box-shadow: 0 6px 18px rgba(0,0,0,.2); background: #161813; color: #fff; }
  .pill.good { background: #2b7742; } .pill.mid { background: #8e5f16; } .pill.bad, .pill.skip { background: #b23a2f; }
  .pill:focus-visible { outline: 3px solid #fff; outline-offset: -5px; }`;
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids) if (c != null && c !== false) e.append(c);
    return e;
  };
  function mount() {
    if (host && host.isConnected) return host.shadowRoot;
    host = el("div", { id: "should-i-buy-it-card" });
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", { text: CSS }));
    document.documentElement.append(host);
    return root;
  }
  function unmount() { if (host) host.remove(); host = null; }
  function show(...nodes) { const root = mount(); [...root.children].forEach(c => { if (c.tagName !== "STYLE") c.remove(); }); root.append(...nodes); }

  const goalsLine = p => `${p.cal.toLocaleString("en-US")} cal · ${p.pro} g protein · ≤${p.sat} g sat fat · ≤${p.na.toLocaleString("en-US")} mg sodium`;
  function header(collapse) {
    return el("div", { class: "top" }, el("span", { class: "brand", text: "Should I Buy It?" }),
      collapse ? el("button", { type: "button", "aria-label": "Minimize", text: "–", onclick: collapse }) : null,
      el("button", { type: "button", "aria-label": "Close for this product", text: "×", onclick: () => { dismissed = location.href; unmount(); } }));
  }
  function renderLoading() { show(el("div", { class: "card", role: "region", "aria-label": "Should I Buy It?" }, header(), el("div", { class: "body" }, el("p", { class: "muted", text: "Checking this product…" })))); }
  function renderNone(msg) {
    show(el("div", { class: "card", role: "region", "aria-label": "Should I Buy It?" }, header(),
      el("div", { class: "body" }, el("p", { class: "why", text: msg }), el("p", { class: "muted", text: "Look it up by name in the app instead." }),
        el("a", { href: SITE, target: "_blank", rel: "noopener", text: "Open Should I Buy It?" }))));
  }
  function renderVerdict(r, p, collapsed) {
    const f = r.food, a = V.assess(f, p);
    const expand = () => { save({ collapsed: false }); renderVerdict(r, p, false); };
    if (collapsed) {
      show(el("button", { class: "pill " + a.tier, type: "button", "aria-label": `Should I Buy It? ${a.word}. Show details`, onclick: expand }, `${a.word} · Should I Buy It?`));
      return;
    }
    const collapse = () => { save({ collapsed: true }); renderVerdict(r, p, true); };
    const fmt = V.fmt, amt = (k, u) => V.isMissing(f, k) ? "—" : (k === "na" ? Math.round(f[k]).toLocaleString("en-US") : fmt(f[k])) + u;
    const ICON = { pos: "+", neg: "−", warn: "!", note: "i" };
    const reasons = a.reasons.slice(0, 5).map(x => el("li", { class: x.k }, el("span", { class: "ic", "aria-hidden": "true", text: ICON[x.k] || "i" }), el("span", { text: x.t })));
    const adds = ADD && ADD.analyze(f);
    const flagged = adds ? adds.flagged.map(x => el("li", { class: "warn" }, el("span", { class: "ic", "aria-hidden": "true", text: "!" }), el("span", { text: `${x.name}${x.code ? ` (${x.code})` : ""}: ${x.flag.t}` }))) : [];
    show(el("div", { class: "card " + a.tier, role: "region", "aria-label": `Should I Buy It? ${a.word}` }, header(collapse),
      el("div", { class: "body" },
        el("div", { class: "verdict", text: a.word }),
        el("div", { class: "name", text: r.matched ? `${f.n} (typical)` : f.n }),
        el("p", { class: "why", text: a.why }),
        el("p", { class: "muted", text: `Per ${f.s} · from ${r.via}.` }),
        el("div", { class: "facts" }, el("span", { text: `${amt("cal", "")} cal` }), el("span", { text: `${amt("pro", " g")} protein` }),
          el("span", { text: `${amt("sat", " g")} sat fat` }), el("span", { text: `${amt("na", " mg")} sodium` }), el("span", { text: `${amt("add", " g")} added sugar` })),
        el("ul", {}, ...reasons, ...flagged),
        r.link ? el("a", { href: SITE + r.link, target: "_blank", rel: "noopener", text: "Full breakdown in the app" }) : null,
        el("p", { class: "muted" }, `Your goals: ${goalsLine(p)}. `, el("a", { href: "#", onclick: e => { e.preventDefault(); try { chrome.runtime.sendMessage({ type: "options" }); } catch {} }, text: "Change" })))));
  }

  // ---------- page changes ----------
  async function check() {
    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    if (!W.productId(url) || dismissed === url) { if (!W.productId(url)) unmount(); return; }
    const mine = ++run;
    const saved = await store(["profile", "usdaKey", "collapsed"]);
    const p = { ...V.DEFAULT_PROFILE, ...(saved.profile || {}), usdaKey: saved.usdaKey || "" };
    renderLoading();
    try {
      const prod = await pageProduct(url);
      if (mine !== run) return;
      const r = await resolve(prod, p);
      if (mine !== run) return;
      if (!r) return unmount();
      if (r.none) return renderNone(r.none);
      renderVerdict(r, p, !!saved.collapsed);
    } catch {
      if (mine === run) renderNone("Couldn't read this page. Reload it to try again.");
    }
  }
  check();
  // Walmart changes pages without reloading, so watch the address.
  setInterval(check, 700);
  window.addEventListener("popstate", check);
  // Goals changed in the settings page: redraw.
  try { chrome.storage.onChanged.addListener(changes => { if (changes.profile || changes.usdaKey) { lastUrl = null; check(); } }); } catch {}
})();
