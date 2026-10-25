// UI for Should I Buy It? Runs on GitHub Pages ("pages" mode) and inside Claude ("claude" mode).
(function () {
  "use strict";
  const { FOODS, CATEGORIES, DV } = window.SelfCheckData;
  const V = window.SelfCheckVerdict;
  const S = window.SelfCheckSources;
  const Q = window.SelfCheckSearch;
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
  // Lookups saved before added sugar was tracked as "unknown" stored it as 0; re-check them with the current rule.
  for (const f of lookups) if ((f.src === "usda" || f.src === "off") && f.addLikelyZero === undefined) {
    f.missing = Array.isArray(f.missing) ? f.missing : [];
    S.settleAddedSugar(f, f.src === "off" ? !f.missing.includes("add") : f.add > 0, /\braw\b/i.test(f.n));
  }
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
  // Differences are per serving when servings have similar calories, otherwise per 100 calories, so a big
  // serving can't win just by being big. Only differences of at least 10% of the Daily Value are listed.
  function swapReason(f, g) {
    const { bits, kinds, basis } = V.swapDiffs(f, g);
    const parts = [...kinds];
    if (bits.length) {
      const t = bits.join(" · ");
      parts.push(t[0].toUpperCase() + t.slice(1) + (basis === "kcal" ? ` per 100 calories (serving: ${g.s})` : ` per serving (${g.s} vs ${f.s})`));
      return parts.join(" · ");
    }
    return `${parts.length ? parts.join(" · ") : "Rated higher for your goals"} (${g.s})`;
  }
  function renderSwaps(f) {
    const swaps = V.findSwaps(f, allFoods(), profile, 3);
    if (!swaps.length) return null;
    const list = el("div", { class: "swaps" });
    for (const s of swaps) {
      list.append(el("button", { class: "swap", type: "button", onclick: () => pick(s.food) },
        el("span", { class: "sn", text: s.food.n }), pill(s.verdict),
        el("span", { class: "sd", text: swapReason(f, s.food) })));
    }
    return el("section", { class: "panel" }, el("h3", { text: "Try instead" }), list);
  }

  // ---------- additives (scanned products) ----------
  // Every additive with what it does; a few flagged with a sourced reason; the NOVA processing level.
  function renderAdditives(f) {
    const info = window.SelfCheckAdditives && window.SelfCheckAdditives.analyze(f);
    if (!info) return null;
    const sec = el("section", { class: "panel additives" }, el("h3", { text: "Additives & processing" }));
    if (info.novaInfo) sec.append(el("div", { class: "nova n" + info.nova },
      el("span", { class: "nova-badge", text: `NOVA ${info.nova}` }),
      el("span", {}, el("b", { text: info.novaInfo[0] + ". " }), info.novaInfo[1])));
    if (info.known) {
      if (!info.items.length) sec.append(el("p", { class: "muted", text: "No additives listed." }));
      else {
        const list = el("ul", { class: "addlist" });
        for (const a of info.items) {
          const li = el("li", { class: a.flag ? "flagged" : null },
            el("span", { class: "acode", text: a.code || "—" }),
            el("span", { class: "abody" }, el("span", { class: "aname", text: a.name }), a.fn ? el("span", { class: "afn", text: ` · ${a.fn}` }) : null,
              a.flag ? el("span", { class: "aflag" }, a.flag.t, a.flag.src ? " " : null, a.flag.src ? el("a", { href: a.flag.src, target: "_blank", rel: "noopener", text: "Source" }) : null) : null,
              a.efsaHigh ? el("span", { class: "aefsa", text: "EFSA's safety review found some people may exceed the acceptable daily intake." }) : null));
          list.append(li);
        }
        sec.append(list);
      }
    }
    if (f.ingredients) sec.append(el("details", { class: "ingr" }, el("summary", { text: "Ingredients" }), el("p", { text: f.ingredients })));
    sec.append(el("p", { class: "legend", text: (info.fromText ? "Found by name in the ingredient list, so an additive listed under an unusual name can be missed. " : "From Open Food Facts. ") + "Additives approved in the US and EU are judged safe at normal amounts; only ones with a documented concern are flagged. Add any you avoid to your skip list (for example “sucralose” or “E407”)." }));
    return sec;
  }

  // ---------- price (typical, or your own) ----------
  const PR = window.SelfCheckPrices;
  let myPrices = store.get("myPrices", {});
  let priceEditing = null;
  const saveMyPrices = () => { store.set("myPrices", myPrices); renderBrowse(); renderPlate(); if (current) renderResult(current); };
  function renderPrice(f) {
    if (!PR) return null;
    const p = PR.price({ ...f, mult }, myPrices);
    const sec = el("section", { class: "panel price" });
    const editing = priceEditing === f.n;
    const unitWord = p && !p.mine ? p.unitLabel : p && p.mine && p.unitLabel !== "serving" ? p.unitLabel : "serving";
    if (p) {
      const v = PR.value(f, p);
      sec.append(el("div", { class: "price-main" },
        el("span", { class: "price-amt", text: `≈ ${PR.money(p.cost)}` }),
        el("span", {}, mult === 1 ? " per serving" : ` for ${fmt(mult)} servings`, v ? el("span", { class: "price-val", text: ` · ${v.text}` }) : null)));
      sec.append(el("p", { class: "legend" }, p.mine
        ? `Your price: ${PR.money(p.unitPrice)} per ${unitWord}${p.typical != null ? ` (typical ${PR.money(p.typical)} per serving)` : ""}.`
        : `Typical ${PR.money(p.unitPrice)} per ${p.unitLabel} · ${p.source}${p.note ? ` · ${p.note}` : ""}. Your store may differ.`));
    } else sec.append(el("p", { class: "legend", text: "No typical price for this food: there's no free, current price series for it." }));
    if (editing) {
      const input = el("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", id: "myPrice", "aria-label": `Your price per ${unitWord}`, value: p && p.mine ? String(p.unitPrice) : "" });
      const save = () => { const v = Number(input.value); if (!(v > 0)) { input.setAttribute("aria-invalid", "true"); return; }
        myPrices = { ...myPrices, [f.n]: p && !(p.mine && p.unitLabel === "serving") && PR.has(f.n) ? { unit: v } : { serving: v } }; priceEditing = null; saveMyPrices(); };
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { priceEditing = null; renderResult(current); } });
      sec.append(el("div", { class: "price-edit" }, el("label", { for: "myPrice", text: `What you pay, $ per ${PR.has(f.n) ? (p ? p.unitLabel : "serving") : "serving"}` }), input,
        el("button", { class: "btn small", type: "button", text: "Save", onclick: save }),
        el("button", { class: "btn small ghost", type: "button", text: "Cancel", onclick: () => { priceEditing = null; renderResult(current); } })));
      setTimeout(() => input.focus(), 0);
    } else {
      const row = el("div", { class: "chiprow", style: "margin:0" },
        el("button", { class: "linkish", type: "button", text: p && p.mine ? "Change my price" : PR.has(f.n) ? "Use my store's price" : "Add my price", onclick: () => { priceEditing = f.n; renderResult(current); } }));
      if (p && p.mine) row.append(el("button", { class: "linkish", type: "button", text: "Use typical price", onclick: () => { const m = { ...myPrices }; delete m[f.n]; myPrices = m; saveMyPrices(); } }));
      sec.append(row);
    }
    return sec;
  }
  function renderPlatePrice() {
    if (!PR) return null;
    const c = PR.plateCost(plate.map(i => ({ food: byName(i.n), mult: i.mult })).filter(i => i.food), myPrices);
    if (!c.priced) return null;
    return el("section", { class: "panel price" }, el("div", { class: "price-main" },
      el("span", { class: "price-amt", text: `≈ ${PR.money(c.total)}` }), el("span", { text: c.missing ? ` for the ${c.priced} item${c.priced === 1 ? "" : "s"} with a price (${c.missing} without)` : " for this meal" })));
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
      const basisRow = el("div", { class: "chiprow", style: "margin:0", role: "group", "aria-label": "Compare basis" }, 
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
        // Highlight only a meaningful difference: at least 10% apart and at least 5% of the Daily Value.
        const win = !unknown && dir && V.meaningfulDiff(k, x, y) ? ((dir === "more") === (x > y) ? 0 : 1) : -1;
        const cell = (food, i) => el("td", { class: win === i ? "win" : null, text: amt(food, k, unit) });
        tbody.append(el("tr", {}, el("td", { text: label }), cell(a, 0), cell(b, 1)));
      }
      // Price per serving, when both have one (lower highlighted when at least 10% and 5¢ apart).
      const pa = PR && PR.price({ ...f, mult }, myPrices), pb = PR && PR.price(compareWith, myPrices);
      if (pa && pb) {
        const x = cmpBasis === "kcal" && a !== f ? pa.perServing * 100 / f.cal : pa.cost, y = cmpBasis === "kcal" && b !== compareWith ? pb.perServing * 100 / compareWith.cal : pb.cost;
        const win = Math.abs(x - y) >= Math.max(0.05, 0.1 * Math.max(x, y)) ? (x < y ? 0 : 1) : -1;
        tbody.append(el("tr", {}, el("td", { text: "Typical price" }), el("td", { class: win === 0 ? "win" : null, text: PR.money(x) }), el("td", { class: win === 1 ? "win" : null, text: PR.money(y) })));
      }
      sec.append(el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, thead, tbody)),
        el("p", { class: "legend", text: a.s === "100 calories" ? "Green marks a meaningful difference (at least 10% apart and 5% of the daily value). Per 100 calories shows nutrient density: what you get for the same calories." : "Green marks a meaningful difference (at least 10% apart and 5% of the daily value). Servings differ, so compare against how much you'd actually eat, or switch to per 100 calories." }),
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
      const actions = el("div", { class: "actions", role: "group", "aria-label": "Actions" });
      head.append(actions);
      actions.append(
        el("button", { class: "icon-btn", type: "button", "aria-pressed": isFav ? "true" : "false", onclick: () => toggleFav(f) }, svgIcon(isFav ? STAR_ON : STAR), stableLabel(isFav, "Save", "Saved")),
        el("button", { class: "icon-btn", type: "button", "aria-pressed": onList ? "true" : "false", onclick: () => toggleList(f) },
          el("span", { class: "lbl-long" }, stableLabel(onList, "Add to list", "On grocery list")), el("span", { class: "lbl-short" }, stableLabel(onList, "+ List", "On list"))),
        el("button", { class: "icon-btn", type: "button", onclick: () => addToPlate(f, mult) },
          el("span", { class: "lbl-long", text: `Add ${multLabel(mult)} to plate` }), el("span", { class: "lbl-short", text: `+ ${multLabel(mult)} to plate` })));
      if (PAGES) actions.append(el("button", { class: "icon-btn icon-only", type: "button", "aria-label": "Copy link", title: "Copy link", onclick: () => copyLink(f) }, svgIcon(LINK), el("span", { class: "lbl-long", text: "Copy link" })));
      seg = el("div", { class: "serving", role: "group", "aria-label": "Serving size" }, el("span", { class: "lbl", text: "Servings" }));
      for (const m of MULTS) seg.append(el("button", { class: "seg", type: "button", "aria-pressed": m === mult ? "true" : "false", text: multLabel(m), onclick: () => { mult = m; renderResult(current); } }));
    }

    const label = renderLabel(scaled);
    const box = el("div", { class: "explain", "aria-live": "polite" });
    wireLabel(label, box, scaled);
    const src = el("p", { class: "src" });
    if (f.src === "claude") src.append(el("b", { text: "Looked up by Claude. " }), "Typical values; check the package label.");
    else if (f.src === "usda" && f.dataType === "Branded") src.append(el("b", { text: "From USDA Branded Foods. " }),
      `The brand's own label${f.published ? `, published ${f.published}` : ""}${f.gtin ? ` (UPC ${f.gtin})` : ""}. ${f.perServing ? "Values per serving." : "Values per 100 g."} Recipes change; the package wins.`);
    else if (f.src === "usda") src.append(el("b", { text: "From USDA FoodData Central. " }), "Values per 100 g.");
    else if (f.src === "off") src.append(el("b", { text: "From Open Food Facts. " }), f.per100 ? "Values are per 100 g because the package has no serving size on file; use the servings buttons to match what you eat." : "Values per the package's serving. Crowd-sourced; check the label.");
    else if (isPlate) src.append("The sum of every item at the servings you chose. Judged as one meal: against a third of your daily goals and limits.");
    else src.append("Typical values for this serving. Brands vary.");

    const missingNote = V.missingNote(scaled);
    const partial = missingNote ? el("p", { class: "partial-note", role: "note" }, el("b", { text: "Partial data. " }), missingNote.replace(/^Partial data: /, "") + " Shown as “—” and not counted.") : null;
    const ICON = { pos: "+", neg: "−", warn: "!", note: "i" };
    const reasons = el("ul", { class: "reasons" });
    for (const r of a.reasons) reasons.append(el("li", { class: r.k }, el("span", { class: "ic", "aria-hidden": "true", text: ICON[r.k] || "i" }), el("span", { text: r.t })));

    $("out").replaceChildren(...[
      closestBanner(f),
      head,
      el("div", { class: "result" },
        el("div", { class: "leftcol" }, seg, partial, label, box, src),
        el("div", { class: "side" },
          el("div", { class: "tag " + a.tier }, el("div", { class: "for", text: isPlate ? "For you · whole meal" : "For you" }), el("div", { class: "verdict", text: a.word }), a.spicy ? el("span", { class: "vp spicy flag", text: "Spicy" }) : null, el("p", { class: "why", text: a.why }),
            mult !== 1 ? el("p", { class: "per", text: "The verdict is for one standard serving; the label and bars show your amount." }) : null),
          isPlate ? renderPlatePrice() : renderPrice(f),
          renderBars(scaled),
          isPlate ? null : renderSwaps(f),
          el("section", { class: "panel" }, el("h3", { text: "Why" }), reasons),
          isPlate ? null : renderAdditives(f),
          isPlate ? null : renderCompare(f)
        ))
    ].filter(Boolean));
  }

  // When Enter found only a loose match ("kirkland protein bar" → Protein bar), say so above the result.
  let closestFor = null;
  function closestBanner(f) {
    if (!closestFor || closestFor.n !== f.n) return null;
    const text = closestFor.text;
    const box = el("div", { class: "notice closest", role: "status" }, el("p", {}, closestFor.link ? `No food matches the link #${closestFor.link} exactly. ` : "", "Showing closest match: ", el("strong", { text: f.n }), closestFor.link ? "." : ". It's not exactly what you typed."));
    if (PAGES) box.append(el("button", { class: "btn small ghost", type: "button", text: `Search USDA for “${text}” instead`, onclick: () => usdaSearch(text, box) }),
      el("button", { class: "btn small ghost", type: "button", text: "Packaged products", title: `Search packaged products (USDA Branded Foods) for “${text}”`, onclick: () => usdaSearch(text, box, "branded") }));
    else if (sampleState !== "none") box.append(el("button", { class: "btn small ghost", type: "button", text: `Look up “${text}” with Claude instead`, onclick: () => claudeLookup(text, box) }));
    return box;
  }
  function pick(f, opts = {}) {
    if (current && (current.n !== f.n || current.c === "plate")) { mult = 1; explainKey = null; if (compareWith && compareWith.n === f.n) compareWith = null; }
    closestFor = opts.closest ? { n: f.n, text: opts.closest, link: opts.fromLink } : null;
    if (!current || current.n !== f.n) priceEditing = null;
    $("q").value = opts.closest || f.n; $("suggest").hidden = true;
    renderResult(f);
    if (!opts.noRecent) addRecent(f);
    if (PAGES && !opts.noHash) { try { history.replaceState(null, "", "#" + S.linkId(f, V.slug)); } catch {} }
    if (opts.scroll) $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // A toggle label that's always as wide as its longer state, so pressing it never moves the buttons beside it.
  const stableLabel = (on, off, onText) => el("span", { class: "stable" },
    el("span", { text: off, "aria-hidden": on ? "true" : null, class: on ? "ghost" : null }),
    el("span", { text: onText, "aria-hidden": on ? null : "true", class: on ? null : "ghost" }));

  // ---------- favorites, recents, share ----------
  // Recents keep 12 names; the shelf always shows up to 6 that aren't already favorites.
  const RECENTS_KEEP = 12, RECENTS_SHOW = 6;
  function addRecent(f) { recents = [f.n, ...recents.filter(n => n !== f.n)].slice(0, RECENTS_KEEP); store.set("recents", recents); renderChips(); }
  function toggleFav(f) {
    favs = favs.includes(f.n) ? favs.filter(n => n !== f.n) : [f.n, ...favs].slice(0, 30);
    store.set("favorites", favs); renderChips(); renderResult(current);
  }
  async function copyLink(f) {
    const url = location.href.split("#")[0] + "#" + S.linkId(f, V.slug);
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { toast(url); }
  }
  // Chips show a short name ("Chicken breast") unless two chips would read the same; then both show in full.
  function chipRow(rowId, names) {
    const row = $(rowId);
    const lbl = row.querySelector(".lbl");
    row.replaceChildren(lbl);
    const foods = [...new Set(names)].map(byName).filter(Boolean);
    const short = f => f.n.split(",")[0];
    const count = {}; for (const f of foods) count[short(f)] = (count[short(f)] || 0) + 1;
    for (const f of foods) row.append(el("button", { class: "chip", type: "button", text: count[short(f)] > 1 ? f.n : short(f), title: f.n, onclick: () => pick(f) }));
    row.hidden = !foods.length;
  }
  const QUICK = ["Avocado", "Ground beef 80/20", "Chicken breast, grilled", "Greek yogurt, plain nonfat", "Eggs", "Oatmeal, rolled oats", "Shrimp", "Instant ramen"];
  // Fade the shelf's edges only where there's more to scroll.
  function shelfFade() {
    const sh = $("shelf"); if (!sh) return;
    const more = sh.scrollWidth - sh.clientWidth;
    sh.classList.toggle("fade-start", more > 1 && sh.scrollLeft > 1);
    sh.classList.toggle("fade-end", more > 1 && sh.scrollLeft < more - 1);
  }
  function renderChips() {
    requestAnimationFrame(shelfFade);
    chipRow("favRow", favs);
    chipRow("recentRow", recents.filter(n => !favs.includes(n) && byName(n)).slice(0, RECENTS_SHOW));
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
    const pc = PR ? PR.plateCost(plate.map(i => ({ food: byName(i.n), mult: i.mult })).filter(i => i.food), myPrices) : null;
    const costText = pc && pc.priced ? ` · ≈ ${PR.money(pc.total)}${pc.missing ? ` (${pc.missing} item${pc.missing === 1 ? "" : "s"} unpriced)` : ""}` : "";
    box.append(el("p", { class: "ptotal" }, `Total: ${tot("cal", " cal", "").trim()} · ${tot("pro", " g", "protein")} · ${tot("sat", " g", "saturated fat")} · ${tot("na", " mg", "sodium")}${costText} `, pill(V.assess(pf, profile))));
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
    box.replaceChildren(...parts.filter(Boolean)); // null placeholders would render as the text "null"
  }

  // ---------- browse ----------
  let browseCat = "all";
  let browseSort = store.get("browseSort", "az");
  let browseBasis = store.get("browseBasis", "serving");
  const SORTS = [{ id: "az", label: "A–Z" }, { id: "worst", label: "Least healthy first" }, { id: "best", label: "Healthiest first" }, { id: "value", label: "Most protein per $" }];
  function renderBrowse() {
    $("browseCount").textContent = foodCountText();
    if (!$("browse").open) return; // built when the panel is opened
    const cats = $("cats");
    cats.replaceChildren();
    const opts = [{ id: "all", label: "All" }, ...CATEGORIES, ...(lookups.length ? [{ id: "lookup", label: "Looked up" }] : [])];
    for (const c of opts) cats.append(el("button", { class: "chip" + (c.id === browseCat ? " on" : ""), type: "button", "aria-pressed": c.id === browseCat ? "true" : "false", text: c.label, onclick: () => { browseCat = c.id; renderBrowse(); } }));
    const sorts = $("bsort");
    sorts.replaceChildren(el("span", { class: "lbl", text: "Sort" }));
    for (const s of SORTS) sorts.append(el("button", { class: "chip" + (s.id === browseSort ? " on" : ""), type: "button", "aria-pressed": s.id === browseSort ? "true" : "false", text: s.label, onclick: () => { browseSort = s.id; store.set("browseSort", s.id); renderBrowse(); } }));
    const ranked = browseSort !== "az", byValue = browseSort === "value";
    $("bsortNote").hidden = !ranked;
    const basis = $("bbasis");
    basis.hidden = !ranked || byValue;
    basis.replaceChildren(el("span", { class: "lbl", text: "Basis" }), ...[["serving", "Per serving"], ["kcal", "Per 100 calories"]].map(([id, label]) =>
      el("button", { class: "chip" + (browseBasis === id ? " on" : ""), type: "button", "aria-pressed": browseBasis === id ? "true" : "false", text: label, onclick: () => { browseBasis = id; store.set("browseBasis", id); renderBrowse(); } })));
    $("bsortNote").textContent = browseBasis === "kcal"
      ? `Ranked by nutrient density: 100 calories' worth of each food, scored by the same rules as the verdict (lower is less healthy). Foods under ${V.KCAL_MIN} calories per serving keep their per-serving score.`
      : "Ranked per serving by the same score behind each verdict (lower is less healthy), then by how much of your saturated fat, sodium and added-sugar limits one serving uses.";

    if (byValue) $("bsortNote").textContent = `Grams of protein a dollar buys, at typical prices (or yours). Only priced foods that are real protein sources (at least 5 g and 20% of calories from protein) are listed. Prices: BLS ${PR.meta.bls}, produce from USDA ERS adjusted to ${PR.meta.cpi}.`;
    let rows = allFoods().filter(f => browseCat === "all" || f.c === browseCat).map(f => ({ f, v: V.assess(f, profile), h: V.health(f, profile, browseBasis) }));
    if (byValue) {
      rows = rows.map(r => { const p = PR.price(r.f, myPrices); const val = PR.value(r.f, p); return { ...r, p, val }; }).filter(r => r.val && r.val.k === "pro");
      rows.sort((x, y) => y.val.v - x.val.v || x.f.n.localeCompare(y.f.n));
    } else if (browseSort === "az") rows.sort((x, y) => x.f.n.localeCompare(y.f.n));
    else {
      const dir = browseSort === "worst" ? 1 : -1;
      rows.sort((x, y) => dir * (x.h.score - y.h.score) || dir * (y.h.harm - x.h.harm) || x.f.n.localeCompare(y.f.n));
    }
    const list = $("blist");
    list.classList.toggle("ranked", ranked);
    list.replaceChildren(...rows.map((r, i) => {
      const name = el("span", {}, ranked ? el("span", { class: "rank", text: `${i + 1}.` }) : null, r.f.n);
      if (byValue) return el("button", { class: "bitem", type: "button", onclick: () => pick(r.f, { scroll: true }) }, name,
        el("span", { class: "bright" }, el("span", { class: "score", title: `${PR.money(r.p.perServing)} per serving`, text: `${Math.round(r.val.v)} g/$` }), pill(r.v)));
      const right = el("span", { class: "bright" }, ranked ? el("span", { class: "score", title: browseBasis === "kcal" && r.h.scaled ? "Health score per 100 calories (higher is better)" : "Health score per serving (higher is better)", text: (r.h.score > 0 ? "+" : "") + r.h.score }) : null, pill(r.v));
      return el("button", { class: "bitem", type: "button", onclick: () => pick(r.f, { scroll: true }) }, name, right);
    }));
    $("browseCount").textContent = foodCountText();
  }

  // ---------- search ----------
  // Matching lives in search.js (exact, prefix, word, contains, and typo-tolerant).
  const match = q => Q.match(q, allFoods()).map(x => x.f);

  // `extra(text)` can add a final action row, e.g. "Search packaged products for …".
  function attachSuggest(input, list, onPick, extra) {
    let sel = -1, sugg = [];
    const close = () => { list.hidden = true; sel = -1; };
    const choose = item => { close(); if (item.run) item.run(); else onPick(item); };
    input.addEventListener("input", () => {
      const text = input.value.trim();
      sugg = text ? match(input.value).slice(0, 7) : [];
      const act = text && extra ? extra(text) : null;
      if (act) sugg.push(act);
      sel = -1;
      list.replaceChildren();
      if (!sugg.length) return close();
      sugg.forEach((f, i) => {
        const li = f.run
          ? el("li", { role: "option", class: "action", id: input.id + "-opt" + i, "aria-selected": "false" }, el("span", { text: f.label }))
          : el("li", { role: "option", id: input.id + "-opt" + i, "aria-selected": "false" }, el("span", { text: f.n }), pill(V.assess(f, profile)));
        li.addEventListener("mousedown", e => { e.preventDefault(); choose(f); });
        list.append(li);
      });
      list.hidden = false;
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", e => {
      // Escape closes open suggestions and keeps the text; a type="search" box would otherwise clear the whole query.
      // With nothing open, Escape does the browser's usual clear.
      if (e.key === "Escape") { if (!list.hidden) { e.preventDefault(); close(); } return; }
      if (list.hidden || !sugg.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + sugg.length) % sugg.length;
        [...list.children].forEach((li, i) => li.setAttribute("aria-selected", i === sel ? "true" : "false"));
        input.setAttribute("aria-activedescendant", input.id + "-opt" + sel);
      } else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); choose(sugg[sel]); }
      else if (e.key === "Enter" && input.id === "cmpq") { e.preventDefault(); const m = match(input.value); if (m.length) choose(m[0]); }
    });
  }

  // ---------- lookups for foods that aren't built in ----------
  // Same numbers in the header and the Browse panel: built-ins + looked-up foods.
  const foodCountText = () => `${FOODS.length} foods` + (lookups.length ? ` + ${lookups.length} looked up` : "");
  function updateCount() {
    $("foodCount").textContent = `${FOODS.length} common foods built in` + (lookups.length ? ` + ${lookups.length} looked up.` : ".");
  }
  function saveLookup(f) {
    if (FOODS.some(x => x.n === f.n)) f.n += f.src === "off" ? "" : " (lookup)";
    lookups = [f, ...lookups.filter(x => x.n !== f.n)].slice(0, 80);
    store.set("lookups", lookups);
    updateCount(); renderBrowse();
  }

  function openPackaged(text) {
    closestFor = null;
    const box = el("div", { class: "notice" }); $("out").replaceChildren(box);
    packagedSearch(text, box);
  }
  function offerLookup(text, near, typo, link) {
    closestFor = null;
    const box = el("div", { class: "notice" }, el("p", { text: link ? `No food matches the link #${link}.` : typo ? `No exact match for “${text}”.` : `“${text}” isn't in the built-in list.` }));
    if (near.length) {
      const p = el("p", { class: "muted" }, near.length > 1 && !typo ? "Did you mean one of these? " : "Did you mean ");
      near.forEach(f => p.append(el("button", { class: "chip", type: "button", text: f.n, onclick: () => pick(f) }), " "));
      box.append(p);
    }
    if (PAGES) {
      box.append(el("div", { class: "chiprow", style: "margin:0" },
        el("button", { class: "btn ghost", type: "button", text: `Search USDA for “${text}”`, onclick: () => usdaSearch(text, box) }),
        el("button", { class: "btn ghost", type: "button", text: "Packaged products", title: `Search packaged products (USDA Branded Foods) for “${text}”`, onclick: () => usdaSearch(text, box, "branded") })));
    } else if (sampleState !== "none") {
      box.append(el("button", { class: "btn ghost", type: "button", text: `Look up “${text}” with Claude`, onclick: () => claudeLookup(text, box) }),
        el("p", { class: "muted", style: "font-size:13px", text: "Uses your Claude account. You'll be asked to allow it the first time." }));
    } else box.append(el("p", { class: "muted", text: "Lookups aren't available in this view, so only built-in foods work here." }));
    $("out").replaceChildren(box);
  }
  const busy = (box, msg) => box.replaceChildren(el("span", { class: "thinking" }, el("span", { class: "dot" }), msg));

  // Packaged products by name: AND search (all words, any field), falling back to any-word search, then re-ranked
  // here with an optional Walmart-brands-only filter (remembered).
  let walmartOnly = store.get("walmartOnly", false);
  async function packagedSearch(text, box) {
    busy(box, `Searching packaged products for ${text}…`);
    const key = (profile.usdaKey || "").trim() || "DEMO_KEY";
    const get = async all => {
      const res = await withTimeout(fetch(S.brandedSearchUrl(text, key, { all })), LOOKUP_MS);
      if (res.status === 429) throw Object.assign(new Error("rate"), { name: "RateLimit" });
      if (res.status === 403) throw Object.assign(new Error("key"), { name: "KeyError" });
      if (!res.ok) throw Object.assign(new Error("http"), { name: "HttpError", status: res.status });
      return (await res.json()).foods || [];
    };
    try {
      let raw = await get(true), loose = false;
      if (!raw.length) { raw = await get(false); loose = true; }
      const render = () => {
        const ranked = S.rankBranded(raw, text, { walmartOnly });
        const items = ranked.map(S.fromUsda).filter(f => !["cal", "fat", "carb", "pro"].every(k => V.isMissing(f, k))).slice(0, 15);
        const toggle = el("button", { class: "chip" + (walmartOnly ? " on" : ""), type: "button", "aria-pressed": walmartOnly ? "true" : "false", text: "Walmart brands only",
          onclick: () => { walmartOnly = !walmartOnly; store.set("walmartOnly", walmartOnly); render(); } });
        const head = el("div", { class: "chiprow", style: "margin:0" }, toggle);
        const generic = el("button", { class: "btn small ghost", type: "button", text: `Search generic foods for “${text}”`, onclick: () => usdaSearch(text, box) });
        if (!items.length) {
          box.replaceChildren(el("p", { text: walmartOnly ? `No Walmart-brand product matches “${text}”.` : `No packaged product matches “${text}”. Try the brand and product, like “great value whole milk”.` }), head, generic);
          return;
        }
        const list = el("ul", { class: "results" });
        for (const f of items) list.append(el("li", {}, el("button", { type: "button", onclick: () => { saveLookup(f); pick(f); } },
          el("span", { class: "rname" }, el("span", { text: f.n }), pill(V.assess(f, profile))),
          el("small", { text: `${amt(f, "cal", " cal")} · ${amt(f, "pro", " g")} protein · ${V.isMissing(f, "sat") ? "sat fat not reported" : amt(f, "sat", " g") + " sat fat"} per ${f.perServing ? f.s : "100 g"}${f.published ? ` · label from ${String(f.published).slice(0, 4)}` : ""}` }))));
        box.replaceChildren(el("p", { text: loose ? `Nothing matched every word of “${text}”, so these match some of them.` : "Packaged products from USDA Branded Foods, with each label's serving." }), head, list, generic);
      };
      render();
    } catch (e) {
      const msg = e.name === "RateLimit" ? "USDA's shared demo key is out of searches for now. Add your own free key under Your goals, or try again later."
        : e.name === "KeyError" ? "USDA rejected the API key. Check the key under Your goals."
        : navigator.onLine === false ? "You're offline. Packaged-product search needs a connection."
        : e.name === "TimeoutError" ? "USDA took too long to answer. Try again in a moment." : "The search didn't go through. Try again in a moment.";
      box.replaceChildren(el("p", { text: msg }), el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: () => packagedSearch(text, box) }));
    }
  }

  async function usdaSearch(text, box, kind = "generic") {
    if (kind === "branded") return packagedSearch(text, box);
    const branded = false;
    busy(box, branded ? `Searching packaged products for ${text}…` : `Searching USDA for ${text}…`);
    const key = (profile.usdaKey || "").trim() || "DEMO_KEY";
    const url = S.usdaSearchUrl(text, key, kind);
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
      // Keep anything with reported nutrition, including zero-calorie products (tea, diet soda).
      const items = (data.foods || []).map(S.fromUsda).filter(f => !["cal", "fat", "carb", "pro"].every(k => V.isMissing(f, k)));
      const other = el("button", { class: "btn small ghost", type: "button", text: branded ? `Search generic foods for “${text}”` : `Search packaged products for “${text}”`, onclick: () => usdaSearch(text, box, branded ? "generic" : "branded") });
      if (!items.length) { box.replaceChildren(el("p", { text: branded ? `No packaged product matches “${text}”. Try the brand and product, like “great value whole milk”.` : `USDA has no match for “${text}”. Try a simpler name, like “chicken thigh” instead of a brand.` }), other); return; }
      const list = el("ul", { class: "results" });
      for (const f of items) list.append(el("li", {}, el("button", { type: "button", onclick: () => { saveLookup(f); pick(f); } },
        el("span", { text: f.n }), el("br"), el("small", { text: `${amt(f, "cal", " cal")} · ${amt(f, "pro", " g")} protein · ${V.isMissing(f, "sat") ? "sat fat not reported" : amt(f, "sat", " g") + " sat fat"} per ${f.perServing ? f.s : "100 g"}` }))));
      box.replaceChildren(el("p", { text: branded ? "Pick the product. Values are per serving from its label." : "Pick the closest match. USDA values are per 100 g." }), list, other);
    } catch (e) {
      const msg = e.message === "rate" ? "USDA's shared demo key is out of searches for now. Add your own free key under Your goals, or try again later."
        : e.message === "key" ? "USDA rejected the API key. Check the key under Your goals."
        : navigator.onLine === false ? "You're offline. Built-in foods still work; USDA search needs a connection." : "The USDA search didn't go through. Try again in a moment.";
      box.replaceChildren(el("p", { text: msg }), el("button", { class: "btn ghost", type: "button", text: "Try again", onclick: () => usdaSearch(text, box, kind) }));
    }
  }

  // Resolves or rejects like `promise`, but rejects with a "timeout" error after `ms` instead of hanging forever.
  const withTimeout = (promise, ms) => new Promise((ok, fail) => {
    const t = setTimeout(() => fail(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms);
    promise.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); fail(e); });
  });
  const LOOKUP_MS = CFG.lookupTimeoutMs || 15000, CAMERA_MS = CFG.cameraTimeoutMs || 60000;

  // A barcode is looked up in Open Food Facts first (crowd-sourced, worldwide, tags additives and NOVA), then in
  // USDA Branded Foods (labels US brands submit, including Walmart's Great Value, Marketside and Equate).
  async function barcodeLookup(code) {
    const clean = String(code).replace(/\D/g, "");
    if (clean.length < 8) { toast("That doesn't look like a full barcode."); return; }
    const box = el("div", { class: "notice" }); $("out").replaceChildren(box);
    busy(box, `Looking up barcode ${clean}…`);
    const byName = el("button", { class: "btn small ghost", type: "button", text: "Search by name", onclick: () => { $("q").focus(); $("q").select(); } });
    const retry = el("button", { class: "btn small ghost", type: "button", text: "Try again", onclick: () => barcodeLookup(clean) });
    let offErr = null, offEmpty = null;
    try {
      const res = await withTimeout(fetch(S.offProductUrl(clean)), LOOKUP_MS);
      // Open Food Facts answers an unknown barcode with 404 and status 0; other errors mean it's having trouble.
      if (!res.ok && res.status !== 404) throw Object.assign(new Error("http"), { name: "HttpError", status: res.status });
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const f = S.fromOff(clean, data.product);
        // "No nutrition data" means nothing was reported, not that everything is zero (diet soda, water).
        if (!["cal", "fat", "carb", "pro"].every(k => V.isMissing(f, k))) { saveLookup(f); pick(f); return; }
        offEmpty = f.n;
      }
    } catch (e) { offErr = e; }

    busy(box, `${offErr ? "Open Food Facts didn't answer" : offEmpty ? `Open Food Facts has “${offEmpty}” but no nutrition data` : "Not in Open Food Facts"}. Checking USDA Branded Foods…`);
    let usdaErr = null;
    try {
      const f = await usdaByUpc(clean);
      if (f) { saveLookup(f); pick(f); return; }
    } catch (e) { usdaErr = e; }

    const offline = navigator.onLine === false;
    const why = e => !e ? "" : e.name === "TimeoutError" ? "took too long to answer" : e.name === "RateLimit" ? "is out of free searches for now" : e.name === "HttpError" ? `had an error (${e.status})` : "couldn't be reached";
    const lines = offline ? [el("p", { text: "You're offline. Barcode lookup needs a connection." })]
      : !offErr && !usdaErr ? [el("p", { text: offEmpty ? `Found “${offEmpty}”, but neither Open Food Facts nor USDA has its nutrition data.` : `Neither Open Food Facts nor USDA Branded Foods has barcode ${clean}.` }),
          el("p", { class: "muted", text: "Check the number, or search the food by name." })]
      : [el("p", { text: `Couldn't finish the lookup: ${offErr ? `Open Food Facts ${why(offErr)}` : "Open Food Facts doesn't have it"}, and USDA ${usdaErr ? why(usdaErr) : "doesn't have it"}.` }),
          usdaErr && usdaErr.name === "RateLimit" ? el("p", { class: "muted", text: "Add your own free USDA key under Your goals to search more." }) : null];
    box.replaceChildren(...lines.filter(Boolean), el("div", { class: "chiprow", style: "margin:0" }, (offErr || usdaErr) && !offline ? retry : null, byName));
  }
  // USDA Branded Foods by UPC: the search only matches the exact digits stored, so try each likely form.
  async function usdaByUpc(code) {
    const key = (profile.usdaKey || "").trim() || "DEMO_KEY";
    for (const q of S.usdaUpcQueries(code)) {
      const res = await withTimeout(fetch(S.usdaUpcUrl(q, key)), LOOKUP_MS);
      if (res.status === 429) throw Object.assign(new Error("rate"), { name: "RateLimit" });
      if (!res.ok) throw Object.assign(new Error("http"), { name: "HttpError", status: res.status });
      const hit = S.matchUpc((await res.json()).foods, code);
      if (hit) return S.fromUsda(hit);
    }
    return null;
  }

  // Camera scanning with the bundled html5-qrcode library, loaded only when needed.
  // Every step has a way out: no camera API, a denied or unanswered permission prompt, a busy camera, or a
  // scanner script that won't load all end in a clear message with the typed-barcode box focused.
  let scanner = null, scanTry = 0;
  function loadScript(src) {
    return new Promise((ok, fail) => { if (window.Html5Qrcode) return ok(); const s = el("script", { src }); s.onload = ok; s.onerror = () => fail(Object.assign(new Error("script"), { name: "ScriptError" })); document.head.append(s); });
  }
  // html5-qrcode sometimes rejects with a plain string ("… NotAllowedError: Permission denied"), so read the name from either.
  const CAMERA_ERRORS = /(NotAllowedError|PermissionDeniedError|SecurityError|NotFoundError|DevicesNotFoundError|OverconstrainedError|NotReadableError|TrackStartError|AbortError)/;
  const errName = e => (e && e.name && e.name !== "Error" ? e.name : (String(e && (e.message || e)).match(CAMERA_ERRORS) || [])[1]);
  function cameraMessage(e) {
    switch (errName(e)) {
      case "NoCameraApi": return "This browser can't use the camera here (it needs a secure https page). Type the barcode number below.";
      case "NotAllowedError": case "PermissionDeniedError": case "SecurityError": return "Camera access is blocked for this site. Allow it in your browser's site settings (the icon left of the address), then tap Scan barcode again. Or type the number below.";
      case "NotFoundError": case "OverconstrainedError": case "DevicesNotFoundError": return "No camera was found on this device. Type the barcode number below.";
      case "NotReadableError": case "TrackStartError": case "AbortError": return "The camera is in use by another app or tab. Close it and tap Scan barcode again, or type the number below.";
      case "TimeoutError": return "The camera didn't start. Tap Scan barcode to try again, or type the number below.";
      case "ScriptError": return "The scanner couldn't load (are you offline?). Type the barcode number below.";
      default: return "The camera couldn't start. Type the barcode number below.";
    }
  }
  function scanFailed(e) {
    scanTry++;
    $("scanMsg").textContent = cameraMessage(e);
    $("scanBtn").removeAttribute("aria-busy");
    const s = scanner; scanner = null;
    try { if (s) { if (s.isScanning) s.stop().catch(() => {}); s.clear(); } } catch {}
    $("code").focus();
  }
  const CAMERA_WAIT_MS = CFG.cameraWaitMs || 3000, START_MS = CFG.cameraStartMs || 15000;
  const stopStream = st => { try { (st && st.getTracks ? st.getTracks() : []).forEach(t => t.stop()); } catch {} };
  async function openScan() {
    const attempt = ++scanTry;
    $("scan").hidden = false; $("scanMsg").textContent = "Starting the camera…";
    $("scanBtn").setAttribute("aria-busy", "true");
    $("code").focus();
    if (!window.isSecureContext || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return scanFailed({ name: "NoCameraApi" });
    // Already blocked for this site: say so now instead of waiting on a prompt that won't appear.
    try { const st = navigator.permissions && await navigator.permissions.query({ name: "camera" }); if (st && st.state === "denied") return scanFailed({ name: "NotAllowedError" }); } catch {}
    if (attempt !== scanTry) return;
    // While the browser's permission prompt is up, explain what we're waiting for.
    const waiting = setTimeout(() => { if (attempt === scanTry) $("scanMsg").textContent = "Waiting for camera permission. Allow it in your browser, or type the number below."; }, CAMERA_WAIT_MS);
    try {
      // Ask for the camera ourselves first, so the browser's own error (NotAllowedError, NotFoundError,
      // NotReadableError) comes back intact, and the wait for the prompt isn't cut short.
      const gum = navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      gum.then(st => { if (attempt !== scanTry) stopStream(st); }, () => {}); // answered after we gave up: release it
      stopStream(await withTimeout(gum, CAMERA_MS));
      clearTimeout(waiting);
      if (attempt !== scanTry) return;
      $("scanMsg").textContent = "Starting the camera…";
      await withTimeout((async () => {
        await loadScript("vendor/html5-qrcode.min.js");
        const lib = window.__Html5QrcodeLibrary__ || {};
        const F = window.Html5QrcodeSupportedFormats || lib.Html5QrcodeSupportedFormats;
        const Scanner = window.Html5Qrcode || lib.Html5Qrcode;
        // Decoding uses the browser's BarcodeDetector when it has one, and the bundled ZXing decoder otherwise
        // (desktop Chrome on Windows/Linux, Firefox, older Safari).
        const sc = new Scanner("reader", { verbose: false, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
        scanner = sc;
        await sc.start({ facingMode: "environment" }, { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.95), height: Math.floor(Math.max(h * 0.6, Math.min(h, 120))) }) },
          async decoded => { await closeScan(); barcodeLookup(decoded); }, () => {});
        // Started after we gave up (timeout) or the panel was closed: turn the camera back off.
        if (attempt !== scanTry) { try { await sc.stop(); sc.clear(); } catch {} }
      })(), START_MS);
      if (attempt !== scanTry) return; // closed or restarted meanwhile
      $("scanBtn").removeAttribute("aria-busy");
      $("scanMsg").textContent = "Point your camera at the barcode and move closer until it fills the box.";
    } catch (e) {
      clearTimeout(waiting);
      if (attempt === scanTry) scanFailed(e);
    }
  }
  async function closeScan() {
    scanTry++;
    try { if (scanner) { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } } catch {}
    scanner = null; $("scan").hidden = true; $("scanBtn").removeAttribute("aria-busy");
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
    // A field showing an error keeps what the user typed until they fix it; only valid fields are refreshed.
    for (const [k, id] of Object.entries(PF)) if ($(id).getAttribute("aria-invalid") !== "true") $(id).value = profile[k];
    $("p-skip").value = profile.skip || ""; $("p-mild").checked = !!profile.mild; $("p-usda").value = profile.usdaKey || "";
    $("profSummary").textContent = `${profile.cal.toLocaleString("en-US")} cal · ${profile.pro} g protein · ≤${profile.sat} g sat fat`;
  }
  function readProfile() {
    // Only valid numbers are saved; an invalid field keeps its last good value and shows why next to it.
    for (const [k, id] of Object.entries(PF)) if (checkGoal($(id))) profile[k] = Number($(id).value);
    profile.skip = $("p-skip").value; profile.mild = $("p-mild").checked; profile.usdaKey = $("p-usda").value.trim();
    store.set("profile", profile); syncProfileUI(); renderBrowse(); renderChips(); renderList(); renderPlate();
    if (current) renderResult(current);
  }

  // ---------- shared links ----------
  // #avocado opens a built-in food; #usda-171705 and #off-3017620422003 open looked-up foods, fetching them
  // again when this browser hasn't seen them. Returns true when the hash names something to open.
  function openFromHash(hash, first) {
    const link = S.parseLinkId(hash);
    if (!link) return false;
    const already = f => current && f.n === current.n;
    if (link.kind === "slug") {
      const foods = allFoods();
      const f = foods.find(x => V.slug(x.n) === link.slug) || foods.find(x => V.legacySlug(x.n) === link.slug);
      if (f) {
        if (V.slug(f.n) !== link.slug) { try { history.replaceState(null, "", "#" + V.slug(f.n)); } catch {} } // old #jalape-o → #jalapeno
        if (!already(f)) pick(f, { noHash: true, noRecent: first });
        return true;
      }
      // No food has this exact link. Never open a different food silently: label a close match, or say it wasn't found.
      const text = link.slug.replace(/-+/g, " ").trim();
      const r = Q.resolve(text, foods);
      if (r.kind === "open" || r.kind === "closest") pick(r.food, { closest: text, fromLink: link.slug, noHash: true, noRecent: true });
      else offerLookup(text, r.near, r.typo, link.slug);
      return true;
    }
    const cached = lookups.find(x => link.kind === "usda" ? x.src === "usda" && x.fdcId === link.id : x.src === "off" && x.code === link.code);
    if (cached) { if (!already(cached)) pick(cached, { noHash: true, noRecent: first }); return true; }
    if (link.kind === "off") { barcodeLookup(link.code); return true; }
    usdaById(link.id);
    return true;
  }
  async function usdaById(id) {
    const box = el("div", { class: "notice" }); $("out").replaceChildren(box);
    busy(box, `Loading USDA food ${id}…`);
    try {
      const res = await withTimeout(fetch(S.usdaFoodUrl(id, (profile.usdaKey || "").trim())), LOOKUP_MS);
      if (res.status === 404) throw Object.assign(new Error("missing"), { name: "NotFound" });
      if (!res.ok) throw Object.assign(new Error("http"), { name: "HttpError", status: res.status });
      const f = S.fromUsda(await res.json());
      saveLookup(f); pick(f, { noHash: true });
    } catch (e) {
      box.replaceChildren(el("p", { text: e.name === "NotFound" ? `USDA has no food with id ${id}.` : e.status === 429 ? "The shared USDA key is out of searches for now. Add your own free key under Your goals, or try later." : "Couldn't load that USDA food. Check your connection and try again." }),
        el("button", { class: "btn small ghost", type: "button", text: "Try again", onclick: () => usdaById(id) }));
    }
  }

  // ---------- goal inputs: inline validation ----------
  // One state only: an invalid value stays in the field, marked, with a message saying what's still in use.
  // Nothing is saved until it's fixed. Every goal field reserves a line for the message, so the row never shifts.
  const goalKey = input => Object.keys(PF).find(k => PF[k] === input.id);
  function checkGoal(input) {
    const raw = input.value.trim(), v = Number(raw), min = Number(input.min), max = Number(input.max);
    const fmtN = n => n.toLocaleString("en-US");
    const problem = raw === "" ? `Enter a number from ${fmtN(min)} to ${fmtN(max)}.`
      : !Number.isFinite(v) ? "That isn't a number."
      : v < min || v > max ? `Use a number from ${fmtN(min)} to ${fmtN(max)}.` : "";
    const k = goalKey(input);
    const msg = problem && k ? `${problem} Still using ${fmtN(profile[k])}.` : problem;
    let err = input.parentElement.querySelector(".err");
    if (!err) { err = el("span", { class: "err", id: input.id + "-err", "aria-live": "polite" }); input.after(err); }
    err.textContent = msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) input.setAttribute("aria-describedby", err.id); else input.removeAttribute("aria-describedby");
    return !msg;
  }

  // ---------- boot ----------
  function init() {
    updateCount();
    if (!PAGES) document.querySelectorAll("[data-pages-only]").forEach(n => n.remove());
    if (PAGES) $("q").placeholder = "Try avocado, or a product like great value whole milk";
    $("scanBtn").hidden = !PAGES; $("usdaKeyWrap").hidden = !PAGES;

    attachSuggest($("q"), $("suggest"), f => pick(f), PAGES ? text => ({ label: `Search packaged products for “${text}”`, run: () => openPackaged(text) }) : null);
    $("shelf").addEventListener("scroll", shelfFade, { passive: true });
    window.addEventListener("resize", shelfFade);
    $("form").addEventListener("submit", e => {
      e.preventDefault();
      const text = $("q").value.trim(); if (!text) return;
      $("suggest").hidden = true;
      if (/^\d{8,14}$/.test(text) && PAGES) return barcodeLookup(text);
      // "great value whole milk", "marketside caesar kit": a store brand means a packaged product.
      if (PAGES && S.storeBrand(text) && !allFoods().some(f => Q.isExact(f, text))) return openPackaged(text);
      const r = Q.resolve(text, allFoods());
      if (r.kind === "open") return pick(r.food);
      if (r.kind === "closest") return pick(r.food, { closest: text });
      offerLookup(text, r.near, r.typo);
    });
    $("scanBtn").addEventListener("click", () => ($("scan").hidden ? openScan() : closeScan()));
    $("scanClose").addEventListener("click", closeScan);
    $("codeForm").addEventListener("submit", async e => { e.preventDefault(); const c = $("code").value; await closeScan(); barcodeLookup(c); });

    document.querySelectorAll("#profile input").forEach(i => i.addEventListener("change", readProfile));
    Object.values(PF).forEach(id => $(id).addEventListener("input", () => checkGoal($(id))));
    syncProfileUI();
    Object.values(PF).forEach(id => checkGoal($(id))); // creates each field's (empty) message line
    if (!savedProfile && !CFG.profile) $("profile").open = true;
    renderChips(); renderBrowse(); renderList(); renderPlate(); renderQuiz();
    $("learnReset").addEventListener("click", () => { learn = { asked: 0, correct: 0, streak: 0, missed: [] }; store.set("learn", learn); quizQ = null; renderQuiz(); });
    $("browse").addEventListener("toggle", () => { if ($("browse").open) renderBrowse(); });
    $("glistCopy").addEventListener("click", copyList);
    $("glistClear").addEventListener("click", () => { glist = glist.filter(x => !x.done); saveList(); });
    $("glistFavs").addEventListener("click", addGoodFavorites);
    $("plateView").addEventListener("click", showPlate);
    $("plateClear").addEventListener("click", () => { plate = []; afterPlateChange(); });

    const opened = PAGES && openFromHash(location.hash, true);
    if (!opened) pick((recents.length && byName(recents[0])) || FOODS[0], { noHash: true, noRecent: true });
    if (PAGES) window.addEventListener("hashchange", () => openFromHash(location.hash, false));

    if (PAGES && "serviceWorker" in navigator && location.protocol === "https:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }
  init();
})();
