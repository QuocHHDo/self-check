// UI for Should I Buy It? Runs on GitHub Pages ("pages" mode) and inside Claude ("claude" mode).
(function () {
  "use strict";
  const { FOODS, CATEGORIES, DV } = window.SelfCheckData;
  const V = window.SelfCheckVerdict;
  const S = window.SelfCheckSources;
  const CFG = Object.assign({ mode: "pages" }, window.SELF_CHECK_CONFIG || {});
  const PAGES = CFG.mode === "pages";
  const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));
  CAT_LABEL.lookup = "Looked up";

  // ---------- storage (best effort; the page works without it) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const savedProfile = store.get("profile", null);
  let profile = { ...V.DEFAULT_PROFILE, ...(CFG.profile || {}), ...(savedProfile || {}) };
  let lookups = store.get("lookups", []).filter(f => f && f.n && typeof f.cal === "number");
  let recents = store.get("recents", []);
  let favs = store.get("favorites", []);
  const allFoods = () => [...FOODS, ...lookups];
  const byName = n => allFoods().find(f => f.n === n);

  // ---------- small helpers ----------
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids) if (c != null && c !== false) e.append(c);
    return e;
  };
  const fmt = V.fmt;
  const pct = (v, dv) => Math.round(v / dv * 100) + "%";
  const pill = a => el("span", { class: "vp " + a.tier, text: a.word });
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = el("div", { class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  const svgIcon = d => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; };
  const STAR = '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>';
  const STAR_ON = '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>';
  const LINK = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';

  // ---------- state ----------
  let current = null, mult = 1, explainKey = null, compareWith = null;

  // ---------- nutrition label ----------
  function labelRow(name, amt, dvKey, val, cls = "", bold = true, k = dvKey) {
    const left = el("span");
    if (bold) left.append(el("b", { text: name }), " " + amt); else left.append(name + " " + amt);
    return el("div", { class: "row " + cls, "data-k": k }, left, el("span", { class: "pct", text: dvKey ? pct(val, DV[dvKey]) : "" }));
  }
  function servingText(f) { return f.mult && f.mult !== 1 ? `${fmt(f.mult)} × ${f.s}` : f.s; }
  function renderLabel(f) {
    const trans = el("div", { class: "row ind", "data-k": "trans" }, el("span", {}, el("i", { text: "Trans" }), " Fat " + fmt(f.trans) + "g"), el("span"));
    const prot = el("div", { class: "row", "data-k": "pro" }, el("span", {}, el("b", { text: "Protein" }), " " + fmt(f.pro) + "g"), el("span"));
    return el("div", { class: "label", role: "group", "aria-label": `Nutrition facts for ${f.n}. Select a line to see what it means.` },
      el("p", { class: "lt", text: "Nutrition Facts" }),
      el("p", { class: "food", text: f.n }),
      el("div", { class: "rule-thin" }),
      el("div", { class: "serv" }, el("span", { text: "Serving size" }), el("span", { text: servingText(f) })),
      el("div", { class: "rule-thick" }),
      el("div", { class: "amt", text: "Amount per serving" }),
      el("div", { class: "cal", "data-k": "cal" }, el("span", { class: "k", text: "Calories" }), el("span", { class: "v", text: String(Math.round(f.cal)) })),
      el("div", { class: "rule-med" }),
      el("div", { class: "dvh", text: "% Daily Value*" }),
      labelRow("Total Fat", fmt(f.fat) + "g", "fat", f.fat),
      labelRow("Saturated Fat", fmt(f.sat) + "g", "sat", f.sat, "ind", false),
      trans,
      labelRow("Cholesterol", Math.round(f.chol) + "mg", "chol", f.chol),
      labelRow("Sodium", Math.round(f.na) + "mg", "na", f.na),
      labelRow("Total Carbohydrate", fmt(f.carb) + "g", "carb", f.carb),
      labelRow("Dietary Fiber", fmt(f.fib) + "g", "fib", f.fib, "ind", false),
      labelRow("Total Sugars", fmt(f.sug) + "g", null, 0, "ind", false, "sug"),
      labelRow("Includes " + fmt(f.add) + "g Added Sugars", "", "add", f.add, "ind2", false),
      prot,
      el("div", { class: "rule-thick" }),
      el("div", { class: "foot", text: "* The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice." })
    );
  }
  const GROUP = { more: "Aim for more", low: "Keep low", ctx: "Context" };
  function renderExplain(box, k, f) {
    const e = k && V.explain(k, f, profile);
    if (!e) { box.replaceChildren(el("p", { class: "ex-hint", text: "Tap any line on the label to see what it means." })); return; }
    box.replaceChildren(el("div", { class: "ex-h" }, el("p", { class: "ex-t", text: e[0] }), el("span", { class: "ex-g " + e[1], text: GROUP[e[1]] })), el("p", { text: e[2] }), el("p", { class: "ex-r", text: e[3] }));
  }
  function wireLabel(label, box, f) {
    const rows = [...label.querySelectorAll("[data-k]")];
    const choose = k => {
      explainKey = explainKey === k ? null : k;
      rows.forEach(r => { const on = r.dataset.k === explainKey; r.classList.toggle("on", on); r.setAttribute("aria-pressed", on ? "true" : "false"); });
      renderExplain(box, explainKey, f);
    };
    rows.forEach(r => {
      r.setAttribute("role", "button"); r.setAttribute("tabindex", "0"); r.setAttribute("aria-pressed", "false");
      r.addEventListener("click", () => choose(r.dataset.k));
      r.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(r.dataset.k); } });
    });
    const keep = explainKey; explainKey = null;
    if (keep) choose(keep); else renderExplain(box, null, f);
  }

  // ---------- share-of-day bars ----------
  function renderBars(f) {
    const p = profile;
    const rows = [
      { n: "Protein", v: f.pro, t: p.pro, u: "g", goal: true },
      { n: "Fiber", v: f.fib, t: p.fib, u: "g", goal: true },
      { n: "Calories", v: f.cal, t: p.cal, u: "", neutral: true },
      { n: "Saturated fat", v: f.sat, t: p.sat, u: "g" },
      { n: "Sodium", v: f.na, t: p.na, u: "mg" },
      { n: "Added sugar", v: f.add, t: p.add, u: "g" },
    ];
    const wrap = el("div", { class: "bars" });
    for (const r of rows) {
      const share = r.t > 0 ? r.v / r.t : 0;
      const cls = r.goal ? "goal" : r.neutral ? "neutral" : share >= 0.3 ? "limit-bad" : share >= 0.15 ? "limit-warn" : "limit-ok";
      const val = el("span", { class: "val" }, el("b", { text: Math.round(share * 100) + "%" }), ` of ${r.t.toLocaleString("en-US")}${r.u}`);
      wrap.append(el("div", { class: "bar", title: `${r.n}: ${fmt(r.v)}${r.u} of your ${r.t.toLocaleString("en-US")}${r.u} ${r.goal ? "goal" : r.neutral ? "budget" : "limit"}` },
        el("span", { class: "name", text: r.n }), el("div", { class: "track" }, el("div", { class: "fill " + cls, style: `width:${Math.min(100, share * 100).toFixed(1)}%` })), val));
    }
    const what = f.mult && f.mult !== 1 ? `${fmt(f.mult)} servings` : "One serving";
    return el("section", { class: "panel" }, el("h3", { text: `${what}, as a share of your day` }), wrap,
      el("p", { class: "legend", text: "Green bars are goals to reach. Amber and red show how much of a daily limit this uses." }));
  }

  // ---------- swaps ----------
  function swapReason(f, g) {
    const bits = [];
    const d = (k, more, unit, word) => {
      const diff = g[k] - f[k];
      if (more ? diff >= 2 : diff <= -(k === "na" ? 100 : 1.5)) bits.push(`${fmt(Math.abs(diff))}${unit} ${more ? "more" : "less"} ${word}`);
    };
    d("sat", false, " g", "saturated fat"); d("add", false, " g", "added sugar"); d("na", false, " mg", "sodium");
    d("pro", true, " g", "protein"); d("fib", true, " g", "fiber");
    if (!bits.length && g.cal < f.cal - 40) bits.push(`${Math.round(f.cal - g.cal)} fewer calories`);
    return bits.slice(0, 2).join(" · ") || "Scores better for your goals";
  }
  function renderSwaps(f) {
    const swaps = V.findSwaps(f, allFoods(), profile, 3);
    if (!swaps.length) return null;
    const list = el("div", { class: "swaps" });
    for (const s of swaps) {
      list.append(el("button", { class: "swap", type: "button", onclick: () => pick(s.food) },
        el("span", { class: "sn", text: s.food.n }), pill(s.verdict),
        el("span", { class: "sd", text: `${swapReason(f, s.food)} per serving (${s.food.s})` })));
    }
    return el("section", { class: "panel" }, el("h3", { text: "Try instead" }), list);
  }

  // ---------- compare ----------
  const CMP_ROWS = [
    ["Calories", "cal", "", null], ["Protein", "pro", " g", "more"], ["Fiber", "fib", " g", "more"],
    ["Saturated fat", "sat", " g", "less"], ["Sodium", "na", " mg", "less"], ["Added sugar", "add", " g", "less"],
    ["Total sugars", "sug", " g", null], ["Total carbs", "carb", " g", null], ["Total fat", "fat", " g", null], ["Cholesterol", "chol", " mg", null],
  ];
  function renderCompare(f) {
    const sec = el("section", { class: "panel compare" }, el("h3", { text: "Compare" }));
    const input = el("input", { type: "search", id: "cmpq", placeholder: "Compare with another food…", "aria-label": "Food to compare with", autocomplete: "off" });
    const list = el("ul", { class: "suggest", role: "listbox", hidden: true });
    const row = el("div", { class: "compare-row" }, input);
    sec.append(row, list);
    attachSuggest(input, list, g => { compareWith = g; renderResult(current); });
    if (compareWith && compareWith.n !== f.n) {
      const a = V.scale(f, mult), b = compareWith;
      const va = V.assess(f, profile), vb = V.assess(b, profile);
      const thead = el("thead", {}, el("tr", {}, el("th", { text: "Per serving" }),
        el("th", {}, f.n, el("span", { class: "sv", text: servingText(a) }), pill(va)),
        el("th", {}, b.n, el("span", { class: "sv", text: b.s }), pill(vb))));
      const tbody = el("tbody");
      for (const [label, k, unit, dir] of CMP_ROWS) {
        const x = a[k], y = b[k];
        const win = dir && Math.abs(x - y) > 0.05 * Math.max(x, y, 1) ? ((dir === "more") === (x > y) ? 0 : 1) : -1;
        const cell = (v, i) => el("td", { class: win === i ? "win" : null, text: (k === "na" || k === "chol" || k === "cal" ? Math.round(v).toLocaleString("en-US") : fmt(v)) + unit });
        tbody.append(el("tr", {}, el("td", { text: label }), cell(x, 0), cell(y, 1)));
      }
      sec.append(el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, thead, tbody)),
        el("p", { class: "legend", text: "Green marks the better amount for your goals. Servings differ, so compare against how much you'd actually eat." }),
        el("div", {}, el("button", { class: "btn small ghost", type: "button", text: "Clear comparison", onclick: () => { compareWith = null; renderResult(current); } })));
    }
    return sec;
  }

  // ---------- result ----------
  function renderResult(f) {
    current = f;
    const scaled = V.scale(f, mult);
    const a = V.assess(f, profile);
    const isFav = favs.includes(f.n);
    const star = el("button", { class: "icon-btn", type: "button", "aria-pressed": isFav ? "true" : "false", onclick: () => toggleFav(f) },
      svgIcon(isFav ? STAR_ON : STAR), isFav ? "Saved" : "Save");
    const head = el("div", { class: "result-head" }, el("h2", { text: f.n }), el("span", { class: "cat", text: CAT_LABEL[f.c] || "" }), star);
    if (PAGES) head.append(el("button", { class: "icon-btn", type: "button", onclick: () => copyLink(f) }, svgIcon(LINK), "Copy link"));

    const seg = el("div", { class: "serving", role: "group", "aria-label": "Serving size" }, el("span", { class: "lbl", text: "Servings" }));
    for (const m of [0.5, 1, 1.5, 2, 3]) seg.append(el("button", { class: "seg", type: "button", "aria-pressed": m === mult ? "true" : "false", text: m === 0.5 ? "½" : m === 1.5 ? "1½" : String(m), onclick: () => { mult = m; renderResult(current); } }));

    const label = renderLabel(scaled);
    const box = el("div", { class: "explain", "aria-live": "polite" });
    wireLabel(label, box, scaled);
    const src = el("p", { class: "src" });
    if (f.src === "claude") src.append(el("b", { text: "Looked up by Claude. " }), "Typical values; check the package label.");
    else if (f.src === "usda") src.append(el("b", { text: "From USDA FoodData Central. " }), "Values per 100 g.");
    else if (f.src === "off") src.append(el("b", { text: "From Open Food Facts. " }), f.partial ? "Some values were missing and show as 0; check the package." : "Crowd-sourced; check the package label.");
    else src.append("Typical values for this serving. Brands vary.");

    const reasons = el("ul", { class: "reasons" });
    for (const r of a.reasons) reasons.append(el("li", { class: r.k }, el("span", { class: "ic", "aria-hidden": "true", text: r.k === "pos" ? "+" : r.k === "neg" ? "−" : "i" }), el("span", { text: r.t })));

    $("out").replaceChildren(
      head,
      el("div", { class: "result" },
        el("div", { class: "leftcol" }, seg, label, box, src),
        el("div", { class: "side" },
          el("div", { class: "tag " + a.tier }, el("div", { class: "for", text: "For you" }), el("div", { class: "verdict", text: a.word }), el("p", { class: "why", text: a.why }),
            mult !== 1 ? el("p", { class: "per", text: "The verdict is for one standard serving; the label and bars show your amount." }) : null),
          renderBars(scaled),
          renderSwaps(f),
          el("section", { class: "panel" }, el("h3", { text: "Why" }), reasons),
          renderCompare(f)
        ))
    );
  }

  function pick(f, opts = {}) {
    if (current && current.n !== f.n) { mult = 1; explainKey = null; if (compareWith && compareWith.n === f.n) compareWith = null; }
    $("q").value = f.n; $("suggest").hidden = true;
    renderResult(f);
    if (!opts.noRecent) addRecent(f);
    if (PAGES && !opts.noHash) { try { history.replaceState(null, "", "#" + V.slug(f.n)); } catch {} }
    if (opts.scroll) $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- favorites, recents, share ----------
  function addRecent(f) { recents = [f.n, ...recents.filter(n => n !== f.n)].slice(0, 8); store.set("recents", recents); renderChips(); }
  function toggleFav(f) {
    favs = favs.includes(f.n) ? favs.filter(n => n !== f.n) : [f.n, ...favs].slice(0, 30);
    store.set("favorites", favs); renderChips(); renderResult(current);
  }
  async function copyLink(f) {
    const url = location.href.split("#")[0] + "#" + V.slug(f.n);
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { toast(url); }
  }
  function chipRow(rowId, names) {
    const row = $(rowId);
    const lbl = row.querySelector(".lbl");
    row.replaceChildren(lbl);
    const foods = names.map(byName).filter(Boolean);
    for (const f of foods) row.append(el("button", { class: "chip", type: "button", text: f.n.split(",")[0], title: f.n, onclick: () => pick(f) }));
    row.hidden = !foods.length;
  }
  const QUICK = ["Avocado", "Ground beef 80/20", "Chicken breast, grilled", "Greek yogurt, plain nonfat", "Eggs", "Oatmeal, rolled oats", "Shrimp", "Instant ramen"];
  function renderChips() {
    chipRow("favRow", favs);
    chipRow("recentRow", recents.filter(n => !favs.includes(n)));
    chipRow("quickRow", QUICK);
    $("quickRow").hidden = recents.length + favs.length >= 3;
  }

  // ---------- browse ----------
  let browseCat = "all";
  let browseSort = store.get("browseSort", "az");
  const SORTS = [{ id: "az", label: "A–Z" }, { id: "worst", label: "Least healthy first" }, { id: "best", label: "Healthiest first" }];
  function renderBrowse() {
    const cats = $("cats");
    cats.replaceChildren();
    const opts = [{ id: "all", label: "All" }, ...CATEGORIES, ...(lookups.length ? [{ id: "lookup", label: "Looked up" }] : [])];
    for (const c of opts) cats.append(el("button", { class: "chip" + (c.id === browseCat ? " on" : ""), type: "button", "aria-pressed": c.id === browseCat ? "true" : "false", text: c.label, onclick: () => { browseCat = c.id; renderBrowse(); } }));
    const sorts = $("bsort");
    sorts.replaceChildren(el("span", { class: "lbl", text: "Sort" }));
    for (const s of SORTS) sorts.append(el("button", { class: "chip" + (s.id === browseSort ? " on" : ""), type: "button", "aria-pressed": s.id === browseSort ? "true" : "false", text: s.label, onclick: () => { browseSort = s.id; store.set("browseSort", s.id); renderBrowse(); } }));
    const ranked = browseSort !== "az";
    $("bsortNote").hidden = !ranked;

    const rows = allFoods().filter(f => browseCat === "all" || f.c === browseCat).map(f => ({ f, v: V.assess(f, profile), h: V.health(f, profile) }));
    if (browseSort === "az") rows.sort((x, y) => x.f.n.localeCompare(y.f.n));
    else {
      const dir = browseSort === "worst" ? 1 : -1;
      rows.sort((x, y) => dir * (x.h.score - y.h.score) || dir * (y.h.harm - x.h.harm) || x.f.n.localeCompare(y.f.n));
    }
    const list = $("blist");
    list.classList.toggle("ranked", ranked);
    list.replaceChildren(...rows.map((r, i) => {
      const name = el("span", {}, ranked ? el("span", { class: "rank", text: `${i + 1}.` }) : null, r.f.n);
      const right = el("span", { class: "bright" }, ranked ? el("span", { class: "score", title: "Health score per serving (higher is better)", text: (r.h.score > 0 ? "+" : "") + r.h.score }) : null, pill(r.v));
      return el("button", { class: "bitem", type: "button", onclick: () => pick(r.f, { scroll: true }) }, name, right);
    }));
    $("browseCount").textContent = `${allFoods().length} foods`;
  }

  // ---------- search ----------
  const norm = s => s.toLowerCase().replace(/[^a-z0-9/ ]/g, "").trim();
  function match(q) {
    const nq = norm(q); if (!nq) return [];
    const scored = [];
    for (const f of allFoods()) {
      let best = 0;
      for (const n of [f.n, ...(f.a || [])].map(norm)) {
        if (n === nq) best = Math.max(best, 100);
        else if (n.startsWith(nq)) best = Math.max(best, 80);
        else if (n.split(" ").some(w => w.startsWith(nq))) best = Math.max(best, 60);
        else if (n.includes(nq)) best = Math.max(best, 40);
        else if (nq.length > 3 && nq.includes(n)) best = Math.max(best, 30);
      }
      if (best) scored.push({ f, best });
    }
    return scored.sort((x, y) => y.best - x.best || x.f.n.length - y.f.n.length).map(x => x.f);
  }
  const isExact = (f, text) => [f.n, ...(f.a || [])].map(norm).includes(norm(text));

  function attachSuggest(input, list, onPick) {
    let sel = -1, sugg = [];
    const close = () => { list.hidden = true; sel = -1; };
    input.addEventListener("input", () => {
      sugg = match(input.value).slice(0, 7); sel = -1;
      list.replaceChildren();
      if (!sugg.length || !input.value.trim()) return close();
      sugg.forEach((f, i) => {
        const li = el("li", { role: "option", id: input.id + "-opt" + i, "aria-selected": "false" }, el("span", { text: f.n }), pill(V.assess(f, profile)));
        li.addEventListener("mousedown", e => { e.preventDefault(); close(); onPick(f); });
        list.append(li);
      });
      list.hidden = false;
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") return close();
      if (list.hidden || !sugg.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + sugg.length) % sugg.length;
        [...list.children].forEach((li, i) => li.setAttribute("aria-selected", i === sel ? "true" : "false"));
        input.setAttribute("aria-activedescendant", input.id + "-opt" + sel);
      } else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); const f = sugg[sel]; close(); onPick(f); }
      else if (e.key === "Enter" && input.id === "cmpq") { e.preventDefault(); const m = match(input.value); if (m.length) { close(); onPick(m[0]); } }
    });
  }

  // ---------- lookups for foods that aren't built in ----------
  function saveLookup(f) {
    if (FOODS.some(x => x.n === f.n)) f.n += f.src === "off" ? "" : " (lookup)";
    lookups = [f, ...lookups.filter(x => x.n !== f.n)].slice(0, 80);
    store.set("lookups", lookups);
    renderBrowse();
  }

  function offerLookup(text, near) {
    const box = el("div", { class: "notice" }, el("p", { text: `“${text}” isn't in the built-in list.` }));
    if (near.length) {
      const p = el("p", { class: "muted" }, "Did you mean ");
      near.forEach(f => p.append(el("button", { class: "chip", type: "button", text: f.n, onclick: () => pick(f) }), " "));
      box.append(p);
    }
    if (PAGES) {
      box.append(el("button", { class: "btn ghost", type: "button", text: `Search USDA for “${text}”`, onclick: () => usdaSearch(text, box) }));
    } else if (sampleState !== "none") {
      box.append(el("button", { class: "btn ghost", type: "button", text: `Look up “${text}” with Claude`, onclick: () => claudeLookup(text, box) }),
        el("p", { class: "muted", style: "font-size:13px", text: "Uses your Claude account. You'll be asked to allow it the first time." }));
    } else box.append(el("p", { class: "muted", text: "Lookups aren't available in this view, so only built-in foods work here." }));
    $("out").replaceChildren(box);
  }
  const busy = (box, msg) => box.replaceChildren(el("span", { class: "thinking" }, el("span", { class: "dot" }), msg));

  async function usdaSearch(text, box) {
    busy(box, `Searching USDA for ${text}…`);
    const key = (profile.usdaKey || "").trim() || "DEMO_KEY";
    const url = S.usdaSearchUrl(text, key);
    try {
      const res = await fetch(url);
      if (res.status === 429) throw new Error("rate");
      if (res.status === 403) throw new Error("key");
      if (!res.ok) throw new Error("http");
      const data = await res.json();
      const items = (data.foods || []).map(S.fromUsda).filter(f => f.cal > 0 || f.pro > 0);
      if (!items.length) { box.replaceChildren(el("p", { text: `USDA has no match for “${text}”. Try a simpler name, like “chicken thigh” instead of a brand.` })); return; }
      const list = el("ul", { class: "results" });
      for (const f of items) list.append(el("li", {}, el("button", { type: "button", onclick: () => { saveLookup(f); pick(f); } },
        el("span", { text: f.n }), el("br"), el("small", { text: `${Math.round(f.cal)} cal · ${fmt(f.pro)} g protein · ${fmt(f.sat)} g sat fat per 100 g` }))));
      box.replaceChildren(el("p", { text: "Pick the closest match. USDA values are per 100 g." }), list);
    } catch (e) {
      const msg = e.message === "rate" ? "USDA's shared demo key is out of searches for now. Add your own free key under Your goals, or try again later."
        : e.message === "key" ? "USDA rejected the API key. Check the key under Your goals."
        : navigator.onLine === false ? "You're offline. Built-in foods still work; USDA search needs a connection." : "The USDA search didn't go through. Try again in a moment.";
      box.replaceChildren(el("p", { text: msg }), el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: () => usdaSearch(text, box) }));
    }
  }

  async function barcodeLookup(code) {
    const clean = String(code).replace(/\D/g, "");
    if (clean.length < 8) { toast("That doesn't look like a full barcode."); return; }
    const box = el("div", { class: "notice" }); $("out").replaceChildren(box);
    busy(box, `Looking up barcode ${clean}…`);
    try {
      const res = await fetch(S.offProductUrl(clean));
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        box.replaceChildren(el("p", { text: `Open Food Facts doesn't have barcode ${clean} yet.` }), el("p", { class: "muted", text: "Search the food by name instead." }));
        return;
      }
      const f = S.fromOff(clean, data.product);
      if (!(f.cal > 0 || f.pro > 0 || f.carb > 0)) { box.replaceChildren(el("p", { text: `Found “${f.n}”, but it has no nutrition data. Search it by name instead.` })); return; }
      saveLookup(f); pick(f);
    } catch {
      box.replaceChildren(el("p", { text: navigator.onLine === false ? "You're offline. Barcode lookup needs a connection." : "The barcode lookup didn't go through. Try again in a moment." }));
    }
  }

  // Camera scanning with the bundled html5-qrcode library, loaded only when needed.
  let scanner = null;
  function loadScript(src) {
    return new Promise((ok, fail) => { if (window.Html5Qrcode) return ok(); const s = el("script", { src }); s.onload = ok; s.onerror = fail; document.head.append(s); });
  }
  async function openScan() {
    $("scan").hidden = false; $("scanMsg").textContent = "Starting the camera…";
    try {
      await loadScript("vendor/html5-qrcode.min.js");
      const lib = window.__Html5QrcodeLibrary__ || {};
      const F = window.Html5QrcodeSupportedFormats || lib.Html5QrcodeSupportedFormats;
      const Scanner = window.Html5Qrcode || lib.Html5Qrcode;
      scanner = new Scanner("reader", { verbose: false, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: (w, h) => ({ width: Math.min(300, w * 0.85), height: Math.min(140, h * 0.5) }) },
        async decoded => { await closeScan(); barcodeLookup(decoded); }, () => {});
      $("scanMsg").textContent = "Point your camera at the barcode.";
    } catch (e) {
      $("scanMsg").textContent = "The camera isn't available here (it needs permission and a secure connection). Type the barcode number instead.";
      $("code").focus();
    }
  }
  async function closeScan() {
    try { if (scanner) { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } } catch {}
    scanner = null; $("scan").hidden = true;
  }

  // Claude lookup (Claude version only), via the page's `sample` capability.
  let sampleFn = null, sampleState = PAGES ? "none" : "pending";
  if (!PAGES) (async () => {
    try { sampleFn = window.claude ? await window.claude.use("sample") : null; } catch { sampleFn = null; }
    sampleState = sampleFn ? "ready" : "none";
  })();
  async function claudeLookup(text, box) {
    if (!sampleFn) return;
    busy(box, `Looking up ${text}…`);
    const prompt = `Give typical nutrition facts for one common US serving of the food "${text}" as bought at a grocery store.
Reply with only a JSON object in this shape:
{"found":true,"name":"Title Case food name","serving":"1 cup (240 g)","cal":0,"fat":0,"sat":0,"trans":0,"chol":0,"na":0,"carb":0,"fib":0,"sug":0,"add":0,"pro":0,"spicy":false,"processedMeat":false}
Units: cal in kcal; chol and na in milligrams; every other number in grams. Use typical USDA FoodData Central values; for a branded or variable product, use a typical mid-range version. "add" is added sugars only. "spicy" is true only if the food is inherently hot. "processedMeat" is true for cured, smoked or deli meats.
If "${text}" is not a food, reply {"found":false}.`;
    try {
      const d = await sampleFn.json(prompt, { modelTier: "default", cache: { gcTime: 86400000 } });
      if (!d || d.found === false || !d.name) { box.replaceChildren(el("p", { text: `Claude didn't recognize “${text}” as a food. Try a more common name.` })); return; }
      const f = S.makeFood(d.name, d.serving, d, { src: "claude", a: [text.toLowerCase()] });
      f.tags = [...(d.spicy ? ["spicy"] : []), ...(d.processedMeat ? ["processed"] : [])];
      saveLookup(f); pick(f);
    } catch (e) {
      const msg = { not_granted: "Claude lookups weren't allowed for this page, so only built-in foods work.", sampling_disabled: "Claude isn't available for this account.",
        rate_limited: "Too many lookups right now. Try again in a minute.", session_expired: "Sign in to Claude again, then retry.",
        invalid_json: "The answer came back in an unexpected shape. Try again." }[e && e.code] || "The lookup didn't finish. Try again.";
      box.replaceChildren(el("p", { text: msg }));
      if (e && ["not_granted", "sampling_disabled"].includes(e.code)) sampleState = "none";
      else box.append(el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: () => claudeLookup(text, box) }));
    }
  }

  // ---------- goals ----------
  const PF = { cal: "p-cal", pro: "p-pro", sat: "p-sat", na: "p-na", add: "p-add", fib: "p-fib" };
  function syncProfileUI() {
    for (const [k, id] of Object.entries(PF)) $(id).value = profile[k];
    $("p-skip").value = profile.skip || ""; $("p-mild").checked = !!profile.mild; $("p-usda").value = profile.usdaKey || "";
    $("profSummary").textContent = `${profile.cal.toLocaleString("en-US")} cal · ${profile.pro} g protein · ≤${profile.sat} g sat fat`;
  }
  function readProfile() {
    for (const [k, id] of Object.entries(PF)) { const v = Number($(id).value); if (Number.isFinite(v) && v > 0) profile[k] = v; }
    profile.skip = $("p-skip").value; profile.mild = $("p-mild").checked; profile.usdaKey = $("p-usda").value.trim();
    store.set("profile", profile); syncProfileUI(); renderBrowse(); renderChips();
    if (current) renderResult(current);
  }

  // ---------- boot ----------
  function init() {
    $("foodCount").textContent = `${FOODS.length} common foods built in.`;
    if (!PAGES) document.querySelectorAll("[data-pages-only]").forEach(n => n.remove());
    $("scanBtn").hidden = !PAGES; $("usdaKeyWrap").hidden = !PAGES;

    attachSuggest($("q"), $("suggest"), f => pick(f));
    $("form").addEventListener("submit", e => {
      e.preventDefault();
      const text = $("q").value.trim(); if (!text) return;
      $("suggest").hidden = true;
      if (/^\d{8,14}$/.test(text) && PAGES) return barcodeLookup(text);
      const m = match(text);
      if (m.length && isExact(m[0], text)) return pick(m[0]);
      if (m.length === 1) return pick(m[0]);
      offerLookup(text, m.slice(0, 4));
    });
    $("scanBtn").addEventListener("click", () => ($("scan").hidden ? openScan() : closeScan()));
    $("scanClose").addEventListener("click", closeScan);
    $("codeForm").addEventListener("submit", async e => { e.preventDefault(); const c = $("code").value; await closeScan(); barcodeLookup(c); });

    document.querySelectorAll("#profile input").forEach(i => i.addEventListener("change", readProfile));
    syncProfileUI();
    if (!savedProfile && !CFG.profile) $("profile").open = true;
    renderChips(); renderBrowse();

    const fromHash = PAGES && location.hash.length > 1 ? allFoods().find(f => V.slug(f.n) === decodeURIComponent(location.hash.slice(1))) : null;
    const startFood = fromHash || (recents.length && byName(recents[0])) || FOODS[0];
    pick(startFood, { noHash: true, noRecent: !fromHash });
    if (PAGES) window.addEventListener("hashchange", () => {
      const f = allFoods().find(x => V.slug(x.n) === decodeURIComponent(location.hash.slice(1)));
      if (f && (!current || f.n !== current.n)) pick(f, { noHash: true });
    });

    if (PAGES && "serviceWorker" in navigator && location.protocol === "https:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }
  init();
})();
