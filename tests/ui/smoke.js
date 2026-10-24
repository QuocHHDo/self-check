// End-to-end UI test: loads the real page in jsdom, clicks through every feature, and mocks the
// USDA, Open Food Facts and Claude APIs. Run with `npm run test:ui` (needs `npm install` for jsdom and axe-core).
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const REPO = path.join(__dirname, "..", ".."), MODE = process.argv[2] || "pages";
const read = p => fs.readFileSync(path.join(REPO, p), "utf8");
const usdaFixture = JSON.parse(read("tests/fixtures/usda-search.json"));

let html = read("index.html").replace(/<script src="[^"]+"><\/script>/g, "").replace(/<link [^>]*>/g, "");
html = html.replace('window.SELF_CHECK_CONFIG = { mode: "pages" };', MODE === "claude"
  ? 'window.SELF_CHECK_CONFIG = { mode: "claude", profile: { cal: 1850, pro: 140, sat: 13, na: 2300, add: 36, fib: 30, skip: "hummus", mild: true } };'
  : 'window.SELF_CHECK_CONFIG = { mode: "pages" };');
const errors = [];
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://quochhdo.github.io/self-check/", pretendToBeVisual: true });
const w = dom.window;
w.console.error = (...a) => errors.push(a.join(" "));
w.addEventListener("error", e => errors.push(String(e.message)));
w.HTMLElement.prototype.scrollIntoView = () => {};
w.fetch = async url => {
  url = String(url);
  if (url.includes("api.nal.usda.gov")) return { ok: true, status: 200, json: async () => usdaFixture };
  if (url.includes("openfoodfacts.org")) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: "Protein Bar Chocolate", brands: "TestCo", serving_size: "1 bar (60 g)",
    nutriments: { "energy-kcal_serving": 200, "fat_serving": 7, "saturated-fat_serving": 3, "carbohydrates_serving": 22, "sugars_serving": 2, "fiber_serving": 9, "proteins_serving": 20, "sodium_serving": 0.2 } } }) };
  throw new Error("unexpected fetch " + url);
};
if (MODE === "claude") w.claude = { use: async name => name === "sample" ? Object.assign(async () => ({ text: "" }), { json: async () => ({ found: true, name: "Dragon Fruit", serving: "1 cup (227 g)", cal: 136, fat: 0, sat: 0, trans: 0, chol: 0, na: 0, carb: 29, fib: 7, sug: 18, add: 0, pro: 3, spicy: false, processedMeat: false }) }) : null };
const cfg = (html.match(/<script>(window\.SELF_CHECK_CONFIG[^<]*)<\/script>/) || [])[1];
if (!cfg) throw new Error("config script not found");
w.eval(cfg);
for (const [, f] of read("index.html").matchAll(/<script src="([^"]+)"><\/script>/g)) w.eval(read(f));

const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
const text = s => ($(s) || {}).textContent || "";
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const type = (sel, v) => { const i = $(sel); i.value = v; i.dispatchEvent(new w.Event("input", { bubbles: true })); };
const submit = sel => $(sel).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const btn = (label, root = w.document) => [...root.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(label));

