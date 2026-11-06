// 쿠팡 리뷰 작성기 도우미 — 버튼 한 번으로 주문목록과 각 상품의 상품평을 읽어 리뷰 작성기로 보낸다.
// 내 크롬의 쿠팡 로그인 그대로, 뒤쪽 탭 하나를 열어 페이지를 차례로 연다 (사람이 보는 것과 같은 방식).
// 쿠팡에 부담을 주지 않도록 상품 사이에 몇 초씩 쉬고, 한 번 읽은 상품평은 7일 동안 다시 읽지 않는다.
// (1.0.1: 상품평을 베스트순으로 읽게 바뀌어 저장 이름을 rwReviewCacheBest 로 바꿨다 → 예전 최신순 캐시는 안 씀)
const WRITER = "https://hellogit4512.github.io/campaign-moa/review-writer/";
const ORDER_LIST = "https://mc.coupang.com/ssr/desktop/order/list";
const REVIEW_TTL = 7 * 24 * 3600 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;

function say(tabId, text, extra = {}) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: "rw-ext-progress", text, ...extra }).catch(() => {});
}

// 탭을 url 로 보내고 다 열릴 때까지 기다린다
async function go(tabId, url) {
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(on); resolve(); }, 40000);
    function on(id, info) {
      if (id === tabId && info.status === "complete") { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(on); resolve(); }
    }
    chrome.tabs.onUpdated.addListener(on);
  });
  await chrome.tabs.update(tabId, { url });
  await done;
  await sleep(1500);
  return (await chrome.tabs.get(tabId)).url || "";
}

async function run(tabId, name) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: (n) => window.__rw[n](), args: [name] });
  return res && res.result;
}

async function collect(reportTabId) {
  if (running) { say(reportTabId, "이미 가져오는 중이에요…"); return; }
  running = true;
  let work = null;
  try {
    const report = reportTabId != null ? await chrome.tabs.get(reportTabId).catch(() => null) : null;
    say(reportTabId, "쿠팡 주문목록을 여는 중…");
    work = await chrome.tabs.create({ url: "about:blank", active: false, windowId: report ? report.windowId : undefined, index: report ? report.index + 1 : undefined });
    const at = await go(work.id, ORDER_LIST);
    if (/login\.coupang\.com/.test(at)) {
      await chrome.tabs.update(work.id, { active: true });
      work = null; // 로그인 탭은 닫지 않는다
      say(reportTabId, "쿠팡 로그인이 필요해요. 열린 쿠팡 탭에서 로그인한 뒤 다시 눌러 주세요.", { error: true });
      return;
    }
    const list = await run(work.id, "orders");
    if (!list || /access denied/i.test(list.title)) { say(reportTabId, "쿠팡이 잠시 막았어요. 몇 분 뒤 다시 눌러 주세요.", { error: true }); return; }
    const orders = list.orders || [];
    if (!orders.length) { say(reportTabId, "주문을 못 찾았어요. 쿠팡 화면이 바뀌었을 수 있어요.", { error: true }); return; }

    const { rwReviewCacheBest = {} } = await chrome.storage.local.get("rwReviewCacheBest");
    const now = Date.now();
    const todo = [...new Map(orders.map((o) => [o.vid, o])).values()].filter((o) => !(rwReviewCacheBest[o.vid] && now - rwReviewCacheBest[o.vid].at < REVIEW_TTL));
    for (const [i, o] of todo.entries()) {
      say(reportTabId, `상품평 읽는 중 (${i + 1}/${todo.length}) ${o.name.slice(0, 30)}…`);
      await go(work.id, o.url);
      let r = await run(work.id, "reviews").catch(() => null);
      if (r && r.blocked) { say(reportTabId, "쿠팡이 잠시 막아서 상품평 읽기를 멈췄어요. 읽은 것까지만 보낼게요.", { error: true }); break; }
      if (r && !r.reviews.length) {
        // 뒤쪽 탭에서는 상품평이 안 불러와질 때가 있어서, 잠깐 앞으로 꺼내 다시 읽는다
        const back = reportTabId;
        await chrome.tabs.update(work.id, { active: true });
        r = await run(work.id, "reviews").catch(() => null);
        if (back != null) await chrome.tabs.update(back, { active: true }).catch(() => {});
      }
      rwReviewCacheBest[o.vid] = { at: Date.now(), reviews: (r && r.reviews) || [] };
      await chrome.storage.local.set({ rwReviewCacheBest });
      await sleep(2500 + Math.random() * 2000);
    }

    const data = {
      fetchedAt: new Date().toISOString(),
      orders: orders.map((o) => ({ ...o, reviews: (rwReviewCacheBest[o.vid] && rwReviewCacheBest[o.vid].reviews) || [] })),
    };
    await chrome.storage.local.set({ rwData: data });
    const withReviews = data.orders.filter((o) => o.reviews.length).length;
    say(reportTabId, `주문 ${data.orders.length}건, 상품평 있는 상품 ${withReviews}개를 가져왔어요.`, { done: true });
    if (reportTabId != null) chrome.tabs.sendMessage(reportTabId, { type: "rw-ext-data", data }).catch(() => {});
  } catch (e) {
    say(reportTabId, `가져오다 멈췄어요: ${e.message}`, { error: true });
  } finally {
    if (work) chrome.tabs.remove(work.id).catch(() => {});
    running = false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.cmd === "collect") collect(sender.tab ? sender.tab.id : null);
});

// 확장 프로그램 아이콘을 누르면 리뷰 작성기를 열고 바로 가져오기 시작
chrome.action.onClicked.addListener(async () => {
  const [open] = await chrome.tabs.query({ url: [`${WRITER}*`, "http://localhost:5181/review-writer/*"] });
  let tab = open;
  if (tab) await chrome.tabs.update(tab.id, { active: true });
  else {
    tab = await chrome.tabs.create({ url: WRITER });
    await new Promise((resolve) => {
      function on(id, info) { if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(on); resolve(); } }
      chrome.tabs.onUpdated.addListener(on);
    });
    await sleep(500);
  }
  collect(tab.id);
});
