// 쿠팡 화면 안에서 돌며 주문·상품평을 읽는다. background.js 가 이 파일을 넣은 뒤 window.__rw.orders() / reviews() 를 부른다.
// review-writer/index.html 의 즐겨찾기 버튼(coupangBookmarklet)과 같은 규칙이다. 쿠팡 화면이 바뀌면 둘 다 고친다.
// 이름·주소·연락처·결제 정보는 읽지 않는다. 쿠팡에 아무것도 쓰거나 누르지 않는다 ('상품평' 탭 열기만 누른다).
(() => {
  if (window.__rw) return;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 주문목록 (mc.coupang.com/ssr/desktop/order/list) ──
  // 주문마다 '2026. 11. 4 주문' 머리글 + 표(tr) 한 줄에 '배송완료' · '11/4(수) 도착' ·
  // 상품 링크 sdp/link?vendorItemId=…&imagePath=…&sourceType=MyCoupang_my_orders_list_product_title
  // 같은 화면의 '반품마켓'·추천 상품도 sdp/link 를 쓰므로 sourceType 으로 거른다. 클래스 이름은 빌드마다 바뀌어 쓰지 않는다.
  function orders() {
    const ORDER_DATE = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*주문/;
    const STATUS = /(배송\s*완료|배송\s*중|배송\s*준비\s*중|상품\s*준비\s*중|결제\s*완료|구매\s*확정|주문\s*취소|취소\s*완료|반품\s*(?:접수|진행\s*중|완료)|교환\s*(?:접수|진행\s*중|완료))/;
    const ARRIVE = /(\d{1,2}\/\d{1,2}\s*\([월화수목금토일]\)\s*(?:도착\s*예정|도착|출발))/;
    const KIND = /(로켓와우|로켓프레시|로켓배송|로켓직구|판매자로켓|새벽\s*도착|일반배송|판매자배송)/;
    // 배지 그림 이름 예: RDS_LOGO_WOW_TODAY_MD, RDS_LOGO_ROCKET_TOMORROW_MD, RDS_LOGO_WOW_DAWN_MD, ROCKET_FRESH
    const badge = (alt) => {
      if (!alt || !/RDS_LOGO|ROCKET/i.test(alt)) return null;
      if (/FRESH/i.test(alt)) return "로켓프레시";
      if (/JIKGU|GLOBAL/i.test(alt)) return "로켓직구";
      if (/SELLER|GROWTH/i.test(alt)) return "판매자로켓";
      if (/DAWN/i.test(alt)) return "로켓배송 (새벽도착)";
      if (/TODAY/i.test(alt)) return "로켓배송 (오늘도착)";
      if (/TOMORROW/i.test(alt)) return "로켓배송 (내일도착)";
      return "로켓배송";
    };
    const isOrderTitle = (a) => /my_?orders?_?list[^&]*product_title/i.test(a.href);
    let anchors = [...document.querySelectorAll('a[href*="sdp/link"]')].filter(isOrderTitle);
    if (!anchors.length) anchors = [...document.querySelectorAll('a[href*="sdp/link"][href*="my_orders"]')].filter((a) => clean(a.innerText).length > 3);
    const byKey = new Map();
    for (const a of anchors) {
      const name = clean(a.innerText);
      if (name.length < 2 || /^coupang$/i.test(name)) continue;
      let url; try { url = new URL(a.href); } catch { continue; }
      const vid = url.searchParams.get("vendorItemId") || a.href;
      const row = a.closest("tr");
      if (!row) continue;
      const rowText = row.innerText || "";
      let orderDate = null;
      for (let el = row; el; el = el.parentElement) {
        const m = (el.innerText || "").match(ORDER_DATE);
        if (m) { orderDate = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`; break; }
      }
      const key = `${vid}|${orderDate}`;
      if (byKey.has(key)) continue;
      const imgPath = url.searchParams.get("imagePath");
      const img = row.querySelector(`a[href*="${vid}"][href*="product_image"] img`);
      const BADGE = 'img[alt^="RDS_LOGO"], img[alt*="ROCKET"]';
      const badgeImg = a.querySelector(BADGE) || row.querySelector(BADGE);
      byKey.set(key, {
        vid, name, orderDate, url: a.href,
        status: clean((rowText.match(STATUS) || [])[1]).replace(/\s+/g, "") || null,
        arrival: clean((rowText.match(ARRIVE) || [])[1]) || null,
        delivery: badge(badgeImg && badgeImg.alt) || clean((rowText.match(KIND) || [])[1]) || null,
        imageUrl: (img && (img.currentSrc || img.src)) || (imgPath && /^https:\/\//.test(imgPath) ? imgPath : null),
      });
    }
    return { title: document.title, url: location.href, orders: [...byKey.values()].slice(0, 40) };
  }

  // ── 상품 페이지 (www.coupang.com/vp/products/…) ──
  // 리뷰 하나 = <article>, 그 안에 별(i.twc-bg-full-star), 한 줄 제목 div, 본문 div,
  // 그리고 '도움이 돼요' 칸(.js_reviewArticleHelpfulContainer[data-review-id]).
  async function reviews() {
    const productName = clean(document.title.replace(/\s*\|\s*쿠팡!?\s*$/, "").replace(/\s+-\s+[^-]+$/, ""));
    const grab = () => {
      const helps = [...document.querySelectorAll(".js_reviewArticleHelpfulContainer, article [data-review-id]")];
      const arts = [...new Set(helps.map((h) => h.closest("article")).filter(Boolean))];
      return arts.map((a) => {
        const help = a.querySelector(".js_reviewArticleHelpfulContainer, [data-review-id]");
        const bodyEl = help && help.previousElementSibling;
        const body = clean(bodyEl && bodyEl.innerText);
        const prev = bodyEl && bodyEl.previousElementSibling;
        let headline = prev && !prev.querySelector("img") && !prev.children.length ? clean(prev.innerText) : "";
        if (headline && (productName.includes(headline) || headline.includes(productName))) headline = "";
        const stars = a.querySelectorAll('i[class*="full-star"]').length + a.querySelectorAll('i[class*="half-star"]').length / 2;
        return { rating: stars || null, headline: headline.slice(0, 120), body: body.slice(0, 1500) };
      }).filter((r) => r.body.length > 10);
    };
    let found = grab();
    if (!found.length) {
      // 상품평은 화면에 보여야 불러온다: '상품평' 탭을 누르고 그 근처로 내린다
      const tab = [...document.querySelectorAll("a, li, button")].find((e) => /^상품평\s*(\([\d,]+\))?$/.test(clean(e.textContent)));
      if (tab) { tab.scrollIntoView({ block: "center" }); tab.click(); }
      for (let i = 0; i < 15 && !found.length; i++) {
        await sleep(800);
        const anchor = document.querySelector('[class*="sdp-review"], #sdpReview, #btfTab') || tab;
        if (anchor) anchor.scrollIntoView({ block: "start" });
        window.scrollBy(0, 400);
        found = grab();
      }
    }
    return { title: document.title, url: location.href, product: productName, blocked: /access denied/i.test(document.title), reviews: found.slice(0, 20) };
  }

  window.__rw = { orders, reviews };
})();
