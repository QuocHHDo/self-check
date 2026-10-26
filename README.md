# Should I Buy It?

Search or scan a food and see its nutrition label plus a verdict for *your* goals: **Get it**, **In moderation**, **Limit it**, or **Skip**. Every verdict comes with the reasons behind it, so using the app teaches the handful of principles (saturated fat, protein per calorie, fiber, sodium, added sugar) that explain most food choices.

Live at **https://quochhdo.github.io/should-i-buy-it/**. It installs to your phone's home screen and works offline.

## Features

- **486 built-in foods** across 13 categories, with search and aliases ("boba", "EVOO", "hamburger").
- **Nutrition label** in FDA format; tap any line to see what it means and how it compares with your daily target.
- **Tab bar** for Check, Plate, List, Browse and Goals (at the bottom on phones), each with its own link (`#plate`, `#list`, `#browse`, `#goals`).
- **Personal verdict** scored against your calorie, protein, saturated fat, sodium, added sugar and fiber goals, plus a skip list and a mild-food preference.
- **Healthier swaps** for anything below "Get it," with the difference spelled out ("5.3 g less saturated fat").
- **Compare two foods** side by side, per serving or per 100 calories.
- **Browse** by category, sorted A–Z, least healthy first or healthiest first, per serving or per 100 calories.
- **Plate builder**: combine foods at your servings into one meal with a total label and verdict.
- **Grocery list** grouped by store section, with quantities, an estimated trip total at typical prices, a one-tap swap for "Limit it" items, check-off, copy, and "add my Get-it favorites."
- **Cheap meal ideas** (on the Plate tab): a protein, a vegetable and a grain that add up to a "Get it" meal within your budget and protein target, cheapest first, from foods with a typical price.
- **Backup and transfer** (on the Goals tab): download or copy your saved data, restore it from a file or text, or move it to another device with a transfer link. Restores are checked field by field and previewed first; your USDA key is never included.
- **Learn mode** (under Browse): a quiz built from the app's own data; missed questions come back after 3, 8, then 20 questions.
- **Serving size** control (½× to 3×), **favorites**, **recent searches**, and **shareable links** (`#salmon`).
- **Lookups beyond the built-in list**: USDA search and barcode scanning via Open Food Facts on the web version; a Claude lookup in the Claude version.
- **Installable and offline** via a service worker.

- **Phone bookmark for Walmart** (Goals tab): tap it on a Walmart product page to open its verdict here.
- **Browser extension for Walmart product pages** (`extension/`): a card with the verdict, the main reasons and any flagged additives, using your goals. See below.

Everything runs in the browser. Goals, favorites, lists and lookups live in your browser's local storage; there is no account and no server.

## How the verdict works

Each serving gets a point score from about a dozen rules measured against your goals: protein per calorie, fiber, low-calorie volume, fat quality, and saturated fat, sodium and added sugar as a share of your daily limits, plus penalties for processed meat and empty calories. A score of +2 or more is "Get it," −1 to +1 "In moderation," −2 or less "Limit it." The rules live in [`js/verdict.js`](js/verdict.js).

## Design decisions

- **The verdict is computed by code, never by a model.** Even in the Claude version, Claude only supplies label numbers; the page scores them with the same rules. The same numbers always get the same verdict, and every verdict can be traced to a rule.
- **Label-based scoring, with a short evidence list.** Labels can't show polyphenols or omega-3 types, so a handful of foods with strong outcome research (extra virgin olive oil, fatty fish, nuts) get +1 with an explanation. A test caps that list at 12 so scoring doesn't drift into opinion.
- **Cholesterol is a note, not a penalty.** For most people saturated fat drives blood cholesterol far more than dietary cholesterol, so eggs and shrimp aren't punished for it.
- **Per serving by default, per 100 calories on request.** Per serving matches how people eat; per 100 calories shows nutrient density. Foods under 25 calories per serving keep their per-serving score, since scaling a teaspoon of hot sauce to 100 calories says nothing useful.
- **Swaps are hand-picked where it matters.** A generic search (same category, similar name and calories) fills in, but it suggested beer for soda and cocoa powder for soy sauce, so common foods have curated swaps, and liquids, cooking fats and pantry staples only swap within their kind.
- **One source, two targets.** `index.html` + `js/` is the GitHub Pages app; `scripts/build-single.mjs` inlines it into the single file the Claude version needs, with personal goals passed in from outside the public repo.

## Testing

