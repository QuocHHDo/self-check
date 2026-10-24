// Rewrites tests/verdict-snapshot.json from the current rules and data. Review the git diff before committing.
const fs = require("node:fs");
const path = require("node:path");
const { FOODS } = require("../js/foods.js");
const V = require("../js/verdict.js");

const snap = Object.fromEntries(FOODS.map(f => [f.n, V.assess(f, V.DEFAULT_PROFILE).word]));
fs.writeFileSync(path.join(__dirname, "verdict-snapshot.json"), JSON.stringify(snap, null, 2) + "\n");
const counts = Object.values(snap).reduce((c, w) => ({ ...c, [w]: (c[w] || 0) + 1 }), {});
console.log(`Wrote ${FOODS.length} verdicts`, counts);
