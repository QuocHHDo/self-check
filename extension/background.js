// Fetches barcode lookups for the product-page card. Only Open Food Facts product records and USDA Branded Foods
// searches are allowed, with no cookies; everything else is refused.
const ALLOWED = [
  /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/\d{8,14}\.json\?/,
  /^https:\/\/api\.nal\.usda\.gov\/fdc\/v1\/foods\/search\?/,
];

// The side panel shows the product in the active tab. Each tab's product is kept in session storage (cleared when
// the browser closes), keyed by tab, and only the extension's own pages can read it.
const key = id => "tab:" + id;
try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "options") { chrome.runtime.openOptionsPage(() => reply({ ok: !chrome.runtime.lastError })); return true; }
  const tabId = sender.tab && sender.tab.id;
  if (msg && msg.type === "product" && tabId != null) {
    if (msg.data) chrome.storage.session.set({ [key(tabId)]: { ...msg.data, at: Date.now() } }); else chrome.storage.session.remove(key(tabId));
    return false;
  }
  if (msg && msg.type === "openPanel" && tabId != null) {
    // Must be called right away: Chrome allows opening the panel only in response to the click that sent this.
    const done = via => { chrome.storage.session.set({ lastOpen: { tabId, via, at: Date.now() } }); reply({ ok: true, via }); };
    chrome.sidePanel.open({ tabId }).then(() => done("panel"), () => {
      // Side panel unavailable (an older Chrome, or a policy): show the same view in a tab next to this one.
      chrome.tabs.create({ url: chrome.runtime.getURL(`sidepanel.html?tab=${tabId}`), index: sender.tab.index + 1 }, () => done("tab"));
    });
    return true;
  }
  if (!msg || msg.type !== "fetch" || typeof msg.url !== "string" || !ALLOWED.some(re => re.test(msg.url))) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  fetch(msg.url, { credentials: "omit", signal: ctrl.signal })
    .then(async res => reply({ ok: res.ok, status: res.status, json: /json/.test(res.headers.get("content-type") || "") ? await res.json() : null }))
    .catch(e => reply({ ok: false, status: 0, error: e.name === "AbortError" ? "timeout" : "network" }))
    .finally(() => clearTimeout(timer));
  return true; // reply comes later
});

// A closed tab's product is no longer needed.
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(key(id)));
