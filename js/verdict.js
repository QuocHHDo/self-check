// Scoring rules, label-line explanations, serving scaling and swap suggestions.
// Pure functions: no DOM, so the same file runs in the browser and in Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.SelfCheckVerdict = api;
})(typeof self !== "undefined" ? self : this, function () {
  const fmt = n => (Math.round(n * 10) / 10).toString();
  const NUM_KEYS = ["cal", "fat", "sat", "trans", "chol", "na", "carb", "fib", "sug", "add", "pro"];
  const RANK = { bad: 0, mid: 1, good: 2 };

  // A small, deliberately short list of foods whose benefits are well established by research but invisible on
  // the label (polyphenols, omega-3 types, long-term outcome trials). Each gets +1 and says why. Keep this list
  // short and evidence-based so the scoring stays label-driven and predictable.
  const FISH = "Strong research beyond the label: fatty fish supply the omega-3 fats EPA and DHA, and heart health groups recommend about two servings a week.";
  const NUTS = "Strong research beyond the label: people who eat nuts regularly have lower rates of heart disease in large studies, and nuts were a key food in the PREDIMED trial.";
  const EVIDENCE = {
    "Extra virgin olive oil": "Strong research beyond the label: extra virgin olive oil keeps polyphenols that refining removes, and in large trials like PREDIMED it was linked to fewer heart attacks and strokes. That puts it ahead of other oils.",
    "Salmon": FISH, "Salmon, canned": FISH, "Sardines, canned": FISH, "Trout": FISH,
    "Almonds": NUTS, "Walnuts": NUTS, "Pistachios": NUTS, "Mixed nuts": NUTS,
  };

  // Notes that don't change the score: context the label can't show.
  const ERYTHRITOL = "Most of these products are largely erythritol. A 2023 study linked high blood levels of erythritol to more heart attacks and strokes; it was observational and needs confirming, but it's a reason not to rely on large amounts.";
  const NOTES = {
    "Monk fruit sweetener": "Pure monk fruit extract is very sweet, so most packaged versions are mostly erythritol; check the ingredients. " + ERYTHRITOL.replace("Most of these products are largely erythritol. ", ""),
    "Stevia sweetener": "Packet stevia (like Truvia) is mostly erythritol. " + ERYTHRITOL.replace("Most of these products are largely erythritol. ", ""),
    "Erythritol": ERYTHRITOL.replace("Most of these products are largely erythritol. ", ""),
    "Allulose": "Allulose is a rare sugar that barely affects blood sugar; the FDA lets labels leave it out of sugar and added-sugar counts.",
    "Coconut sugar": "Coconut sugar is still sugar: it counts as added sugar the same as table sugar.",
    "Table salt": "Most sodium in a typical diet comes from packaged and restaurant food, not the salt shaker.",
  };

  // Generic starting goals (roughly FDA Daily Values on a 2,000-calorie diet).
  const DEFAULT_PROFILE = { cal: 2000, pro: 100, sat: 20, na: 2300, add: 50, fib: 28, skip: "", mild: false };

  function skipReason(f, p) {
    const lname = f.n.toLowerCase();
    const list = String(p.skip || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const hit = list.find(s => lname.includes(s) || (f.a || []).some(a => a.toLowerCase().includes(s)));
    if (hit) return { why: `It's on your skip list (${hit}).`, note: "Nutrition is shown for reference. Edit your skip list under Your goals." };
    if (p.mild && (f.tags || []).includes("spicy")) return { why: "It's spicy, and you prefer mild food.", note: "Turn off the mild-food setting under Your goals to judge it on nutrition alone." };
    return null;
  }

  // Score one serving against the viewer's goals. Returns tier, headline and reasons.
  function assess(f, p) {
    const skip = skipReason(f, p);
    if (skip) return { tier: "skip", word: "Skip", why: skip.why, score: null, reasons: [{ k: "note", t: skip.note }] };

    let s = 0;
    const r = [];
    const pd = f.cal > 0 ? (f.pro * 4) / f.cal : 0;
    if (f.pro >= 5 && pd >= 0.4) { s += 2; r.push({ k: "pos", t: `High protein for the calories: ${fmt(f.pro)} g, about ${Math.round(f.pro / p.pro * 100)}% of your ${p.pro} g goal.` }); }
    else if (f.pro >= 5 && pd >= 0.2) { s += 1; r.push({ k: "pos", t: `Decent protein: ${fmt(f.pro)} g per serving.` }); }

    if (f.fib >= 3) { s += 2; r.push({ k: "pos", t: `Good fiber source: ${fmt(f.fib)} g keeps you full.` }); }
    else if (f.fib >= 1.5) { s += 1; r.push({ k: "pos", t: `Some fiber: ${fmt(f.fib)} g.` }); }

    if (f.cal >= 5 && f.cal <= 65 && f.fat < 3 && f.sat < 1 && f.add === 0 && f.na < 250 && f.fib >= 0.5) { s += 2; r.push({ k: "pos", t: "Lots of food volume for very few calories." }); }
    if (f.fat >= 5 && f.fat * 9 >= 0.5 * f.cal && f.sat / f.fat <= 0.25 && (f.pro >= 3 || f.fib >= 2)) { s += 1; r.push({ k: "pos", t: "Its fat is mostly the unsaturated kind, which is better for cholesterol." }); }

    const satShare = f.sat / p.sat;
    if (satShare >= 0.3) { s -= 2; r.push({ k: "neg", t: `High saturated fat: ${fmt(f.sat)} g is ${Math.round(satShare * 100)}% of your ${p.sat} g daily limit in one serving.` }); }
    else if (satShare >= 0.15) { s -= 1; r.push({ k: "neg", t: `Moderate saturated fat: ${fmt(f.sat)} g (${Math.round(satShare * 100)}% of your limit).` }); }
    if (f.trans > 0.5) { s -= 1; r.push({ k: "neg", t: `Contains ${fmt(f.trans)} g trans fat (naturally occurring in red meat and dairy).` }); }

    const naShare = f.na / p.na;
    if (naShare >= 0.35) { s -= 2; r.push({ k: "neg", t: `Very salty: ${Math.round(f.na).toLocaleString("en-US")} mg sodium is ${Math.round(naShare * 100)}% of your daily limit.` }); }
    else if (naShare >= 0.2) { s -= 1; r.push({ k: "neg", t: `Salty: ${Math.round(f.na)} mg sodium (${Math.round(naShare * 100)}% of your limit).` }); }

    const addShare = p.add > 0 ? f.add / p.add : 0;
    if (addShare >= 0.3) { s -= 2; r.push({ k: "neg", t: `High added sugar: ${fmt(f.add)} g is ${Math.round(addShare * 100)}% of your ${p.add} g daily limit.` }); }
    else if (addShare >= 0.15) { s -= 1; r.push({ k: "neg", t: `Some added sugar: ${fmt(f.add)} g (${Math.round(addShare * 100)}% of your limit).` }); }

    if (f.sug >= 25 && f.add < 10 && f.pro < 5) { s -= 1; r.push({ k: "neg", t: `${fmt(f.sug)} g of sugar in one serving. Even natural sugar adds up at this amount.` }); }
    if ((f.tags || []).includes("processed")) { s -= 2; r.push({ k: "neg", t: "Processed meat, which is linked to higher heart and cancer risk." }); }
    const isPureFat = f.fat > 0 && f.carb < 0.5 && f.pro < 0.5 && f.fat * 9 >= 0.9 * f.cal;
    const unsaturatedOil = isPureFat && f.sat / f.fat <= 0.25 && f.trans <= 0.2;
    if (unsaturatedOil) r.push({ k: "pos", t: "A cooking fat that's mostly unsaturated, which is better for cholesterol than butter, lard or coconut oil." });
    else if (f.cal >= 100 && f.pro < 2 && f.fib < 1) { s -= 1; r.push({ k: "neg", t: "Calories with little protein or fiber, so it won't keep you full." }); }
    if (f.cal >= 300 && pd < 0.15) { s -= 1; r.push({ k: "neg", t: `Calorie-heavy: ${Math.round(f.cal)} cal is ${Math.round(f.cal / p.cal * 100)}% of your day without much protein.` }); }
    if (EVIDENCE[f.n]) { s += 1; r.push({ k: "pos", t: EVIDENCE[f.n] }); }
    if (NOTES[f.n]) r.push({ k: "note", t: NOTES[f.n] });

    if (f.chol >= 150 && satShare < 0.15) r.push({ k: "note", t: `High in dietary cholesterol (${Math.round(f.chol)} mg), but low in saturated fat. For most people saturated fat raises blood cholesterol more.` });
    if (f.fat >= 10 && f.cal >= 100 && f.sat / f.fat <= 0.25) r.push({ k: "note", t: `Healthy fats are still calorie-dense: ${Math.round(f.cal)} cal per serving, so portion size matters on ${p.cal.toLocaleString("en-US")} cal a day.` });

    let tier, word, why;
    if (s >= 2) { tier = "good"; word = "Get it"; why = "A strong fit for your goals."; }
    else if (s >= -1) { tier = "mid"; word = "In moderation"; why = "Fine sometimes. See the tradeoffs below."; }
    else { tier = "bad"; word = "Limit it"; why = "Works against your goals if it's a regular buy."; }
    if (!r.length) r.push({ k: "note", t: "Nothing stands out either way." });
    return { tier, word, why, score: s, reasons: r };
  }

  // What each label line means; rules of thumb use the viewer's own goals.
  function explain(k, f, p) {
    const share = (v, t) => Math.round(v / t * 100);
    const E = {
      cal: ["Calories", "ctx", "The energy in one serving.", `Your budget is ${p.cal.toLocaleString("en-US")} a day; this serving is ${share(f.cal, p.cal)}% of it.`],
      fat: ["Total fat", "ctx", "All the fat combined. Not good or bad by itself.", "Look at saturated fat below it: that's the part that matters most."],
      sat: ["Saturated fat", "low", "The fat in fatty meat, butter, cheese and cream. It's the biggest food driver of LDL (\"bad\") cholesterol.", `Your limit is ${p.sat} g a day; this serving is ${share(f.sat, p.sat)}% of it.`],
      trans: ["Trans fat", "low", "Mostly from processed food; small amounts occur naturally in meat and dairy. It raises LDL more than any other fat.", "Keep it as close to zero as possible."],
      chol: ["Cholesterol", "ctx", "Cholesterol in the food itself, found only in animal foods.", "For most people it affects blood cholesterol much less than saturated fat does, so don't avoid eggs or shrimp for this alone."],
      na: ["Sodium", "low", "Salt. Too much raises blood pressure and makes you hold water.", `Your limit is ${p.na.toLocaleString("en-US")} mg a day; this serving is ${share(f.na, p.na)}% of it. Over 20% DV per serving is salty.`],
      carb: ["Total carbohydrate", "ctx", "Starch, sugar and fiber combined: your main fuel.", "Judge the quality by the fiber and added-sugar lines beneath it."],
      fib: ["Dietary fiber", "more", "The part of plants you don't digest. It keeps you full, steadies blood sugar and lowers LDL a little.", `Your goal is ${p.fib} g a day; 3 g or more per serving is a good source.`],
      sug: ["Total sugars", "ctx", "Natural sugar (in fruit and milk) plus added sugar.", "Natural sugar is fine in whole foods. Check the added-sugar line instead."],
      add: ["Added sugars", "low", "Sugar put in during processing: calories that don't keep you full.", `Your limit is ${p.add} g a day; this serving is ${share(f.add, p.add)}% of it.`],
      pro: ["Protein", "more", "Builds and keeps muscle, and keeps you full longer than carbs or fat.", `Your goal is ${p.pro} g a day (about ${Math.round(p.pro / 4)} g per meal over four meals); this serving is ${share(f.pro, p.pro)}% of it.`],
    };
    return E[k] || null;
  }

  // A copy of the food with every amount multiplied, for the serving-size control.
  function scale(f, m) {
    const out = { ...f, mult: m };
    for (const k of NUM_KEYS) out[k] = (f[k] || 0) * m;
    return out;
  }

  // Hand-picked swaps for common foods; the generic search fills in the rest.
  const SWAP_HINTS = {
    "Ground beef 80/20": ["Ground beef 93/7", "Ground turkey 93/7", "Chicken breast, grilled"],
    "Ground beef 85/15": ["Ground beef 93/7", "Ground turkey 93/7", "Chicken breast, grilled"],
    "Ground beef 90/10": ["Ground beef 93/7", "Ground turkey 93/7"],
    "Ground pork": ["Pork tenderloin", "Ground turkey 93/7"],
    "Ribeye steak": ["Sirloin steak, lean", "Filet mignon", "Flank steak"],
    "Beef brisket": ["Sirloin steak, lean", "Turkey breast, roasted"],
    "Bacon": ["Egg whites", "Turkey breast, roasted"],
    "Pork breakfast sausage": ["Egg whites", "Turkey breast, roasted"],
    "Deli turkey": ["Turkey breast, roasted", "Rotisserie chicken, breast meat"],
    "Deli ham": ["Turkey breast, roasted", "Rotisserie chicken, breast meat"],
    "Hot dog, beef": ["Chicken breast, grilled", "Veggie burger"],
    "Chicken nuggets, frozen": ["Chicken breast, grilled", "Rotisserie chicken, breast meat"],
    "Chicken sandwich, fried": ["Grilled chicken sandwich"],
    "Cheeseburger, fast food": ["Turkey burger patty", "Veggie burger"],
    "Yogurt, flavored low-fat": ["Greek yogurt, plain nonfat", "Skyr, plain nonfat"],
    "Greek yogurt, vanilla": ["Greek yogurt, plain nonfat", "Skyr, plain nonfat"],
    "Vanilla ice cream": ["Greek yogurt, plain nonfat", "Frozen mixed berries"],
    "Whole milk": ["Skim milk", "Soy milk, unsweetened"],
    "2% milk": ["Skim milk", "Soy milk, unsweetened"],
    "Chocolate milk, low-fat": ["Skim milk", "Protein shake, ready-to-drink"],
    "Oat milk": ["Soy milk, unsweetened", "Almond milk, unsweetened"],
    "Sour cream": ["Greek yogurt, plain nonfat"],
    "Mayonnaise": ["Greek yogurt, plain nonfat"],
    "Butter": ["Extra virgin olive oil", "Avocado oil"],
    "Coconut oil": ["Extra virgin olive oil", "Avocado oil"],
    "Ghee": ["Extra virgin olive oil", "Avocado oil"],
    "Lard": ["Extra virgin olive oil", "Avocado oil"],
    "Beef tallow": ["Extra virgin olive oil", "Avocado oil"],
    "Bacon grease": ["Extra virgin olive oil", "Avocado oil"],
    "Vegetable shortening": ["Canola oil", "Avocado oil"],
    "Palm oil": ["Canola oil", "Extra virgin olive oil"],
    "MCT oil": ["Extra virgin olive oil", "Avocado oil"],
    "Ranch dressing": ["Balsamic vinaigrette", "Salsa, mild"],
    "Caesar dressing": ["Balsamic vinaigrette", "Salsa, mild"],
    "BBQ sauce": ["Salsa, mild", "Yellow mustard"],
    "Ketchup": ["Salsa, mild"],
    "Soda": ["Sparkling water", "Diet soda"],
    "Sweet tea": ["Sparkling water", "Diet soda"],
    "Lemonade": ["Sparkling water", "Diet soda"],
    "Sports drink": ["Electrolyte drink, zero sugar"],
    "Bubble milk tea, regular sugar": ["Latte, whole milk", "Kombucha", "Sparkling water"],
    "Bubble milk tea, half sugar": ["Latte, whole milk", "Kombucha", "Sparkling water"],
    "Thai iced tea": ["Latte, whole milk", "Kombucha", "Sparkling water"],
    "Energy drink": ["Coffee, black"],
    "Orange juice": ["Orange", "Clementine"],
    "Apple juice": ["Apple", "Applesauce, unsweetened"],
    "Fruit smoothie, bottled": ["Frozen mixed berries", "Banana"],
    "Frosted cereal": ["Oatmeal, rolled oats", "Toasted oat cereal, plain", "Shredded wheat"],
    "Instant oatmeal, flavored": ["Oatmeal, rolled oats"],
    "Granola": ["Oatmeal, rolled oats", "Shredded wheat"],
    "Granola bar, chewy": ["Protein bar", "Almonds"],
    "White rice": ["Brown rice", "Quinoa"],
    "Jasmine rice": ["Brown rice", "Quinoa"],
    "Pasta": ["Whole wheat pasta"],
    "White bread": ["Pita, whole wheat", "English muffin, whole wheat"],
    "Flour tortilla": ["Corn tortillas", "Low-carb tortilla"],
    "Instant ramen": ["Soba noodles", "Beef pho"],
    "Mac and cheese, boxed": ["Whole wheat pasta"],
    "French fries": ["Potato, baked", "Sweet potato, baked"],
    "Potato chips": ["Popcorn, air-popped", "Whole grain crackers"],
    "Tortilla chips": ["Popcorn, air-popped", "Whole grain crackers"],
    "Microwave popcorn, butter": ["Popcorn, air-popped"],
    "Milk chocolate bar": ["Dark chocolate, 70%"],
    "Eggs": ["Egg whites"],
    "Pancakes": ["Oatmeal, rolled oats", "English muffin, whole wheat"],
    "French toast": ["Oatmeal, rolled oats", "English muffin, whole wheat"],
    "Frozen waffles": ["Oatmeal, rolled oats", "English muffin, whole wheat"],
    "Croissant": ["English muffin, whole wheat", "Pita, whole wheat"],
    "Bagel, plain": ["English muffin, whole wheat", "Pita, whole wheat"],
    "Blueberry muffin": ["English muffin, whole wheat", "Oatmeal, rolled oats"],
    "Glazed donut": ["English muffin, whole wheat", "Oatmeal, rolled oats"],
    "Toaster pastry": ["English muffin, whole wheat", "Oatmeal, rolled oats"],
    "Cheddar cheese": ["Cottage cheese 2%", "Mozzarella, part-skim"],
    "Honey": ["Monk fruit sweetener", "Zero-calorie sweetener"],
    "Maple syrup": ["Monk fruit sweetener", "Zero-calorie sweetener"],
    "Agave syrup": ["Monk fruit sweetener", "Zero-calorie sweetener"],
    "Soy sauce": ["Low-sodium soy sauce"],
    "Molasses": ["Monk fruit sweetener", "Coconut sugar"],
    "Spam": ["Canned chicken breast", "Tuna, canned in water"],
    "Egg bites, bacon and cheese": ["Egg whites", "Greek yogurt, plain nonfat"],
    "Pumpkin spice latte": ["Latte, whole milk", "Cold brew coffee"],
    "Iced caramel macchiato": ["Latte, whole milk", "Cold brew coffee"],
    "Cheese puffs": ["Popcorn, air-popped", "Whole grain crackers"],
    "Nacho cheese tortilla chips": ["Popcorn, air-popped", "Whole grain crackers"],
    "Pepperoni pizza, restaurant": ["Chicken taco", "Grilled chicken sandwich", "Chicken burrito bowl"],
    "Cheese pizza, restaurant": ["Chicken taco", "Grilled chicken sandwich", "Chicken burrito bowl"],
    "Frozen pepperoni pizza": ["Frozen chicken and rice bowl", "Chicken taco"],
  };

  const STOP = new Set(["canned", "frozen", "plain", "fresh", "cooked", "whole", "low", "fat", "sweetened", "unsweetened", "flavored", "with", "and", "the", "store", "fast", "food", "restaurant", "deli", "raw"]);
  const tokens = s => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w));
  const ALCOHOL = /beer|wine|liquor|hard seltzer|margarita/i;
  const LIQUID = /milk|kefir|juice|shake|smoothie|latte|coffee|tea\b|soda|water|drink|beer|wine|lemonade|kombucha|liquor|seltzer|margarita|chocolate, from mix/i;
  // Cooking fats only swap with other cooking fats.
  const pureFat = g => g.fat > 0 && g.carb < 0.5 && g.pro < 0.5 && g.fat * 9 >= 0.9 * g.cal;
  // Pantry staples that score well but aren't a real substitute for most things; only suggested when hand-picked.
  const HINT_ONLY = new Set(["Cocoa powder, unsweetened", "Table salt", "Zero-calorie sweetener", "Monk fruit sweetener", "Stevia sweetener", "Erythritol", "Allulose", "Cooking spray", "Balsamic vinegar"]);

  // Up to `max` better options for a food, ranked by hand-picked hints, then category, name overlap and similar calories.
  function findSwaps(f, foods, p, max = 3) {
    const base = assess(f, p);
    const want = base.tier === "skip" ? 0 : RANK[base.tier];
    if (base.tier === "good") return [];
    const hints = SWAP_HINTS[f.n] || [];
    const ft = new Set(tokens(f.n));
    const out = [];
    for (const g of foods) {
      if (g.n === f.n) continue;
      const hinted = hints.includes(g.n);
      if (!hinted && ALCOHOL.test(g.n) && !ALCOHOL.test(f.n)) continue;
      if (!hinted && LIQUID.test(g.n) !== LIQUID.test(f.n)) continue;
      if (!hinted && pureFat(g) !== pureFat(f)) continue;
      if (!hinted && HINT_ONLY.has(g.n)) continue;
      const a = assess(g, p);
      if (a.tier === "skip" || RANK[a.tier] <= want) continue;
      let score = 0;
      const hi = hints.indexOf(g.n);
      if (hi >= 0) score += 100 - hi;
      if (g.c && g.c === f.c) score += 20;
      score += 8 * tokens(g.n).filter(t => ft.has(t)).length;
      if (score < 20) continue;
      score -= 4 * Math.abs(Math.log((g.cal + 20) / (f.cal + 20)));
      score += a.tier === "good" ? 3 : 0;
      out.push({ food: g, verdict: a, score, hinted });
    }
    // Hand-picked swaps stand alone when any of them apply; the generic search only fills in when there are none.
    const picked = out.filter(o => o.hinted);
    return (picked.length ? picked : out).sort((x, y) => y.score - x.score).slice(0, max);
  }

  // For sorting by healthiness: the verdict score (ignoring skip list and spice preference, which aren't about
  // nutrition), then a tiebreaker for how much of the daily saturated fat, sodium and added-sugar limits one serving uses.
  // basis "kcal" scores 100 calories' worth of the food (nutrient density) instead of one serving.
  // Foods under 25 calories per serving (condiments, spices, diet drinks) keep their per-serving score:
  // scaling a teaspoon of hot sauce up to 100 calories says nothing useful.
  function health(f, p, basis = "serving") {
    const g = basis === "kcal" ? (per100kcal(f) || f) : f;
    const score = assess(g, { ...p, skip: "", mild: false }).score;
    const harm = g.sat / p.sat + g.na / p.na + (p.add > 0 ? g.add / p.add : 0) + ((g.tags || []).includes("processed") ? 0.3 : 0);
    return { score, harm, scaled: g !== f };
  }

  const KCAL_MIN = 25;
  // 100 calories' worth of a food, or null when a serving has too few calories to scale meaningfully.
  function per100kcal(f) {
    if (!(f.cal >= KCAL_MIN)) return null;
    const g = scale(f, 100 / f.cal);
    g.s = "100 calories";
    return g;
  }

  // Several foods at chosen servings, added up into one meal ("plate").
  function combine(items, name = "Your plate") {
    const out = { n: name, a: [], s: `${items.length} item${items.length === 1 ? "" : "s"}`, c: "plate", tags: [], items };
    for (const k of NUM_KEYS) out[k] = 0;
    for (const { food, mult } of items) {
      for (const k of NUM_KEYS) out[k] += (food[k] || 0) * (mult || 1);
      for (const t of food.tags || []) if (!out.tags.includes(t)) out.tags.push(t);
    }
    for (const k of NUM_KEYS) out[k] = Math.round(out[k] * 10) / 10;
    return out;
  }

  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return { DEFAULT_PROFILE, NUM_KEYS, assess, explain, scale, findSwaps, health, per100kcal, combine, KCAL_MIN, SWAP_HINTS, EVIDENCE, NOTES, slug, fmt };
});
