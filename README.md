# Should I Buy It?

Search or scan a food and see its nutrition label plus a verdict for *your* goals: **Get it**, **In moderation**, **Limit it**, or **Skip**. Every verdict comes with the reasons behind it, so using the app teaches the handful of principles (saturated fat, protein per calorie, fiber, sodium, added sugar) that explain most food choices.

Live at **https://quochhdo.github.io/self-check/**. It installs to your phone's home screen and works offline.

## Features

- **449 built-in foods** across 13 categories, with search and aliases ("boba", "EVOO", "hamburger").
- **Nutrition label** in FDA format; tap any line to see what it means and how it compares with your daily target.
- **Personal verdict** scored against your calorie, protein, saturated fat, sodium, added sugar and fiber goals, plus a skip list and a mild-food preference.
- **Healthier swaps** for anything below "Get it," with the difference spelled out ("5.3 g less saturated fat").
- **Compare two foods** side by side, per serving or per 100 calories.
- **Browse** by category, sorted A–Z, least healthy first or healthiest first, per serving or per 100 calories.
- **Plate builder**: combine foods at your servings into one meal with a total label and verdict.
- **Grocery list** with check-off, copy, and "add my Get-it favorites."
- **Learn mode**: a quiz built from the app's own data; missed questions come back after 3, 8, then 20 questions.
- **Serving size** control (½× to 3×), **favorites**, **recent searches**, and **shareable links** (`#salmon`).
- **Lookups beyond the built-in list**: USDA search and barcode scanning via Open Food Facts on the web version; a Claude lookup in the Claude version.
- **Installable and offline** via a service worker.

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
npm test            # 38 unit tests: data integrity, verdict rules, swaps, API conversions, quiz, evals (no dependencies)
npm install && npm run test:ui   # click-through test of every feature in both versions + axe accessibility check
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

**Status:** neither eval has been run yet; results will be added here.

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
