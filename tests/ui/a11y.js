const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const REPO = path.join(__dirname, "..", "..");
const read = p => fs.readFileSync(path.join(REPO, p), "utf8");
let html = read("index.html").replace(/<script src="[^"]+"><\/script>/g, "").replace(/<link [^>]*>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://quochhdo.github.io/self-check/", pretendToBeVisual: true });
const w = dom.window;
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.fetch = async () => { throw new Error("offline"); };
w.eval('window.SELF_CHECK_CONFIG = { mode: "pages" };');
for (const [, f] of read("index.html").matchAll(/<script src="([^"]+)"><\/script>/g)) w.eval(read(f));
// Accessibility check with axe-core on the fully rendered page (color contrast is checked separately: jsdom has no layout).
// open every panel and put the page in a rich state so axe sees all controls
for (const d of w.document.querySelectorAll("details")) d.open = true;
for (const v of w.document.querySelectorAll(".view")) v.hidden = false; // every tab's view
w.document.querySelector('#out button.icon-btn:nth-of-type(2)')?.click(); // add to list
[...w.document.querySelectorAll("#out button")].find(b => /to plate/.test(b.textContent))?.click();
[...w.document.querySelectorAll("#quiz button")].find(b => b.textContent === "Start")?.click();
w.eval(fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
w.axe.run(w.document, { rules: { "color-contrast": { enabled: false } } }).then(r => {
  for (const v of r.violations) {
    console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log("    ", n.target.join(" "), "|", n.failureSummary.split("\n")[1] || "");
  }
  console.log(`violations: ${r.violations.length}, passes: ${r.passes.length}`);
  if (r.violations.length) process.exitCode = 1;
});