(async () => {
  ok(text("#out h2") === "Avocado", `opens on a real food (${text("#out h2")})`);
  ok(/\d+ common foods/.test(text("#foodCount")), "shows the food count");
  ok($("#scanBtn").hidden === (MODE !== "pages"), `scan button ${MODE === "pages" ? "shown" : "hidden"}`);

  type("#q", "80/20"); ok($$("#suggest li").length > 0, "typing shows suggestions");
  $("#q").value = "Ground beef 80/20"; submit("#form");
  ok(text("#out h2") === "Ground beef 80/20" && text(".tag .verdict") === "Limit it", "exact search shows result and verdict");
  $("#q").value = "chiken brest"; submit("#form");
  ok(/Did you mean/.test(text("#out")) && $$("#out .notice .chip").some(b => b.textContent === "Chicken breast, grilled"), `typo offers Did you mean (${text("#out .notice")})`);
  $("#q").value = "kirkland protein bar"; submit("#form");
  ok(text("#out h2") === "Protein bar" && /Showing closest match/.test(text("#out .notice.closest")), `loose match is labeled as closest (${text("#out .notice.closest")})`);
  ok(MODE !== "pages" || /Search USDA for “kirkland protein bar” instead/.test(text("#out .notice.closest")), "closest match offers the full search");
  $("#q").value = "Ground beef 80/20"; submit("#form");
  ok(!$("#out .notice.closest"), "exact match has no closest-match banner");
  const swaps = $$(".swap .sn").map(e => e.textContent);
  const swapWords = $$(".swap .vp").map(e => e.textContent), RANKW = { "Get it": 2, "In moderation": 1 };
  ok(swaps.some(n => /93\/7/.test(n)) && swapWords.every((v, i) => !i || RANKW[swapWords[i - 1]] >= RANKW[v]), `swaps include 93/7 and list Get it first (${swaps.map((n, i) => n + ": " + swapWords[i]).join(", ")})`);
  ok(/(more protein|less saturated fat).* per 100 calories/.test(text(".swap .sd")), `swap explains the difference per 100 calories (${text(".swap .sd")})`);

  click(btn("2", $(".serving")));
  ok(text(".label .cal .v") === String(Math.round(287 * 2)), `2 servings doubles calories (${text(".label .cal .v")})`);
  ok(/verdict is for one standard serving/.test(text(".tag")), "explains verdict basis when scaled");

  click($$(".label [data-k]").find(r => r.dataset.k === "sat"));
  ok(/Saturated fat/.test(text(".explain")), "tapping a label line explains it");

  type("#cmpq", "chicken breast");
  const li = $(".compare .suggest li"); ok(!!li, "compare search suggests foods");
  li.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  ok($$(".ctable tbody tr").length === 10 && $$(".ctable td.win").length > 0, "compare table renders with winners marked");

  const firstSwap = w.SelfCheckData.FOODS.find(f => f.n === swaps[0]);
  click($$(".swap")[0]);
  ok(text("#out h2") === firstSwap.n, "clicking a swap opens it");
  ok(text(".label .cal .v") === String(Math.round(firstSwap.cal)), "serving resets to 1 on a new food");

  click(btn("Save", $("#out")));
  ok(!$("#favRow").hidden && text("#favRow").includes(firstSwap.n.split(",")[0]), `saving adds a favorite chip (${text("#favRow")})`);
  ok(!$("#recentRow").hidden || text("#favRow").includes(firstSwap.n), "recents/favorites rows render");

  $("#browse").open = true; await tick(5);
  click(btn("Seafood", $("#cats")));
  ok($$("#blist .bitem").length === w.SelfCheckData.FOODS.filter(f => f.c === "seafood").length, `browse filters by category (${$$("#blist .bitem").length})`);
  click(btn("All", $("#cats"))); click(btn("Least healthy first", $("#bsort")));
  const first = $("#blist .bitem"), firstScore = Number(first.querySelector(".score").textContent);
  ok(/^1\./.test(first.textContent) && firstScore <= -4 && !$("#bsortNote").hidden, `least-healthy sort ranks with scores (${first.textContent})`);
  click(btn("Healthiest first", $("#bsort")));
  ok(Number($("#blist .bitem .score").textContent) >= 3, `healthiest sort puts high scores first (${$("#blist .bitem").textContent})`);
  click(btn("A–Z", $("#bsort")));
  ok(!$("#blist .bitem .score") && $("#bsortNote").hidden, "A–Z hides scores");
  $("#q").value = "boba"; submit("#form");
  ok(text("#out h2") === "Bubble milk tea, regular sugar" && text(".tag .verdict") === "Limit it", `boba search finds bubble tea (${text("#out h2")})`);

  $("#q").value = "durian"; submit("#form");
  if (MODE === "pages") {
    ok(/isn't in the built-in list/.test(text("#out")), "unknown food offers a lookup");
    click(btn("Search USDA", $("#out"))); await tick(10);
    ok($$("#out .results button").length === 3, "USDA results listed");
    click($$("#out .results button")[0]);
    ok(/From USDA/.test(text(".src")) && text("#out h2").startsWith("Avocados"), "picking a USDA result shows it with its source");
    $("#q").value = "0123456789012"; submit("#form"); await tick(10);
    ok(text("#out h2") === "TestCo Protein Bar Chocolate" && /Open Food Facts/.test(text(".src")), `barcode lookup shows the product (${text("#out h2")})`);
    ok(text(".label .serv span:last-child") === "1 bar (60 g)", "barcode product uses per-serving values");
    w.location.hash = "#salmon"; w.dispatchEvent(new w.HashChangeEvent("hashchange")); await tick(5);
    ok(text("#out h2") === "Salmon", "#salmon link opens Salmon");
  } else {
    await tick(20);
    $("#q").value = "durian"; submit("#form");
    click(btn("Look up", $("#out"))); await tick(20);
    ok(text("#out h2") === "Dragon Fruit" && /Looked up by Claude/.test(text(".src")), `Claude lookup shows result (${text("#out h2")})`);
    $("#q").value = "Hummus"; submit("#form");
    ok(text(".tag .verdict") === "Skip", "personal skip list applies in Claude version");
  }
  // grocery list + plate + basis + quiz
  $("#q").value = "Chicken breast, grilled"; submit("#form");
  click(btn("Add to list", $("#out")));
  ok(/1 to buy/.test(text("#glistCount")) && /Chicken breast/.test(text("#glistItems")), `add to list (${text("#glistCount")})`);
  const cb = $("#glistItems input[type=checkbox]"); cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok(/1 done/.test(text("#glistCount")), "checking off an item");
  click(btn("Clear checked", $("#glistBox")));
  ok(/empty/.test(text("#glistCount")), "clear checked");
  click(btn("2", $(".serving"))); click(btn("Add 2 to plate", $("#out")));
  $("#q").value = "Brown rice"; submit("#form"); click(btn("Add 1 to plate", $("#out")));
  ok(/2 items/.test(text("#plateCount")), `plate has two items (${text("#plateCount")})`);
  click($("#plateView"));
  ok(text("#out h2") === "Your plate" && /whole meal/.test(text(".tag")) && Number(text(".label .cal .v")) === Math.round(187 * 2 + 218), `plate verdict with summed calories (${text(".label .cal .v")})`);
  ok(!$("#out .swap") && !$("#cmpq"), "plate view hides swaps and compare");
  const sel = $("#plateItems select"); sel.value = "1"; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok(Number(text(".label .cal .v")) === Math.round(187 + 218), "changing plate servings updates the plate view");
  $("#q").value = "Ground beef 80/20"; submit("#form");
  type("#cmpq", "Ground beef 93/7"); $(".compare .suggest li").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  click(btn("Per 100 calories", $(".compare")));
  ok(/Per 100 calories/.test(text(".ctable thead")) && /100 calories/.test(text(".ctable thead .sv")), "compare per 100 calories");
  click(btn("Least healthy first", $("#bsort"))); click(btn("Per 100 calories", $("#bbasis")));
  ok(!$("#bbasis").hidden && /nutrient density/.test(text("#bsortNote")), "browse per-100-calorie basis");
  click(btn("A–Z", $("#bsort")));
  ok($("#bbasis").hidden, "basis hidden for A–Z");
  click(btn("Start", $("#quiz")));
  const optsBefore = $$("#quiz .qopt").length;
  ok(optsBefore >= 2 && text("#quiz .qprompt").length > 10, `quiz shows a question (${text("#quiz .qprompt")})`);
  click($$("#quiz .qopt")[0]);
  ok(/Correct\.|Not quite/.test(text("#quiz .qres")) && /right/.test(text("#learnScore")), `answering scores it (${text("#learnScore")})`);
  click($("#quizNext"));
  ok($$("#quiz .qopt.right").length === 0, "next question resets");
  // Check text nodes one by one: a stray "null" node next to other text doesn't have word boundaries in textContent.
  const nullText = (root = w.document.body) => [root, ...root.querySelectorAll("*")].some(e => [...e.childNodes].some(n => n.nodeType === 3 && /^\s*(null|undefined)\s*$|\bnull\b|\bundefined\b/.test(n.textContent)));
  ok(!nullText(w.document.getElementById("quiz")), "quiz never renders the text null");
  ok(!nullText(), "no null or undefined text anywhere on the page");
  ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
})();
