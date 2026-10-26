// Copies the shared app code into extension/lib (Chrome can't load files from outside the extension's folder).
//   node scripts/sync-extension.mjs
// tests/extension.test.js fails when a copy is out of date.
import fs from "node:fs";
import path from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
export const LIB = ["foods.js", "additives-data.js", "additive-notes.js", "additives.js", "ingredients.js", "supplement.js", "verdict.js", "sources.js", "search.js", "walmart.js", "backup.js", "card.js"];
for (const f of LIB) fs.copyFileSync(path.join(ROOT, "js", f), path.join(ROOT, "extension/lib", f));
console.log(`Copied ${LIB.length} files to extension/lib`);