```sh
npm test            # 116 unit tests (node tests/run.js): data, verdict rules, swaps, search, API conversions, quiz, evals
node tests/verdict-dump.js > verdicts.csv   # every built-in food's verdict and reasons, for eyeballing outliers
node scripts/build-additives.mjs <openfoodfacts-server>/taxonomies   # regenerate js/additives-data.js from Open Food Facts
BLS_CONTACT=you@example.com node scripts/fetch-prices.mjs /tmp/prices && node scripts/build-prices.mjs /tmp/prices   # rebuild js/prices-data.js (the Update prices workflow does this monthly)
npm install && npm run test:ui   # click-through test of every feature in both versions + axe accessibility check
npm run test:layout # Playwright: layout at 320/375/414/1280 px, plus a real barcode decode from a fake camera
npm run snapshot    # after an intentional rule or data change: rewrite the verdict snapshot, then review the diff
```

A snapshot of every food's verdict catches unintended scoring changes. Both suites run on every push. The UI test mocks USDA, Open Food Facts and Claude responses using their documented formats. Color contrast was checked separately against WCAG AA (4.5:1) in light and dark themes.

## Accuracy evals

The built-in values were written by Claude from general nutrition knowledge, not copied from a database. Two evals measure how far off that is:

| Eval | What it measures | Run |
| --- | --- | --- |
| [`eval/compare-usda.mjs`](eval/compare-usda.mjs) | Each built-in food against its USDA FoodData Central record, scaled to the serving: error per nutrient and whether the verdict would change | `USDA_API_KEY=… npm run eval` or the **USDA accuracy eval** workflow |
| [`eval/claude-vs-usda.mjs`](eval/claude-vs-usda.mjs) | Fresh Claude lookups, using the app's exact prompt, against the same USDA records, side by side with the built-in values | `ANTHROPIC_API_KEY=… USDA_API_KEY=… npm run eval:claude` or the **Claude lookup eval** workflow |

The USDA eval also writes `eval/suggested-values.json`: confident matches that differ by more than 25%, with USDA's numbers scaled to the serving, for a person to review (raw vs cooked, brand vs generic) before updating `js/foods.js`. When USDA's top search result is the wrong food, pin the right record in `eval/usda-map.json`.

### Results: built-in values vs USDA (October 24, 2026)

In the last USDA check (before 37 foods were added), 439 of 449 foods were searched; 304 had a USDA record the matcher trusts as the same food. Within that set:

| Nutrient | Median error | Within 10% | Within 25% |
| --- | --- | --- | --- |
| Calories | 3% | 71% | 90% |
| Protein | 4% | 66% | 87% |
| Total fat | 4% | 68% | 82% |
| Saturated fat | 6% | 62% | 76% |
| Carbs | 3% | 68% | 85% |
| Fiber | 3% | 61% | 78% |
| Sugars | 5% | 58% | 76% |
| Sodium | 6% | 61% | 79% |

**Verdicts agree for 89% of foods (271 of 304)** when USDA's numbers replace the built-in ones.

A manual review of every food flagged at more than 25% off found that most gaps are not errors: about 50 were still the wrong USDA record (now caught by the matcher), and about 100 were different products (salted vs unsalted nuts, USDA survey records that assume salt or fat added in cooking, brand-specific items like jerky or protein shakes). Three were genuine errors and were corrected: roasted turkey breast (fat), molasses (sugar) and catfish (sodium).

**What the first runs taught about the eval itself.** The first run's numbers were wrong for three reasons, all since fixed and covered by tests: USDA's API intermittently rejected about half of all requests (now retried); the top search result was taken as the match, so "Broccoli" was compared with fried broccoli (now 25 candidates are ranked, with penalties for words that make it a different food and a preference for basic raw or cooked records matching the serving); and nutrients missing from a record counted as zero, so olive oil appeared to have no fat (now unknown). Some correct matches are still rejected (fig bars are filed under "Cookies") and some variant mismatches still pass (soft vs hard pretzels), so flagged foods get a human review before any data change.

The Claude lookup eval has not been run (it needs a paid API key).

## Project layout

```
index.html                 markup and styles
js/foods.js                built-in food data
js/verdict.js              scoring, explanations, swaps, per-100-calorie view, plate totals (pure)
js/sources.js              USDA, Open Food Facts and Claude conversions + the Claude prompt (pure)
js/learn.js                quiz questions and spaced repetition (pure)
js/app.js                  UI
sw.js, manifest.webmanifest, icons/   offline and install support
vendor/html5-qrcode.min.js barcode scanner (Apache-2.0), loaded only when scanning
tests/                     unit tests, fixtures, verdict snapshot; tests/ui/ click-through + accessibility
eval/                      USDA and Claude accuracy evals
scripts/build-single.mjs   single-file build
```

