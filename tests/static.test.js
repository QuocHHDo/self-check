// Checks on index.html that don't need a browser.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("16: every :hover style is inside @media (hover: hover), so taps don't leave sticky highlights", () => {
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const start = css.indexOf("@media (hover: hover)");
  assert.ok(start > 0, "hover media block exists");
  let depth = 0, end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}" && --depth === 0) { end = i; break; } }
  const outside = (css.slice(0, start) + css.slice(end)).match(/[^{}]*:hover[^{}]*\{/g) || [];
  assert.deepEqual(outside, []);
});

test("16: goal inputs declare their valid range", () => {
  for (const id of ["p-cal", "p-pro", "p-sat", "p-na", "p-add", "p-fib"]) assert.match(html, new RegExp(`id="${id}" type="number" min="\\d+" max="\\d+"`), id);
});
