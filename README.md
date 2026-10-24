# Should I Buy It?

Search or scan a food and see its nutrition label plus a verdict for *your* goals: **Get it**, **In moderation**, **Limit it**, or **Skip**. Every verdict comes with the reasons behind it, so using the app teaches the handful of principles (saturated fat, protein per calorie, fiber, sodium, added sugar) that explain most food choices.

Live at **https://quochhdo.github.io/self-check/**. It installs to your phone's home screen and works offline.

## Features

- **394 built-in foods** across 13 categories, with search, aliases, and browse-by-category sorted A–Z, least healthy first, or healthiest first.
- **Nutrition label** in FDA format; tap any line to see what it means and how it compares with your daily target.
- **Personal verdict** scored against your calorie, protein, saturated fat, sodium, added sugar and fiber goals, plus a skip list and a mild-food preference.
- **Healthier swaps** for anything that isn't a "Get it," with the difference spelled out (e.g. "5.3 g less saturated fat").
- **Compare two foods** side by side, with the better amount for your goals highlighted.
- **Serving size** control (½× to 3×) that updates the label and daily-share bars.
- **Favorites, recent searches, and shareable links** (`#salmon` opens Salmon).
- **USDA search** for foods that aren't built in (USDA FoodData Central; add your own free API key under Your goals for more than a few searches an hour).
- **Barcode scanning** with the camera or by typing the number, looked up in Open Food Facts for exact branded-product labels.
- **Installable and offline**: a service worker caches the app and food data.

Everything runs in the browser. Goals, favorites and lookups are saved in your browser's local storage; there is no account and no server.

## Project layout

```
index.html            page markup and styles
js/foods.js           built-in food data (approximate typical values per serving)
js/verdict.js         scoring rules, label explanations, serving scaling, swaps (pure functions)
js/sources.js         USDA and Open Food Facts → food conversions (pure functions)
js/app.js             UI
sw.js, manifest.webmanifest, icons/   offline + install support
vendor/html5-qrcode.min.js            barcode scanner (Apache-2.0), loaded only when scanning
tests/                node:test suites + verdict snapshot
eval/compare-usda.mjs accuracy eval against USDA
scripts/build-single.mjs              single-file build for hosts that serve one HTML file
```

## Development

No dependencies or build step. Open `index.html` through any static server (the service worker and camera need `https` or `localhost`).

```sh
npm test            # data integrity, verdict rules, swaps, API conversions, eval helpers
npm run snapshot    # after an intentional rule or data change: rewrite tests/verdict-snapshot.json, then review the diff
```

Tests run on every push via GitHub Actions.

## Accuracy eval

The built-in values were written by Claude from general nutrition knowledge, not copied from a database. `eval/compare-usda.mjs` measures how far off they are: for each food it finds the matching USDA record, scales it to the serving's gram weight, and reports the error per nutrient and whether the verdict would change with USDA's numbers.

```sh
USDA_API_KEY=your_key npm run eval        # writes eval/report.md
USDA_API_KEY=your_key npm run eval beef   # only foods matching "beef"
```

Or run the **USDA accuracy eval** workflow from the Actions tab after adding a `USDA_API_KEY` repository secret. When USDA's top search result is the wrong food, pin the right record in `eval/usda-map.json` (`{ "Food name": fdcId }`).

## Caveats

Values are approximate and vary by brand; the package label wins. Open Food Facts is crowd-sourced and can be incomplete. The scoring thresholds are rules of thumb, not a clinical standard. General nutrition guidance, not medical advice.
