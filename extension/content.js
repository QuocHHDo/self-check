// Adds a "Should I Buy It?" card to Walmart product pages. Nutrition comes from, in order: the page's own Nutrition
// Facts panel; for fresh produce, a name match to the app's built-in foods; otherwise the product's barcode in Open
// Food Facts, then USDA Branded Foods. The verdict is the site's own (lib/verdict.js) with your saved goals.
(() => {
  "use strict";
  const V = self.SelfCheckVerdict, S = self.SelfCheckSources, W = self.SelfCheckWalmart, ADD = self.SelfCheckAdditives, C = self.SelfCheckCard, B = self.SelfCheckBackup;
  const { FOODS } = self.SelfCheckData;
  const SITE = "https://quochhdo.github.io/self-check/";
  const firstUrl = location.href; // the embedded page data belongs to this URL; later (client-side) pages are fetched
  let lastUrl = null, run = 0, host = null, dismissed = null;
  let toApp = []; // items waiting to be sent to the app's grocery list: [{ n, qty, food }]
  let redraw = null; // re-renders the current card (after the list changes)

  const store = keys => new Promise(r => { try { chrome.storage.local.get(keys, v => r(v || {})); } catch { r({}); } });
  const save = obj => { try { chrome.storage.local.set(obj); } catch {} };
  const bg = url => new Promise(r => { try { chrome.runtime.sendMessage({ type: "fetch", url }, res => r(res || { ok: false, status: 0 })); } catch { r({ ok: false, status: 0 }); } });

  // ---------- data ----------
  async function pageProduct(url) {
    if (url === firstUrl) { const p = W.product(W.nextData(document)); if (p) return p; }
    const res = await fetch(url, { credentials: "include" });
    return W.product(W.nextData(await res.text()));
  }
  // Barcode lookups are cached in this browser: found for 30 days, not found for a day (in case a record gets added).
  const DAY = 864e5, KEEP = 300;
  async function cached(code) {
    const { lookupCache = {} } = await store(["lookupCache"]);
    const hit = lookupCache[code];
    return hit && Date.now() - hit.t < (hit.r ? 30 : 1) * DAY ? hit : null;
  }
  async function remember(code, r) {
    const { lookupCache = {} } = await store(["lookupCache"]);
    lookupCache[code] = { t: Date.now(), r };
    const keys = Object.keys(lookupCache);
    if (keys.length > KEEP) keys.sort((a, b) => lookupCache[a].t - lookupCache[b].t).slice(0, keys.length - KEEP).forEach(k => delete lookupCache[k]);
    save({ lookupCache });
  }
  async function byBarcodeCached(code, key) {
    const hit = await cached(code);
    if (hit) return hit.r;
    const r = await byBarcode(code, key);
    if (!(r && r.failed)) await remember(code, r); // a network failure isn't "not found"
    return r;
  }
  async function byBarcode(code, key) {
    const off = await bg(S.offProductUrl(code));
    let failed = !off.ok && (off.status === 0 || off.status >= 500);
    if (off.ok && off.json && off.json.status === 1 && off.json.product) {
      const f = S.fromOff(code, off.json.product);
      if (!["cal", "fat", "carb", "pro"].every(k => V.isMissing(f, k)))
        return { food: f, source: "Open Food Facts", detail: `Open Food Facts' record for barcode ${code}`, note: "Crowd-sourced, so check the label on the package.", link: `#off-${code}` };
    }
    for (const q of S.usdaUpcQueries(code)) {
      const u = await bg(S.usdaUpcUrl(q, key));
      if (!u.ok) { failed = failed || u.status === 0 || u.status === 429 || u.status >= 500; break; }
      const hit = S.matchUpc(u.json && u.json.foods, code);
      if (hit) { const f = S.fromUsda(hit); return { food: f, source: "USDA", detail: `USDA Branded Foods' record for barcode ${code}`, note: "The brand's own label data.", link: f.fdcId ? `#usda-${f.fdcId}` : null }; }
    }
    return failed ? { failed: true } : null;
  }
  async function resolve(p, profile) {
    const plan = W.plan(p);
    if (plan.kind === "panel") return { food: plan.food, source: "this page", detail: "The Nutrition Facts on this Walmart page", note: "" };
    if (plan.kind === "name") {
      const f = W.byName(plan.query, FOODS);
      if (f) return { food: f, source: `typical ${f.n.toLowerCase()}`, detail: `Typical values for “${f.n}” from the app`, note: "Fresh foods have no label here, so this uses the app's typical values.", link: "#" + V.slug(f.n), typical: true };
      if (plan.fallback) { const r = await byBarcodeCached(plan.fallback, profile.usdaKey); if (r && !r.failed) return r; }
      return { none: "No nutrition facts on this page, and it doesn't match a food the app knows." };
    }
    if (plan.kind === "barcode") {
      const r = await byBarcodeCached(plan.code, profile.usdaKey);
      if (r && r.failed) return { none: "Couldn't reach Open Food Facts or USDA just now. Reload the page to try again." };
      return r || { none: "No nutrition facts on this page, and Open Food Facts and USDA don't have its barcode." };
    }
    return null; // not a food: no card
  }

  // ---------- card ----------
  // Light, like Walmart's pages. Sits above the bottom-right corner, where Walmart has its own feedback button.
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { --good:#2b7742; --good-soft:#dff0e2; --mid:#8e5f16; --mid-soft:#f6ead2; --bad:#b23a2f; --bad-soft:#f6dfdb; --ink:#161813; --muted:#5b6157; --line:#e1e4da; --track:#eceee7; --bg:#ffffff;
    position: fixed; right: 16px; bottom: 88px; z-index: 2147483000; color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .card { width: 340px; max-width: calc(100vw - 32px); max-height: min(460px, calc(100vh - 120px)); overflow: auto; background: var(--bg); border: 1px solid var(--line);
    border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,.16); }
  .top { display: flex; align-items: center; gap: 6px; padding: 10px 10px 0 14px; }
  .brand { font: 700 11px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); flex: 1; }
  .ib { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--muted); font-size: 16px; }
  .ib:hover { background: var(--track); color: var(--ink); }
  .ib:focus-visible, a:focus-visible, .chip:focus-visible, summary:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .body { padding: 2px 14px 12px; display: grid; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--muted); }
  .good .dot { background: var(--good); } .mid .dot { background: var(--mid); } .bad .dot, .skip .dot { background: var(--bad); }
  .verdict { font: 800 24px/1.1 system-ui, sans-serif; display: flex; align-items: center; gap: 8px; }
  .good .verdict { color: var(--good); } .mid .verdict { color: var(--mid); } .bad .verdict, .skip .verdict { color: var(--bad); } .fine .verdict { color: var(--muted); }
  .name { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .headline { margin: 0; font-weight: 600; }
  .bars { display: grid; gap: 6px; }
  .bar { display: grid; grid-template-columns: 78px minmax(0, 1fr) 96px; gap: 8px; align-items: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .track { position: relative; height: 8px; border-radius: 4px; background: var(--track); }
  .track.na { background: repeating-linear-gradient(135deg, var(--track) 0 5px, transparent 5px 10px); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; }
  .fill.ok { background: #9aa192; } .fill.warn { background: var(--mid); } .fill.bad { background: var(--bad); }
  .tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--ink); opacity: .55; border-radius: 1px; }
  .val { text-align: right; color: var(--muted); } .val b { color: var(--ink); font-weight: 600; }
  .facts { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
  li { display: grid; grid-template-columns: 14px 1fr; gap: 6px; font-size: 13px; }
  .ic { font-weight: 800; text-align: center; } .pos .ic { color: var(--good); } .neg .ic { color: var(--bad); } .warn .ic { color: var(--mid); } .note .ic { color: var(--muted); }
  details > summary { cursor: pointer; color: var(--muted); font-size: 12.5px; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸ "; } details[open] > summary::before { content: "▾ "; }
  details[open] > summary { margin-bottom: 6px; }
  .swap { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: grid; gap: 4px; font-size: 13px; }
  .swap .lbl { font: 700 10.5px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .swap .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .vp { font: 700 10px system-ui, sans-serif; letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
  .vp.good { background: var(--good-soft); color: var(--good); } .vp.mid { background: var(--mid-soft); color: var(--mid); } .vp.bad { background: var(--bad-soft); color: var(--bad); } .vp.fine { background: var(--track); color: var(--muted); }
  a { color: var(--good); font-weight: 600; }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
  .foot details { flex: 1 1 100%; } .foot p { margin: 0 0 4px; }
  .chip { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; max-width: min(340px, calc(100vw - 32px)); padding: 9px 12px 9px 12px; background: var(--bg);
    border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 22px rgba(0,0,0,.16); }
  .chip .txt { display: grid; min-width: 0; } .chip .w { font: 800 14px system-ui, sans-serif; }
  .good .chip .w { color: var(--good); } .mid .chip .w { color: var(--mid); } .bad .chip .w, .skip .chip .w { color: var(--bad); } .fine .chip .w { color: var(--muted); }
  .chip .h { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip .chev { color: var(--muted); font-size: 12px; margin-left: auto; }
  .muted { color: var(--muted); font-size: 12.5px; margin: 0; }
  .factrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .lbtn { all: unset; cursor: pointer; font: 600 12.5px system-ui, sans-serif; color: var(--ink); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
  .lbtn.on { background: var(--good-soft); color: var(--good); border-color: transparent; }
  .lbtn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .pricerow { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; } .pricerow b { color: var(--ink); } .pricerow .pd { color: var(--good); font-weight: 600; }
  .sendrow { background: var(--good-soft); border-radius: 10px; padding: 7px 10px; font-size: 13px; }`;
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
  function show(tier, ...nodes) { const root = mount(); [...root.children].forEach(c => { if (c.tagName !== "STYLE") c.remove(); }); root.append(el("div", { class: "wrap " + (tier || "") }, ...nodes)); }
  const openSettings = () => { try { chrome.runtime.sendMessage({ type: "options" }); } catch {} };
  const ICON = { pos: "+", neg: "−", warn: "!", note: "i" };
  const reasonItem = x => el("li", { class: x.k }, el("span", { class: "ic", "aria-hidden": "true", text: ICON[x.k] || "i" }), el("span", { text: x.t }));

  function header(collapse) {
    return el("div", { class: "top" }, el("span", { class: "brand", text: "Should I Buy It?" }),
      el("button", { class: "ib", type: "button", title: "Your goals", "aria-label": "Your goals (settings)", text: "⚙", onclick: openSettings }),
      collapse ? el("button", { class: "ib", type: "button", title: "Minimize", "aria-label": "Minimize", "aria-expanded": "true", text: "–", onclick: collapse }) : null,
      el("button", { class: "ib", type: "button", title: "Hide for this product", "aria-label": "Hide for this product", text: "×", onclick: () => { dismissed = location.href; unmount(); } }));
  }
  function renderLoading(collapsed) {
    if (collapsed) return show("", el("div", { class: "chip", role: "status" }, el("span", { class: "dot" }), el("span", { class: "txt" }, el("span", { class: "h", text: "Checking this product…" }))));
    show("", el("div", { class: "card", role: "region", "aria-label": "Should I Buy It?" }, header(), el("div", { class: "body" }, el("p", { class: "muted", role: "status", text: "Checking this product…" }))));
  }
  function renderNone(msg) {
    show("", el("div", { class: "card", role: "region", "aria-label": "Should I Buy It?" }, header(),
      el("div", { class: "body" }, el("p", { class: "headline", text: msg }),
        el("a", { href: SITE, target: "_blank", rel: "noopener", text: "Look it up by name in the app ↗" }))));
  }

  // Walmart's product name, not the lookup's: a barcode record can carry another store's brand name.
  function renderVerdict(r, prod, p, collapsed) {
    const f = r.food, a = V.assess(f, p), name = W.shortName(prod);
    const headline = C.headline(f, p, a);
    if (collapsed) {
      show(a.tier, el("button", { class: "chip", type: "button", "aria-expanded": "false", "aria-label": `Should I Buy It? ${a.word}: ${headline} Show details`,
        onclick: () => { save({ collapsed: false }); renderVerdict(r, prod, p, false); } },
        el("span", { class: "dot", "aria-hidden": "true" }), el("span", { class: "txt" }, el("span", { class: "w", text: a.word }), el("span", { class: "h", text: headline })),
        el("span", { class: "chev", "aria-hidden": "true", text: "▴" })));
      return;
    }
    const collapse = () => { save({ collapsed: true }); renderVerdict(r, prod, p, true); };
    redraw = () => renderVerdict(r, prod, p, false);
    const bars = C.limitBars(f, p).map(b => el("div", { class: "bar", title: b.known ? `${b.name}: ${b.value} of your daily limit` : `${b.name}: not listed` },
      el("span", { text: b.name }),
      el("div", { class: "track" + (b.known ? "" : " na") }, b.known ? el("div", { class: "fill " + b.tone, style: `width:${(b.fill * 100).toFixed(1)}%` }) : null,
        ...b.marks.map(m => el("span", { class: "tick", style: `left:${(m * 100).toFixed(1)}%` }))),
      el("span", { class: "val" }, b.known ? el("b", { text: b.value.split(" · ")[0] }) : "not listed", b.known ? ` · ${b.value.split(" · ")[1]}` : null)));
    const adds = ADD && ADD.analyze(f);
    const why = C.reasons(a, adds ? adds.flagged : []);
    const sw = a.tier === "good" || a.tier === "fine" ? null : C.swap(f, FOODS, p);
    const listedAs = r.source !== "this page" && !r.typical && f.n && !sameProduct(f.n, prod.name) ? ` It's listed there as “${f.n}”.` : "";
    const facts = `${V.isMissing(f, "cal") ? "—" : Math.round(f.cal)} cal · ${V.isMissing(f, "pro") ? "—" : V.fmt(f.pro) + " g"} protein · per ${f.s}`;
    // Add to the app's grocery list: a built-in food goes by name; a store product carries its label values.
    const itemName = r.typical ? f.n : name;
    const onList = toApp.some(x => x.n === itemName);
    const listBtn = el("button", { class: "lbtn" + (onList ? " on" : ""), type: "button", "aria-pressed": onList ? "true" : "false",
      text: onList ? "✓ Added to list" : "+ Add to list",
      onclick: () => { toApp = onList ? toApp.filter(x => x.n !== itemName) : [...toApp, { n: itemName, qty: 1, food: r.typical ? null : { ...f, n: itemName } }]; save({ toApp }); renderVerdict(r, prod, p, false); } });
    const send = toApp.length ? el("a", { class: "send", href: SITE, target: "_blank", rel: "noopener", text: `Send ${toApp.length} to your list in the app ↗`,
      onclick: () => setTimeout(() => { toApp = []; save({ toApp }); renderVerdict(r, prod, p, false); }, 300) }) : null;
    if (send) B.encode(B.packAdd(toApp)).then(t => { send.href = SITE + "#add=" + t; });
    show(a.tier, el("div", { class: "card", role: "region", "aria-label": `Should I Buy It? ${a.word}` }, header(collapse),
      el("div", { class: "body" },
        el("div", {}, el("div", { class: "verdict" }, el("span", { class: "dot", "aria-hidden": "true" }), a.word), el("div", { class: "name", text: name })),
        el("p", { class: "headline", text: headline }),
        el("div", { class: "bars", role: "group", "aria-label": "Share of your daily limits" }, ...bars),
        el("div", { class: "factrow" }, el("span", { class: "facts", text: facts }), listBtn),
        f.storePrice && f.storePrice.perServing ? el("div", { class: "pricerow" }, el("b", { text: `≈ ${C.money(f.storePrice.perServing)} a serving` }),
          ` at Walmart's price${f.storePrice.unitText ? ` (${f.storePrice.unitText})` : ""}`, C.perDollar(f, f.storePrice.perServing) ? el("span", { class: "pd", text: ` · ${C.perDollar(f, f.storePrice.perServing)}` }) : null) : null,
        why.top.length ? el("ul", {}, ...why.top.map(reasonItem)) : null,
        why.rest.length ? el("details", {}, el("summary", { text: `${why.rest.length} more note${why.rest.length === 1 ? "" : "s"}` }), el("ul", {}, ...why.rest.map(reasonItem))) : null,
        sw ? el("div", { class: "swap" }, el("span", { class: "lbl", text: "Try instead" }),
          el("div", { class: "row" }, el("b", { text: sw.food.n }), el("span", { class: "vp " + sw.verdict.tier, text: sw.verdict.word }),
            el("a", { href: C.walmartSearch(sw.query), "aria-label": `Search Walmart for ${sw.query}`, text: "Search Walmart →" }))) : null,
        send ? el("div", { class: "sendrow" }, send) : null,
        el("div", { class: "foot" },
          el("span", { text: `From ${r.source}` }),
          r.link ? el("a", { href: SITE + r.link, target: "_blank", rel: "noopener", text: "Full breakdown ↗" }) : null,
          el("details", {}, el("summary", { text: "About this verdict" }),
            el("p", { text: `${r.detail}.${listedAs} ${r.note}`.trim() }),
            el("p", { text: `Scored against your goals: ${p.cal.toLocaleString("en-US")} cal, ${p.pro} g protein, ≤${p.sat} g saturated fat, ≤${p.na.toLocaleString("en-US")} mg sodium, ≤${p.add} g added sugar.` }),
            el("p", {}, el("a", { href: "#", onclick: e => { e.preventDefault(); openSettings(); }, text: "Change your goals" })))))));
  }
  // The lookup's name is mentioned whenever it isn't just Walmart's name (a barcode record can carry another store's brand).
  function sameProduct(a, b) {
    const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return norm(b).includes(norm(a));
  }

  // ---------- verdict badges on search and category pages (opt-in) ----------
  // Search results don't include nutrition, so each badge means fetching that product's page. To stay gentle on
  // Walmart (and not look like a bot on your account): only products you scroll to, one request at a time about every
  // 1.5 seconds, at most 40 per page, and each result cached for 7 days.
  const BADGE_GAP = 1500, BADGE_MAX = 40, BADGE_DAYS = 7;
  let badgeQueue = [], badgeBusy = false, badgeCount = 0, badgeObserver = null, badgeMutations = null, badgeProfile = null;
  const BADGE_CSS = `:host{all:initial} .b{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;background:#fff;
    box-shadow:0 1px 4px rgba(0,0,0,.18);font:700 11.5px system-ui,sans-serif;color:#161813;white-space:nowrap}
    .d{width:8px;height:8px;border-radius:50%;background:#9aa192}.good .d{background:#2b7742}.mid .d{background:#8e5f16}.bad .d,.skip .d{background:#b23a2f}
    .good{color:#2b7742}.mid{color:#8e5f16}.bad,.skip{color:#b23a2f}.wait{color:#5b6157;font-weight:600}`;
  const SHORT = { good: "Get it", mid: "In moderation", bad: "Limit it", fine: "Fine", skip: "Skip" };
  function tileId(tile) { const a = tile.querySelector('a[href*="/ip/"]'); return a ? W.productId(new URL(a.getAttribute("href"), location.origin).href) : null; }
  function badgeFor(tile, state) {
    let host = tile.querySelector(".sib-badge");
    if (!host) {
      // On the product photo's bottom-left corner: Walmart uses the top corners for its own flags and the heart.
      const img = tile.querySelector("img"), spot = img && img.parentElement && tile.contains(img.parentElement) ? img.parentElement : tile;
      host = el("div", { class: "sib-badge", style: `position:absolute;${spot === tile ? "top:8px" : "bottom:6px"};left:6px;z-index:5;pointer-events:none` });
      host.attachShadow({ mode: "open" }).append(el("style", { text: BADGE_CSS }), el("span", { class: "b" }));
      if (getComputedStyle(spot).position === "static") spot.style.position = "relative";
      spot.append(host);
    }
    const b = host.shadowRoot.querySelector(".b");
    b.className = "b " + (state.tier || "wait");
    b.setAttribute("role", "img");
    b.setAttribute("aria-label", state.tier ? `Should I Buy It? ${state.word}` : "Should I Buy It? checking");
    b.replaceChildren(el("span", { class: "d" }), document.createTextNode(state.tier ? SHORT[state.tier] || state.word : "…"));
    host.title = state.headline || "";
  }
  async function badgeVerdict(id) {
    const { badgeCache = {} } = await store(["badgeCache"]);
    const hit = badgeCache[id];
    if (hit && Date.now() - hit.t < BADGE_DAYS * DAY) return hit;
    const res = await fetch(`/ip/${id}`, { credentials: "include" });
    if (!res.ok) return null;
    const prod = W.product(W.nextData(await res.text()));
    const r = prod ? await resolve(prod, badgeProfile) : null;
    if (!r || r.none) { badgeCache[id] = { t: Date.now(), tier: null }; }
    else { const a = V.assess(r.food, badgeProfile); badgeCache[id] = { t: Date.now(), tier: a.tier, word: a.word, headline: C.headline(r.food, badgeProfile, a) }; }
    const keys = Object.keys(badgeCache);
    if (keys.length > 600) keys.sort((x, y) => badgeCache[x].t - badgeCache[y].t).slice(0, keys.length - 600).forEach(k => delete badgeCache[k]);
    save({ badgeCache });
    return badgeCache[id];
  }
  async function drainBadges() {
    if (badgeBusy) return;
    badgeBusy = true;
    while (badgeQueue.length && badgeCount < BADGE_MAX) {
      const { tile, id } = badgeQueue.shift();
      if (!tile.isConnected) continue;
      const cachedOnly = (await store(["badgeCache"])).badgeCache || {};
      const fresh = cachedOnly[id] && Date.now() - cachedOnly[id].t < BADGE_DAYS * DAY;
      try { const v = await badgeVerdict(id); if (v && v.tier) badgeFor(tile, v); else { const h = tile.querySelector(".sib-badge"); if (h) h.remove(); } } catch {}
      if (!fresh) { badgeCount++; await new Promise(r => setTimeout(r, BADGE_GAP)); }
    }
    badgeBusy = false;
  }
  function watchTiles() {
    if (!badgeObserver) badgeObserver = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        badgeObserver.unobserve(e.target);
        const id = tileId(e.target);
        if (id && !badgeQueue.some(q => q.id === id)) { badgeFor(e.target, {}); badgeQueue.push({ tile: e.target, id }); }
      }
      drainBadges();
    }, { rootMargin: "200px" });
    for (const t of document.querySelectorAll('[data-item-id]:not([data-sib-seen])')) { if (!t.querySelector('a[href*="/ip/"]')) continue; t.setAttribute("data-sib-seen", ""); badgeObserver.observe(t); }
  }
  function startBadges(profile) {
    badgeProfile = profile;
    watchTiles();
    if (!badgeMutations) { badgeMutations = new MutationObserver(() => watchTiles()); badgeMutations.observe(document.body, { childList: true, subtree: true }); }
  }
  function stopBadges() {
    if (badgeMutations) badgeMutations.disconnect(); badgeMutations = null;
    if (badgeObserver) badgeObserver.disconnect(); badgeObserver = null;
    badgeQueue = []; document.querySelectorAll(".sib-badge").forEach(b => b.remove()); document.querySelectorAll("[data-sib-seen]").forEach(t => t.removeAttribute("data-sib-seen"));
  }

  // ---------- page changes ----------
  async function check() {
    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    if (!W.productId(url)) {
      unmount();
      const s2 = await store(["profile", "usdaKey", "searchBadges"]);
      badgeCount = 0;
      if (s2.searchBadges) startBadges({ ...V.DEFAULT_PROFILE, ...(s2.profile || {}), usdaKey: s2.usdaKey || "" }); else stopBadges();
      return;
    }
    stopBadges();
    if (dismissed === url) return;
    const mine = ++run;
    const saved = await store(["profile", "usdaKey", "collapsed", "toApp"]);
    toApp = Array.isArray(saved.toApp) ? saved.toApp : [];
    redraw = null;
    const p = { ...V.DEFAULT_PROFILE, ...(saved.profile || {}), usdaKey: saved.usdaKey || "" };
    const collapsed = saved.collapsed !== false; // compact by default; remembers if you prefer it open
    renderLoading(collapsed);
    try {
      const prod = await pageProduct(url);
      if (mine !== run) return;
      const r = await resolve(prod, p);
      if (mine !== run) return;
      if (!r) return unmount();
      if (r.none) return renderNone(r.none);
      // Walmart's own price for this item, per serving (from the page's unit price and the serving size).
      const cost = W.servingCost(prod.price, r.food);
      if (prod.price && (cost || prod.price.now)) r.food = { ...r.food, storePrice: { perServing: cost, item: prod.price.now, unitText: prod.price.text, store: "Walmart", on: new Date().toISOString().slice(0, 10) } };
      renderVerdict(r, prod, p, collapsed);
    } catch {
      if (mine === run) renderNone("Couldn't read this page. Reload it to try again.");
    }
  }
  check();
  // Walmart changes pages without reloading, so watch the address.
  setInterval(check, 700);
  window.addEventListener("popstate", check);
  // Goals changed in the settings page: redraw.
  try { chrome.storage.onChanged.addListener(changes => {
    if (changes.profile || changes.usdaKey || changes.searchBadges) { if (changes.profile) save({ badgeCache: {} }); lastUrl = null; check(); }
    // The list changed in another tab or in settings: update this card's button and send link.
    else if (changes.toApp) { const next = changes.toApp.newValue || []; if (JSON.stringify(next) !== JSON.stringify(toApp)) { toApp = next; if (redraw && host && host.shadowRoot.querySelector(".card")) redraw(); } }
  }); } catch {}
})();
