// Fetches barcode lookups for the product-page card. Only Open Food Facts product records and USDA Branded Foods
// searches are allowed, with no cookies; everything else is refused.
const ALLOWED = [
  /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/\d{8,14}\.json\?/,
  /^https:\/\/api\.nal\.usda\.gov\/fdc\/v1\/foods\/search\?/,
];

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "options") { chrome.runtime.openOptionsPage(); return false; }
  if (!msg || msg.type !== "fetch" || typeof msg.url !== "string" || !ALLOWED.some(re => re.test(msg.url))) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  fetch(msg.url, { credentials: "omit", signal: ctrl.signal })
    .then(async res => reply({ ok: res.ok, status: res.status, json: /json/.test(res.headers.get("content-type") || "") ? await res.json() : null }))
    .catch(e => reply({ ok: false, status: 0, error: e.name === "AbortError" ? "timeout" : "network" }))
    .finally(() => clearTimeout(timer));
  return true; // reply comes later
});

// The toolbar button opens the settings (goals).
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
