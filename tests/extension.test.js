// The browser extension: its copies of the app code are current, and its manifest points at real files.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));

test("extension/lib matches js/ (run `node scripts/sync-extension.mjs` after changing app code)", () => {
  for (const f of fs.readdirSync(path.join(EXT, "lib"))) {
    assert.equal(fs.readFileSync(path.join(EXT, "lib", f), "utf8"), fs.readFileSync(path.join(ROOT, "js", f), "utf8"), `extension/lib/${f} is out of date`);
  }
});

test("every file the manifest names exists, in a load order that works", () => {
  const files = [manifest.background.service_worker, manifest.options_page, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(c => c.js)];
  for (const f of files) assert.ok(fs.existsSync(path.join(EXT, f)), f);
  const js = manifest.content_scripts[0].js;
  for (const [dep, user] of [["lib/verdict.js", "lib/sources.js"], ["lib/sources.js", "lib/walmart.js"], ["lib/search.js", "lib/walmart.js"], ["lib/walmart.js", "content.js"], ["lib/foods.js", "content.js"]])
    assert.ok(js.indexOf(dep) < js.indexOf(user), `${dep} loads before ${user}`);
});

test("permissions stay narrow: storage, Walmart pages, and the two nutrition sources", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://world.openfoodfacts.org/*", "https://api.nal.usda.gov/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.walmart.com/*"]);
  const bg = fs.readFileSync(path.join(EXT, manifest.background.service_worker), "utf8");
  assert.match(bg, /credentials: "omit"/);
});

test("store limits: description at most 132 characters, name at most 75, a version Chrome accepts", () => {
  assert.ok(manifest.description.length <= 132, `description is ${manifest.description.length} characters`);
  assert.ok(manifest.name.length <= 75);
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
});
