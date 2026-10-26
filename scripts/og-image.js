// Makes icons/og.png, the 1200×630 preview image shown when the site's link is shared.
//   node scripts/og-image.js
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const icon = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "icons/icon-512.png")).toString("base64");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; background: #f5f6f1; font-family: "Archivo", "Helvetica Neue", Arial, sans-serif; color: #161813; display: flex; }
  .l { padding: 0 0 0 80px; width: 640px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 22px; } .brand img { width: 96px; height: 96px; border-radius: 22px; }
  h1 { font-size: 74px; line-height: 1; margin: 0; font-weight: 800; letter-spacing: -.02em; }
  p { font: 500 31px/1.35 "Public Sans", "Helvetica Neue", Arial, sans-serif; color: #3d4239; margin: 40px 0 0; max-width: 560px; }
  .free { margin-top: 34px; font: 600 23px "Public Sans", Arial, sans-serif; color: #2c6a3d; }
  .r { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 22px; padding-right: 72px; }
  .v { background: #fff; border: 2px solid #d8dccf; border-radius: 18px; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; font: 600 27px "Public Sans", Arial, sans-serif; }
  .v span { font: 800 22px "Archivo", Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; margin-left: 16px; padding: 8px 14px; border-radius: 10px; }
  .g span { background: #dff0e2; color: #2b7742; } .m span { background: #f6ead2; color: #8e5f16; } .b span { background: #f6dfdb; color: #b23a2f; }
</style></head><body>
  <div class="l"><div class="brand"><img src="${icon}" alt=""><h1>Should I<br>Buy It?</h1></div>
    <p>Search or scan a food. See its label and whether it fits your goals.</p>
    <div class="free">Free · No account · Private</div></div>
  <div class="r">
    <div class="v g">Greek yogurt <span>Get it</span></div>
    <div class="v m">Granola <span>In moderation</span></div>
    <div class="v b">Hot dog <span>Limit it</span></div>
  </div></body></html>`;
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html); await p.screenshot({ path: path.join(ROOT, "icons/og.png") }); await b.close();
  console.log("Wrote icons/og.png");
})();
