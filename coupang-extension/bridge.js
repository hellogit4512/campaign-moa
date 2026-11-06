// 리뷰 작성기 페이지와 확장 프로그램을 잇는다.
// 페이지 → 확장: window.postMessage({ type: "rw-ext-collect" })
// 확장 → 페이지: { type: "rw-ext-ready" | "rw-ext-progress" | "rw-ext-data" }
(() => {
  const version = chrome.runtime.getManifest().version;
  document.documentElement.dataset.rwExt = version;
  const toPage = (msg) => window.postMessage(msg, location.origin);

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.type !== "rw-ext-collect") return;
    chrome.runtime.sendMessage({ cmd: "collect" });
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && (msg.type === "rw-ext-progress" || msg.type === "rw-ext-data")) toPage(msg);
  });

  toPage({ type: "rw-ext-ready", version });
  // 지난번에 가져온 것이 있으면 바로 보여 준다
  chrome.storage.local.get("rwData").then(({ rwData }) => { if (rwData) toPage({ type: "rw-ext-data", data: rwData, cached: true }); });
})();
