// Settings: goals for the product-page card, typed in or brought over from the app's backup or transfer link.
(() => {
  "use strict";
  const V = self.SelfCheckVerdict, B = self.SelfCheckBackup;
  const $ = id => document.getElementById(id);
  const NUM = ["cal", "pro", "sat", "na", "add", "fib"];
  const status = (text, ok = true) => { $("status").textContent = text; $("status").className = ok ? "ok" : "err"; };
  const get = keys => new Promise(r => chrome.storage.local.get(keys, v => r(v || {})));
  const set = obj => new Promise(r => chrome.storage.local.set(obj, r));

  function fill(p, usdaKey) {
    for (const k of NUM) $(k).value = p[k];
    $("skip").value = p.skip || ""; $("mild").checked = !!p.mild; $("usdaKey").value = usdaKey || "";
  }
  async function load() { const s = await get(["profile", "usdaKey"]); fill({ ...V.DEFAULT_PROFILE, ...(s.profile || {}) }, s.usdaKey); }

  $("goals").addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("goals").reportValidity()) return;
    const p = Object.fromEntries(NUM.map(k => [k, Number($(k).value)]));
    // The same checks a restored backup gets.
    const checked = B.KEYS.profile({ ...p, skip: $("skip").value.slice(0, 500), mild: $("mild").checked });
    await set({ profile: checked, usdaKey: $("usdaKey").value.trim().slice(0, 100) });
    status("Saved. Open product pages update right away.");
  });
  $("reset").addEventListener("click", async () => { await set({ profile: null }); await load(); status("Back to the default goals."); });

  $("importBtn").addEventListener("click", async () => {
    const text = $("paste").value.trim();
    if (!text) return status("Paste the backup text or transfer link first.", false);
    const m = text.match(/#import=([A-Za-z0-9_.-]+)/);
    const r = m ? await B.decode(m[1]) : B.parse(text);
    if (!r.ok) return status(r.error, false);
    if (!r.data.profile) return status("That backup has no goals in it. Save your goals in the app first.", false);
    await set({ profile: r.data.profile });
    await load();
    $("paste").value = "";
    status("Goals imported from the app.");
  });

  load();
})();