## Caveats

Values are approximate and vary by brand; the package label wins. Open Food Facts is crowd-sourced and can be incomplete. The scoring thresholds are rules of thumb, not a clinical standard. General nutrition guidance, not medical advice.

## Browser extension (Walmart product pages)

`extension/` is a Chrome extension (Manifest V3) that adds a verdict card to Walmart product pages (`walmart.com/ip/…`). It uses the same verdict code and foods as the site, and it's free: no server, no account.

Where the nutrition comes from, in order:
1. **The page's own Nutrition Facts panel** (Walmart's page data), for the exact product.
2. **Fresh produce and weighed items**: matched by name to the app's built-in foods ("Marketside Fresh Organic Bananas" → Banana). Their codes are produce stickers (PLUs), not real barcodes, and looking them up returns unrelated products.
3. **Otherwise the barcode** (UPC on the page) in Open Food Facts, then USDA Branded Foods.

The card starts as a small chip (the verdict and one line on why) and opens to show bars for saturated fat, sodium and added sugar against your limits, the reasons that decided it, and a better swap with a Walmart search for it. It always shows Walmart's product name; the source of the numbers is in the footer. Non-food pages get no card. Walmart changes pages without reloading, so the card follows as you browse.

More in the extension:
- **+ Add to list** on the card; a "Send to your list in the app" link (on the card and in the settings) opens the app, which shows the items and asks before adding them to the grocery list (merged, nothing replaced).
- **Walmart's own price**: the card works out the cost per serving from the page's unit price (e.g. 18.7 ¢/oz × a 170 g cup ≈ $1.12) and, for protein or fiber picks, how much you get per dollar. Items sent to the app's list, and products opened with the phone bookmark, carry that price, so the trip total uses it. Weight and volume unit prices convert; per-count prices don't.
- **Search badges** (off by default; turn on in the settings): a verdict on each product in Walmart search and category pages. Search pages don't include nutrition, so the extension opens each product page in the background: only products you scroll to, one about every 1.5 seconds, at most 40 per page, remembered for a week.
- Barcode lookups are cached for 30 days (not found: 1 day; network failures aren't cached).

Checked against 41 real Walmart products across the store (captured Oct 25, 2026; `tests/fixtures/walmart-audit.json`): 26 have Walmart's Nutrition Facts panel, 10 go to a barcode lookup, and 5 fresh-produce items are matched by name. `tests/walmart-audit.test.js` pins each one's route and verdict.

## Phone bookmark (Walmart on your phone)

Phones can't run extensions, so Goals → **Walmart on your phone** gives a bookmark to save. Tapped on a Walmart product page, it reads the page's product data and opens the app with it (`#wm=…`); the app then uses the same three routes as the extension and shows the full verdict.

**Install (Chrome, Edge or Brave on a computer):**
1. Download this repository (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick the `extension` folder.
3. Click the extension's toolbar button to set your goals, or paste a backup or transfer link from the app (Goals → Your data).

Phones: Chrome on Android and iOS doesn't run extensions.

**Permissions:** storage (your goals), Walmart pages (to show the card), and Open Food Facts and USDA (barcode lookups, without cookies). Nothing is sent anywhere else.

**For development:** `extension/lib/` holds copies of the app code; after changing `js/`, run `npm run sync:extension` (a test fails if the copies are out of date). `node tests/ui/extension.js` loads the extension in Chromium against saved Walmart page data (`tests/fixtures/walmart-pages.json`).

## About, data and license

- `about.html` explains how verdicts are decided, where each kind of data comes from and its license, what the app doesn't check (allergens, medical needs), and what's new. `privacy.html` is the privacy policy.
- Every result notes that allergens aren't checked, says whether it's using standard goals or yours, and links to a prefilled GitHub issue for reporting a wrong number or verdict.
- `icons/og.png` is the link-preview image (`node scripts/og-image.js` remakes it).
- Code: MIT License (`LICENSE`). Data keeps its own license: USDA FoodData Central and BLS are public domain; Open Food Facts data, including the additive taxonomy, is ODbL 1.0, © Open Food Facts contributors.
