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
  // Barcode products saved before serving sizes were read correctly (no `missing` list) are dropped; rescanning refreshes them.
  let lookups = store.get("lookups", []).filter(f => f && f.n && typeof f.cal === "number" && !(f.src === "off" && !Array.isArray(f.missing)));
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
  // Amounts that respect missing data: "—" when the source didn't report it, "≥" when it's a plate's lower bound.
  const whole = k => k === "na" || k === "chol" || k === "cal";
  function amt(f, k, unit = "") {
    if (V.isMissing(f, k)) return "—";
    const n = whole(k) ? Math.round(f[k]).toLocaleString("en-US") : fmt(f[k]);
    return (V.isLowerBound(f, k) ? "≥" : "") + n + unit;
  }
  const dvText = (f, k) => (V.isMissing(f, k) ? "—" : (V.isLowerBound(f, k) ? "≥" : "") + pct(f[k], DV[k]));
  const pill = a => a.spicy ? el("span", { class: "pills" }, el("span", { class: "vp " + a.tier, text: a.word }), el("span", { class: "vp spicy", text: "Spicy" }))
    : el("span", { class: "vp " + a.tier, text: a.word });
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
  let current = null, mult = 1, explainKey = null, compareWith = null, cmpBasis = "serving";
  let glist = store.get("grocery", []).filter(x => x && x.n);
  let plate = store.get("plate", []).filter(x => x && x.n);

  // ---------- nutrition label ----------
  function labelRow(f, name, k, cls = "", bold = true, showDv = true, unit = "g") {
    const left = el("span");
    const a = amt(f, k, unit);
    if (bold) left.append(el("b", { text: name }), " " + a); else left.append(name + " " + a);
    return el("div", { class: "row " + cls, "data-k": k }, left, el("span", { class: "pct", text: showDv ? dvText(f, k) : "" }));
  }
  function servingText(f) { return f.mult && f.mult !== 1 ? `${fmt(f.mult)} × ${f.s}` : f.s; }
  function renderLabel(f) {
    const trans = el("div", { class: "row ind", "data-k": "trans" }, el("span", {}, el("i", { text: "Trans" }), " Fat " + amt(f, "trans", "g")), el("span"));
    const prot = el("div", { class: "row", "data-k": "pro" }, el("span", {}, el("b", { text: "Protein" }), " " + amt(f, "pro", "g")), el("span"));
    const addRow = el("div", { class: "row ind2", "data-k": "add" }, el("span", { text: V.isMissing(f, "add") ? "Added Sugars —" : `Includes ${amt(f, "add", "g")} Added Sugars` }), el("span", { class: "pct", text: dvText(f, "add") }));
    return el("div", { class: "label", role: "group", "aria-label": `Nutrition facts for ${f.n}. Select a line to see what it means.` },
      el("p", { class: "lt", text: "Nutrition Facts" }),
      el("p", { class: "food", text: f.n }),
      el("div", { class: "rule-thin" }),
      el("div", { class: "serv" }, el("span", { text: "Serving size" }), el("span", { text: servingText(f) })),
      el("div", { class: "rule-thick" }),
      el("div", { class: "amt", text: "Amount per serving" }),
      el("div", { class: "cal", "data-k": "cal" }, el("span", { class: "k", text: "Calories" }), el("span", { class: "v", text: amt(f, "cal") })),
      el("div", { class: "rule-med" }),
      el("div", { class: "dvh", text: "% Daily Value*" }),
      labelRow(f, "Total Fat", "fat"),
      labelRow(f, "Saturated Fat", "sat", "ind", false),
      trans,
      labelRow(f, "Cholesterol", "chol", "", true, true, "mg"),
      labelRow(f, "Sodium", "na", "", true, true, "mg"),
      labelRow(f, "Total Carbohydrate", "carb"),
      labelRow(f, "Dietary Fiber", "fib", "ind", false),
      labelRow(f, "Total Sugars", "sug", "ind", false, false),
      addRow,
      prot,
      el("div", { class: "rule-thick" }),
      el("div", { class: "foot", text: "* The % Daily Value tells you how much a nutrient in a serving contributes to a daily diet. 2,000 calories a day is used for general nutrition advice." })
    );
  }
  const GROUP = { more: "Aim for more", low: "Keep low", ctx: "Context" };
  function renderExplain(box, k, f) {
    const e = k && V.explain(k, f, profile);
    if (!e) { box.replaceChildren(el("p", { class: "ex-hint", text: "Tap any line on the label to see what it means." })); return; }
    const detail = V.isMissing(f, k) ? "Not reported for this food, so it isn't counted either way." : (V.isLowerBound(f, k) ? "Some items don't report this, so the total is a minimum. " : "") + e[3];
    box.replaceChildren(el("div", { class: "ex-h" }, el("p", { class: "ex-t", text: e[0] }), el("span", { class: "ex-g " + e[1], text: GROUP[e[1]] })), el("p", { text: e[2] }), el("p", { class: "ex-r", text: detail }));
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
      { n: "Protein", k: "pro", t: p.pro, u: "g", goal: true },
      { n: "Fiber", k: "fib", t: p.fib, u: "g", goal: true },
      { n: "Calories", k: "cal", t: p.cal, u: "", neutral: true },
      { n: "Saturated fat", k: "sat", t: p.sat, u: "g" },
      { n: "Sodium", k: "na", t: p.na, u: "mg" },
      { n: "Added sugar", k: "add", t: p.add, u: "g" },
    ];
    const wrap = el("div", { class: "bars" });
    for (const r of rows) {
      r.v = f[r.k];
      if (V.isMissing(f, r.k)) {
        wrap.append(el("div", { class: "bar", title: `${r.n}: not reported` }, el("span", { class: "name", text: r.n }), el("div", { class: "track na" }), el("span", { class: "val", text: "not reported" })));
        continue;
      }
      const share = r.t > 0 ? r.v / r.t : 0;
      const cls = r.goal ? "goal" : r.neutral ? "neutral" : share >= 0.3 ? "limit-bad" : share >= 0.15 ? "limit-warn" : "limit-ok";
      const val = el("span", { class: "val" }, el("b", { text: (V.isLowerBound(f, r.k) ? "≥" : "") + Math.round(share * 100) + "%" }), ` of ${r.t.toLocaleString("en-US")}${r.u}`);
      wrap.append(el("div", { class: "bar", title: `${r.n}: ${fmt(r.v)}${r.u} of your ${r.t.toLocaleString("en-US")}${r.u} ${r.goal ? "goal" : r.neutral ? "budget" : "limit"}` },
        el("span", { class: "name", text: r.n }), el("div", { class: "track" }, el("div", { class: "fill " + cls, style: `width:${Math.min(100, share * 100).toFixed(1)}%` })), val));
    }
    const what = f.c === "plate" ? "This meal" : f.mult && f.mult !== 1 ? `${fmt(f.mult)} servings` : "One serving";
    return el("section", { class: "panel" }, el("h3", { text: `${what}, as a share of your day` }), wrap,
      el("p", { class: "legend", text: "Green bars are goals to reach. Amber and red show how much of a daily limit this uses." }));
  }

  // ---------- swaps ----------
  function swapReason(f, g) {
    const bits = [];
    const d = (k, more, unit, word) => {
      if (V.isMissing(f, k) || V.isMissing(g, k)) return;
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
      let a = V.scale(f, mult), b = compareWith, note = "";
      if (cmpBasis === "kcal") {
        const a2 = V.per100kcal(f), b2 = V.per100kcal(compareWith);
        if (a2 && b2) { a = a2; b = b2; } else note = `One of these has under ${V.KCAL_MIN} calories per serving, so it's shown per serving instead.`;
      }
      const va = V.assess(f, profile), vb = V.assess(compareWith, profile);
      const basisRow = el("div", { class: "chiprow", style: "margin:0", role: "group", "aria-label": "Compare basis" }, el("span", { class: "lbl", text: "Compare" }),
        ...[["serving", "Per serving"], ["kcal", "Per 100 calories"]].map(([id, label]) => el("button", { class: "chip" + (cmpBasis === id ? " on" : ""), type: "button", "aria-pressed": cmpBasis === id ? "true" : "false", text: label, onclick: () => { cmpBasis = id; renderResult(current); } })));
      sec.append(basisRow);
      if (note) sec.append(el("p", { class: "legend", text: note }));
      const thead = el("thead", {}, el("tr", {}, el("th", { text: a.s === "100 calories" ? "Per 100 calories" : "Per serving" }),
        el("th", {}, f.n, el("span", { class: "sv", text: a.s === "100 calories" ? "100 calories" : servingText(a) }), pill(va)),
        el("th", {}, compareWith.n, el("span", { class: "sv", text: b.s }), pill(vb))));
      const tbody = el("tbody");
      for (const [label, k, unit, dir] of CMP_ROWS) {
        const x = a[k], y = b[k];
        const unknown = V.isMissing(a, k) || V.isMissing(b, k) || V.isLowerBound(a, k) || V.isLowerBound(b, k);
        const win = !unknown && dir && Math.abs(x - y) > 0.05 * Math.max(x, y, 1) ? ((dir === "more") === (x > y) ? 0 : 1) : -1;
        const cell = (food, i) => el("td", { class: win === i ? "win" : null, text: amt(food, k, unit) });
        tbody.append(el("tr", {}, el("td", { text: label }), cell(a, 0), cell(b, 1)));
      }
      sec.append(el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, thead, tbody)),
        el("p", { class: "legend", text: a.s === "100 calories" ? "Green marks the better amount for your goals. Per 100 calories shows nutrient density: what you get for the same calories." : "Green marks the better amount for your goals. Servings differ, so compare against how much you'd actually eat, or switch to per 100 calories." }),
        el("div", {}, el("button", { class: "btn small ghost", type: "button", text: "Clear comparison", onclick: () => { compareWith = null; renderResult(current); } })));
    }
    return sec;
  }

  // ---------- result ----------
  const MULTS = [0.5, 1, 1.5, 2, 3];
  const multLabel = m => (m === 0.5 ? "½" : m === 1.5 ? "1½" : String(m));
  function renderResult(f) {
    current = f;
    const isPlate = f.c === "plate";
    if (isPlate) mult = 1;
    const scaled = V.scale(f, mult);
    const a = V.assess(f, profile);
    const head = el("div", { class: "result-head" }, el("h2", { text: f.n }), el("span", { class: "cat", text: isPlate ? f.s : CAT_LABEL[f.c] || "" }));
    let seg = null;
    if (isPlate) {
      head.append(el("button", { class: "icon-btn", type: "button", onclick: () => { $("plateBox").open = true; $("plateBox").scrollIntoView({ behavior: "smooth", block: "start" }); } }, "Edit plate"));
    } else {
      const isFav = favs.includes(f.n), onList = glist.some(x => x.n === f.n);
      head.append(
        el("button", { class: "icon-btn", type: "button", "aria-pressed": isFav ? "true" : "false", onclick: () => toggleFav(f) }, svgIcon(isFav ? STAR_ON : STAR), isFav ? "Saved" : "Save"),
        el("button", { class: "icon-btn", type: "button", "aria-pressed": onList ? "true" : "false", onclick: () => toggleList(f) }, onList ? "On grocery list" : "Add to list"),
        el("button", { class: "icon-btn", type: "button", onclick: () => addToPlate(f, mult) }, `Add ${multLabel(mult)} to plate`));
      if (PAGES) head.append(el("button", { class: "icon-btn", type: "button", onclick: () => copyLink(f) }, svgIcon(LINK), "Copy link"));
      seg = el("div", { class: "serving", role: "group", "aria-label": "Serving size" }, el("span", { class: "lbl", text: "Servings" }));
      for (const m of MULTS) seg.append(el("button", { class: "seg", type: "button", "aria-pressed": m === mult ? "true" : "false", text: multLabel(m), onclick: () => { mult = m; renderResult(current); } }));
    }

    const label = renderLabel(scaled);
    const box = el("div", { class: "explain", "aria-live": "polite" });
    wireLabel(label, box, scaled);
    const src = el("p", { class: "src" });
    if (f.src === "claude") src.append(el("b", { text: "Looked up by Claude. " }), "Typical values; check the package label.");
    else if (f.src === "usda") src.append(el("b", { text: "From USDA FoodData Central. " }), "Values per 100 g.");
    else if (f.src === "off") src.append(el("b", { text: "From Open Food Facts. " }), f.per100 ? "Values are per 100 g because the package has no serving size on file; use the servings buttons to match what you eat." : "Values per the package's serving. Crowd-sourced; check the label.");
    else if (isPlate) src.append("The sum of every item at the servings you chose.");
    else src.append("Typical values for this serving. Brands vary.");

    const missingNote = V.missingNote(scaled);
    const partial = missingNote ? el("p", { class: "partial-note", role: "note" }, el("b", { text: "Partial data. " }), missingNote.replace(/^Partial data: /, "") + " Shown as “—” and not counted.") : null;
    const ICON = { pos: "+", neg: "−", warn: "!", note: "i" };
    const reasons = el("ul", { class: "reasons" });
    for (const r of a.reasons) reasons.append(el("li", { class: r.k }, el("span", { class: "ic", "aria-hidden": "true", text: ICON[r.k] || "i" }), el("span", { text: r.t })));

    $("out").replaceChildren(
      head,
      el("div", { class: "result" },
        el("div", { class: "leftcol" }, seg, partial, label, box, src),
        el("div", { class: "side" },
          el("div", { class: "tag " + a.tier }, el("div", { class: "for", text: isPlate ? "For you · whole meal" : "For you" }), el("div", { class: "verdict", text: a.word }), a.spicy ? el("span", { class: "vp spicy flag", text: "Spicy" }) : null, el("p", { class: "why", text: a.why }),
            mult !== 1 ? el("p", { class: "per", text: "The verdict is for one standard serving; the label and bars show your amount." }) : null),
          renderBars(scaled),
          isPlate ? null : renderSwaps(f),
          el("section", { class: "panel" }, el("h3", { text: "Why" }), reasons),
          isPlate ? null : renderCompare(f)
        ))
    );
  }

  function pick(f, opts = {}) {
    if (current && (current.n !== f.n || current.c === "plate")) { mult = 1; explainKey = null; if (compareWith && compareWith.n === f.n) compareWith = null; }
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

  // ---------- grocery list ----------
  function saveList() { store.set("grocery", glist); renderList(); }
  function toggleList(f) {
    const had = glist.some(x => x.n === f.n);
    glist = had ? glist.filter(x => x.n !== f.n) : [...glist, { n: f.n, done: false }];
    saveList();
    if (current && current.c !== "plate") renderResult(current);
    toast(had ? "Removed from grocery list" : "Added to grocery list");
  }
  function renderList() {
    const box = $("glistItems");
    box.replaceChildren();
    const open = glist.filter(x => !x.done).length;
    $("glistCount").textContent = glist.length ? `${open} to buy${glist.length > open ? ` · ${glist.length - open} done` : ""}` : "empty";
    if (!glist.length) box.append(el("p", { class: "muted", text: "Choose “Add to list” on any food, or add your “Get it” favorites below." }));
    for (const item of [...glist].sort((x, y) => Number(x.done) - Number(y.done))) {
      const f = byName(item.n);
      const id = "g-" + V.slug(item.n);
      box.append(el("div", { class: "lrow" + (item.done ? " done" : "") },
        el("input", { type: "checkbox", id, checked: item.done ? true : null, onchange: e => { item.done = e.target.checked; saveList(); } }),
        el("label", { for: id, text: item.n }),
        f ? pill(V.assess(f, profile)) : null,
        f ? el("button", { class: "linkish", type: "button", text: "View", "aria-label": `View ${item.n}`, onclick: () => pick(f, { scroll: true }) }) : null,
        el("button", { class: "linkish", type: "button", text: "Remove", "aria-label": `Remove ${item.n}`, onclick: () => { glist = glist.filter(x => x !== item); saveList(); if (current && current.c !== "plate") renderResult(current); } })));
    }
    $("glistCopy").disabled = !glist.length; $("glistClear").disabled = !glist.some(x => x.done);
  }
  async function copyList() {
    const text = glist.filter(x => !x.done).map(x => `- ${x.n}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast("List copied"); } catch { toast("Couldn't copy here; select the list and copy it instead."); }
  }
  function addGoodFavorites() {
    const add = favs.map(byName).filter(f => f && V.assess(f, profile).tier === "good" && !glist.some(x => x.n === f.n));
    glist = [...glist, ...add.map(f => ({ n: f.n, done: false }))];
    saveList();
    toast(add.length ? `Added ${add.length} favorite${add.length === 1 ? "" : "s"}` : "No “Get it” favorites to add yet");
  }

  // ---------- plate builder ----------
  function savePlate() { store.set("plate", plate); renderPlate(); }
  function addToPlate(f, m) {
    const ex = plate.find(x => x.n === f.n);
    if (ex) ex.mult = m; else plate.push({ n: f.n, mult: m });
    savePlate();
    toast(`${f.n} is on your plate`);
  }
  function plateFood() {
    const items = plate.map(x => ({ food: byName(x.n), mult: x.mult })).filter(x => x.food);
    return items.length ? V.combine(items) : null;
  }
  function showPlate() {
    const pf = plateFood();
    if (!pf) return;
    explainKey = null;
    renderResult(pf);
    $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function afterPlateChange() {
    savePlate();
    if (current && current.c === "plate") { const pf = plateFood(); if (pf) renderResult(pf); else pick(FOODS[0], { noRecent: true, noHash: true }); }
  }
  function renderPlate() {
    const box = $("plateItems");
    box.replaceChildren();
    const pf = plateFood();
    $("plateCount").textContent = pf ? `${pf.s} · ${V.isLowerBound(pf, "cal") ? "at least " : ""}${Math.round(pf.cal)} cal` : "empty";
    $("plateView").disabled = !pf; $("plateClear").disabled = !pf;
    if (!pf) { box.append(el("p", { class: "muted", text: "Build a meal: open any food, pick the servings, and choose “Add to plate”." })); return; }
    for (const item of plate) {
      const f = byName(item.n);
      if (!f) continue;
      const sel = el("select", { "aria-label": `Servings of ${item.n}`, onchange: e => { item.mult = Number(e.target.value); afterPlateChange(); } },
        ...MULTS.map(m => el("option", { value: String(m), selected: m === item.mult ? true : null, text: `${multLabel(m)} serving${m === 1 ? "" : "s"}` })));
      box.append(el("div", { class: "lrow" },
        el("span", { class: "pname" }, item.n, el("small", { class: "muted", text: ` · ${f.s}` })),
        sel,
        el("button", { class: "linkish", type: "button", text: "Remove", "aria-label": `Remove ${item.n} from plate`, onclick: () => { plate = plate.filter(x => x !== item); afterPlateChange(); } })));
    }
    const tot = (k, unit, word) => V.isMissing(pf, k) ? `${word} not reported` : `${V.isLowerBound(pf, k) ? "at least " : ""}${amt({ ...pf, atLeast: [] }, k, unit)} ${word}`;
    box.append(el("p", { class: "ptotal" }, `Total: ${tot("cal", " cal", "").trim()} · ${tot("pro", " g", "protein")} · ${tot("sat", " g", "saturated fat")} · ${tot("na", " mg", "sodium")} `, pill(V.assess(pf, profile))));
  }

  // ---------- learn mode ----------
  const L = window.SelfCheckLearn;
  let learn = { asked: 0, correct: 0, streak: 0, missed: [], ...store.get("learn", {}) };
  let quizQ = null, quizChosen = null;
  function nextQuestion() {
    const due = L.dueReview(learn);
    const review = due && L.fromId(due.id, FOODS, profile);
    quizQ = review || L.makeQuestion(FOODS, profile, Math.random);
    quizQ.review = !!review;
    quizChosen = null;
    renderQuiz();
    const first = document.querySelector("#quiz .qopt");
    if (first) first.focus();
  }
  function answerQuiz(i) {
    if (quizChosen !== null) return;
    quizChosen = i;
    learn = L.recordAnswer(learn, quizQ, i === quizQ.answer);
    store.set("learn", learn);
    renderQuiz();
    const next = $("quizNext");
    if (next) next.focus();
  }
  function renderQuiz() {
    $("learnScore").textContent = learn.asked ? `${learn.correct} of ${learn.asked} right${learn.streak > 1 ? ` · ${learn.streak} in a row` : ""}${learn.missed.length ? ` · ${learn.missed.length} to review` : ""}` : "";
    const box = $("quiz");
    if (!quizQ) {
      box.replaceChildren(el("p", { class: "muted", text: "Quick questions built from these foods and your goals. Missed ones come back later so they stick." }),
        el("div", {}, el("button", { class: "btn small", type: "button", text: "Start", onclick: nextQuestion })));
      return;
    }
    const done = quizChosen !== null;
    const opts = el("div", { class: "qopts", role: "group", "aria-label": "Answers" }, ...quizQ.options.map((o, i) => el("button", {
      class: "qopt" + (done ? (i === quizQ.answer ? " right" : i === quizChosen ? " wrong" : "") : ""),
      type: "button", "aria-disabled": done ? "true" : null, text: o, onclick: () => answerQuiz(i) })));
    const parts = [quizQ.review ? el("p", { class: "qtag", text: "Review: you missed this one earlier" }) : null, el("p", { class: "qprompt", text: quizQ.prompt }), opts];
    if (done) {
      const right = quizChosen === quizQ.answer;
      parts.push(el("div", { class: "qexplain", "aria-live": "polite" },
        el("p", { class: "qres " + (right ? "ok" : "no"), text: right ? "Correct." : `Not quite. The answer is ${quizQ.options[quizQ.answer]}.` }),
        el("p", { text: quizQ.explain }),
        quizQ.principle ? el("p", { class: "muted", text: quizQ.principle }) : null,
        el("div", { class: "actions" }, el("button", { class: "btn small", type: "button", id: "quizNext", text: "Next question", onclick: nextQuestion }),
          ...quizQ.foods.map(f => el("button", { class: "btn small ghost", type: "button", text: `Open ${f.n}`, onclick: () => pick(f, { scroll: true }) })))));
    }
    box.replaceChildren(...parts);
  }

  // ---------- browse ----------
  let browseCat = "all";
  let browseSort = store.get("browseSort", "az");
  let browseBasis = store.get("browseBasis", "serving");
  const SORTS = [{ id: "az", label: "A–Z" }, { id: "worst", label: "Least healthy first" }, { id: "best", label: "Healthiest first" }];
  function renderBrowse() {
    $("browseCount").textContent = `${allFoods().length} foods`;
    if (!$("browse").open) return; // built when the panel is opened
    const cats = $("cats");
    cats.replaceChildren();
    const opts = [{ id: "all", label: "All" }, ...CATEGORIES, ...(lookups.length ? [{ id: "lookup", label: "Looked up" }] : [])];
    for (const c of opts) cats.append(el("button", { class: "chip" + (c.id === browseCat ? " on" : ""), type: "button", "aria-pressed": c.id === browseCat ? "true" : "false", text: c.label, onclick: () => { browseCat = c.id; renderBrowse(); } }));
    const sorts = $("bsort");
    sorts.replaceChildren(el("span", { class: "lbl", text: "Sort" }));
    for (const s of SORTS) sorts.append(el("button", { class: "chip" + (s.id === browseSort ? " on" : ""), type: "button", "aria-pressed": s.id === browseSort ? "true" : "false", text: s.label, onclick: () => { browseSort = s.id; store.set("browseSort", s.id); renderBrowse(); } }));
    const ranked = browseSort !== "az";
    $("bsortNote").hidden = !ranked;
    const basis = $("bbasis");
    basis.hidden = !ranked;
    basis.replaceChildren(el("span", { class: "lbl", text: "Basis" }), ...[["serving", "Per serving"], ["kcal", "Per 100 calories"]].map(([id, label]) =>
      el("button", { class: "chip" + (browseBasis === id ? " on" : ""), type: "button", "aria-pressed": browseBasis === id ? "true" : "false", text: label, onclick: () => { browseBasis = id; store.set("browseBasis", id); renderBrowse(); } })));
    $("bsortNote").textContent = browseBasis === "kcal"
      ? `Ranked by nutrient density: 100 calories' worth of each food, scored by the same rules as the verdict (lower is less healthy). Foods under ${V.KCAL_MIN} calories per serving keep their per-serving score.`
      : "Ranked per serving by the same score behind each verdict (lower is less healthy), then by how much of your saturated fat, sodium and added-sugar limits one serving uses.";

    const rows = allFoods().filter(f => browseCat === "all" || f.c === browseCat).map(f => ({ f, v: V.assess(f, profile), h: V.health(f, profile, browseBasis) }));
    if (browseSort === "az") rows.sort((x, y) => x.f.n.localeCompare(y.f.n));
    else {
      const dir = browseSort === "worst" ? 1 : -1;
      rows.sort((x, y) => dir * (x.h.score - y.h.score) || dir * (y.h.harm - x.h.harm) || x.f.n.localeCompare(y.f.n));
    }
    const list = $("blist");
    list.classList.toggle("ranked", ranked);
    list.replaceChildren(...rows.map((r, i) => {
      const name = el("span", {}, ranked ? el("span", { class: "rank", text: `${i + 1}.` }) : null, r.f.n);
      const right = el("span", { class: "bright" }, ranked ? el("span", { class: "score", title: browseBasis === "kcal" && r.h.scaled ? "Health score per 100 calories (higher is better)" : "Health score per serving (higher is better)", text: (r.h.score > 0 ? "+" : "") + r.h.score }) : null, pill(r.v));
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
      // USDA's API rejects some requests intermittently; retry twice before giving up.
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, 600 * attempt));
        res = await fetch(url);
        if (res.ok || res.status === 403 || res.status === 429) break;
      }
      if (res.status === 429) throw new Error("rate");
      if (res.status === 403) throw new Error("key");
      if (!res.ok) throw new Error("http");
      const data = await res.json();
      const items = (data.foods || []).map(S.fromUsda).filter(f => f.cal > 0 || f.pro > 0);
      if (!items.length) { box.replaceChildren(el("p", { text: `USDA has no match for “${text}”. Try a simpler name, like “chicken thigh” instead of a brand.` })); return; }
      const list = el("ul", { class: "results" });
      for (const f of items) list.append(el("li", {}, el("button", { type: "button", onclick: () => { saveLookup(f); pick(f); } },
        el("span", { text: f.n }), el("br"), el("small", { text: `${amt(f, "cal", " cal")} · ${amt(f, "pro", " g")} protein · ${V.isMissing(f, "sat") ? "sat fat not reported" : amt(f, "sat", " g") + " sat fat"} per 100 g` }))));
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
    const prompt = S.claudePrompt(text);
    try {
      const d = await sampleFn.json(prompt, { modelTier: "default", cache: { gcTime: 86400000 } });
      if (!d || d.found === false || !d.name) { box.replaceChildren(el("p", { text: `Claude didn't recognize “${text}” as a food. Try a more common name.` })); return; }
      const f = S.fromClaude(d, text);
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
    store.set("profile", profile); syncProfileUI(); renderBrowse(); renderChips(); renderList(); renderPlate();
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
    renderChips(); renderBrowse(); renderList(); renderPlate(); renderQuiz();
    $("learnReset").addEventListener("click", () => { learn = { asked: 0, correct: 0, streak: 0, missed: [] }; store.set("learn", learn); quizQ = null; renderQuiz(); });
    $("browse").addEventListener("toggle", () => { if ($("browse").open) renderBrowse(); });
    $("glistCopy").addEventListener("click", copyList);
    $("glistClear").addEventListener("click", () => { glist = glist.filter(x => !x.done); saveList(); });
    $("glistFavs").addEventListener("click", addGoodFavorites);
    $("plateView").addEventListener("click", showPlate);
    $("plateClear").addEventListener("click", () => { plate = []; afterPlateChange(); });

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
