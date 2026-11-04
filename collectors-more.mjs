// 원래 사이트 서버 갱신이 멈춰도 목록이 이어지도록, 나머지 플랫폼도 이 PC(또는 GitHub Actions)에서 직접 수집한다.
// 모두 공개 목록만 읽고 robots.txt 가 막은 경로는 요청하지 않는다. (스토리앤미디어는 목록 경로가 막혀 있어 제외)
import { guessArea } from "./regions.mjs";
import { category as guessCategory } from "./collectors.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 campaign-moa-sync";
const DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { referer, method = "GET", body, json = false } = {}) {
  await sleep(DELAY_MS);
  const headers = { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Referer: referer || url };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  const res = await fetch(url, { method, headers, body });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return json ? res.json() : res.text();
}

const addDays = (today, n) => new Date(Date.parse(today) + n * 86400e3).toISOString().slice(0, 10);
const int = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const text = (s) => (s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const pick = (re, s) => re.exec(s)?.[1];
const DELIVERY = { province: "전국", district: null, region: "전국 배송" };

// "6일 남음", "D-6", "D-Day 6", "D-day", "오늘 마감" → 마감일. 마감·종료면 "closed"
function endFrom(label, today) {
  const t = (label || "").replace(/\s+/g, " ").trim();
  if (/하루/.test(t)) return addDays(today, 1); // "마감임박(하루전)"
  if (/마감|종료|완료/.test(t) && !/오늘/.test(t) && !/남음/.test(t)) return "closed";
  if (/오늘|D-?day$/i.test(t)) return today;
  const n = int(t);
  return n != null ? addDays(today, n) : null;
}
const typeFrom = (s) => (/배송|구매|택배|재택/.test(s) ? "배송" : /기자/.test(s) ? "기자단" : /방문|포장|숙박/.test(s) ? "방문" : "기타");
function areaFrom(type, title) {
  if (type === "배송") return DELIVERY;
  const label = pick(/^\s*\[([^\]]+)\]/, title);
  return label ? guessArea(label) : guessArea("");
}
function row(o) {
  return { category: guessCategory(o.type === "기타" ? "방문" : o.type, `${o.title} ${o.reward || ""}`), ...areaFrom(o.type, o.title), ...o };
}

// ── 디너의여왕 · 택배의여왕 · 뷰티의여왕 (같은 엔진: POST /taste/taste_list) ──
function queens(platform, base) {
  return async (today, seen = new Set()) => {
    const out = [];
    for (let page = 1; page <= 400; page++) {
      const j = await get(`${base}/taste/taste_list?ct=&area1=%EC%A0%84%EA%B5%AD&area2=%EC%A0%84%EC%B2%B4&page=${page}&ctype=&query=`, { method: "POST", referer: `${base}/taste`, json: true });
      const html = j.layout || "";
      const cards = html.split(/<div class="qz-dq-card campaign/).slice(1);
      // 택배의여왕 카드 구조 (<div class="qz-dq-card qz-button ...">, 배송형 위주)
      const tcards = cards.length ? [] : html.split(/<div class="qz-dq-card qz-button/).slice(1);
      if (tcards.length) {
        for (const c of tcards) {
          const id = pick(/href="\/taste\/(\d+)/, c);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const end = endFrom(text(pick(/class="qz-badge[^"]*">([\s\S]*?)<\/p>/, c)), today);
          if (end === "closed") continue;
          const title = (pick(/title="([^"]+?)\s*신청하기"/, c) || "").trim() || text(pick(/<strong class="keep-a ">([\s\S]*?)<\/strong>/, c));
          const kind = text(pick(/<strong class="keep-a">([\s\S]*?)<\/strong>/, c));
          out.push(row({
            id: `${platform}-${id}`, platform, title, url: `${base}/taste/${id}`, type: /방문/.test(kind) ? "방문" : "배송",
            imageUrl: pick(/<img src="([^"]+)"/, c) || null, channel: /\[릴스\]/.test(title) ? "릴스" : /\[클립\]/.test(title) ? "클립" : "블로그",
            reward: text(pick(/ellipsis color-placeholder[^"]*">([\s\S]*?)<\/p>/, c)) || null,
            endDate: end, applicantCount: null, selectionCount: null,
          }));
        }
        if (!j.has_next) break;
        continue;
      }
      // 뷰티의여왕은 예전 카드 구조(<div class="item">)를 쓴다
      if (!cards.length) {
        const old = html.split(/<div class="item">/).slice(1);
        if (!old.length) break;
        for (const c of old) {
          const id = pick(/href="\/taste\/(\d+)/, c);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const end = endFrom(text(pick(/<b>(D\s*-\s*\d+|D-?day|오늘[^<]*)<\/b>/i, c)).replace(/\s/g, ""), today);
          if (end === "closed") continue;
          const title = text(pick(/<h5 class="ellipsis[^"]*">([\s\S]*?)<\/h5>/, c));
          out.push(row({
            id: `${platform}-${id}`, platform, title, url: `${base}/taste/${id}`, type: "방문",
            imageUrl: pick(/<img src="([^"]+)"/, c) || null, channel: /\[릴스\]/.test(title) ? "릴스" : /\[클립\]/.test(title) ? "클립" : "블로그",
            reward: null, endDate: end, applicantCount: null, selectionCount: null,
          }));
        }
        if (!j.has_next) break;
        continue;
      }
      for (const c of cards) {
        const id = pick(/href="\/taste\/(\d+)"/, c);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const end = endFrom(text(pick(/class="dday[^"]*">([\s\S]*?)<\/p>/, c)), today);
        if (end === "closed") continue;
        const title = text(pick(/class="qz-body2-kr ellipsis[^"]*">([\s\S]*?)<\/p>/, c)) || (pick(/title="([^"]+?)\s*신청하기"/, c) || "").trim();
        const badges = [...c.matchAll(/<strong[^>]*>([^<]+)<\/strong><\/p>/g)].map((m) => m[1].trim());
        const type = badges.includes("배송") ? "배송" : badges.includes("기자단") ? "기자단" : "방문";
        const channel = badges.includes("릴스") ? "릴스" : badges.includes("클립") ? "클립" : /\[(인스타|인스타그램)\]/.test(title) ? "인스타그램" : "블로그";
        out.push(row({
          id: `${platform}-${id}`, platform, title, url: `${base}/taste/${id}`, type,
          imageUrl: pick(/<img[^>]+src="([^"]+)"/, c) || null, channel,
          reward: text(pick(/class="qz-caption-kr color-placeholder[^"]*">([\s\S]*?)<\/p>/, c)) || null,
          endDate: end, applicantCount: int(pick(/신청\s*([\d,]+)/, text(c))), selectionCount: int(pick(/신청\s*[\d,]+\s*\/\s*([\d,]+)/, text(c))),
          ...(badges.includes("맛집") ? { category: "맛집" } : badges.includes("뷰티") ? { category: "뷰티" } : {}),
        }));
      }
      if (!j.has_next) break;
    }
    return out;
  };
}

// ── 강남맛집 ── /theme/go/_list_cmp_tpl.php?rpage=N
async function gangnam(today) {
  const base = "https://xn--939au0g4vj8sq.net";
  const out = [], seen = new Set();
  for (let page = 1; page <= 400; page++) {
    const html = await get(`${base}/theme/go/_list_cmp_tpl.php?&rpage=${page}&row_num=28`, { referer: `${base}/cp/` });
    const items = html.split(/<li class='list_item/).slice(1);
    if (!items.length) break;
    let fresh = 0;
    for (const li of items) {
      const id = pick(/\/cp\/\?id=(\d+)/, li);
      if (!id || seen.has(id)) continue;
      seen.add(id); fresh++;
      // 남은 기간은 <em class='day_c'> 또는 <em class='last_d day_c'>오늘마감</em> 에 있다
      const end = endFrom(text(pick(/class='[^']*day_c[^']*'>([^<]*)</, li)), today);
      if (end === "closed") continue;
      const ch = [...li.matchAll(/<em class='([a-z_]+)'>/g)].map((m) => m[1]).filter((k) => k !== "type");
      const img = pick(/<img src='([^']+)'/, li);
      out.push(row({
        id: `gangnam-${id}`, platform: "gangnam", title: text(pick(/<dt class='tit'>([\s\S]*?)<\/dt>/, li)), url: `${base}/cp/?id=${id}`,
        type: typeFrom(text(pick(/<em class='type'>([^<]*)<\/em>/, li))),
        imageUrl: img ? (img.startsWith("//") ? "https:" + img : img) : null,
        channel: ch.map((k) => ({ blog: "블로그", insta: "인스타그램", instagram: "인스타그램", reels: "릴스", clip: "클립", youtube: "유튜브", shorts: "유튜브" }[k])).filter(Boolean).join(" · ") || null,
        reward: text(pick(/<dd class='sub_tit'>([\s\S]*?)<\/dd>/, li)) || null,
        endDate: end, applicantCount: int(pick(/신청\s*([\d,]+)/, text(li))), selectionCount: int(pick(/모집\s*([\d,]+)/, text(li))),
      }));
    }
    if (!fresh) break;
  }
  return out;
}

// ── 서울오빠 ── /campaign/ajax/list.ajax.php (마감순 정렬이라 마감이 나오기 시작하면 멈춘다)
async function seoulouba(today) {
  const base = "https://www.seoulouba.co.kr";
  const parse = (html) => html.split(/<li class="campaign_content">/).slice(1).map((li) => {
    const id = pick(/campaign\/\?c=(\d+)/, li);
    const end = endFrom(text(pick(/class="d_day">([\s\S]*?)<\/div>/, li)), today);
    const ch = pick(/<div class="icon_box">\s*<img[^>]+alt="([^"]+)"/, li) || "";
    return id && {
      id, end, li, item: row({
        id: `seoulouba-${id}`, platform: "seoulouba", title: text(pick(/class="s_campaign_title">([\s\S]*?)<\/strong>/, li)), url: `${base}/campaign/?c=${id}`,
        type: typeFrom(text(pick(/class="icon_tag">([\s\S]*?)<\/div>/, li))),
        imageUrl: pick(/class="tum_img">\s*<img src="([^"]+)"/, li) || null,
        channel: /블로그/.test(ch) ? "블로그" : /릴스/.test(ch) ? "릴스" : /인스타/.test(ch) ? "인스타그램" : /클립/.test(ch) ? "클립" : /유튜브|쇼츠/.test(ch) ? "유튜브" : null,
        reward: text(pick(/class="t_basic">([\s\S]*?)<\/div>/, li)) || null,
        endDate: end === "closed" ? null : end, applicantCount: int(pick(/신청\s*([\d,]+)/, text(li))), selectionCount: int(pick(/모집\s*([\d,]+)/, text(li))),
      }),
    };
  }).filter(Boolean);
  const out = new Map();
  let list = parse(await get(`${base}/campaign/?cat=1`));
  let closedStreak = 0;
  for (let page = 2, more = list.length; page <= 200; page++) {
    for (const x of list) {
      if (x.end === "closed") { closedStreak++; continue; }
      closedStreak = 0;
      out.set(x.id, x.item);
    }
    if (!list.length || closedStreak >= 36) break;
    const body = new URLSearchParams({ cat: "1", qq: "", q: "", q1: "", q2: "", ar1: "", ar2: "", sort: "", pt: "", page: String(page), more: String(more), rows: "36" });
    list = parse(await get(`${base}/campaign/ajax/list.ajax.php`, { method: "POST", body: body.toString(), referer: `${base}/campaign/?cat=1` }));
    more += 36;
  }
  return [...out.values()];
}

// ── 놀러와체험단 ── item_list.php?page=N
async function cometoplay(today) {
  const base = "https://www.cometoplay.kr";
  const out = [], seen = new Set();
  for (let page = 1; page <= 200; page++) {
    const html = await get(`${base}/item_list.php?page=${page}`);
    const items = html.split(/<li>\s*<div class="thumb">/).slice(1);
    let fresh = 0;
    for (const li of items) {
      const id = pick(/item\.php\?it_id=(\d+)/, li);
      if (!id || seen.has(id)) continue;
      seen.add(id); fresh++;
      const end = endFrom(text(pick(/<span class="txt_num">([^<]*)<\/span>/, li)), today);
      if (end === "closed") continue;
      const title = text(pick(/<span class="it_name">([\s\S]*?)<\/span>/, li));
      const ch = [...li.matchAll(/<i class="([a-z_]+)"><\/i>/g)].map((m) => m[1]);
      const img = pick(/<img src="([^"]+)" alt="" class="it_img"/, li);
      out.push(row({
        id: `cometoplay-${id}`, platform: "cometoplay", title, url: `${base}/item.php?it_id=${id}`,
        type: /^\s*\[(배송|택배|구매)/.test(title) ? "배송" : "방문",
        imageUrl: img ? new URL(img, base + "/").href : null,
        channel: ch.map((k) => ({ blog: "블로그", insta: "인스타그램", instagram: "인스타그램", reels: "릴스", clip: "클립", youtube: "유튜브" }[k])).filter(Boolean).join(" · ") || null,
        reward: text(pick(/<span class="it_description">([\s\S]*?)<\/span>/, li)) || null,
        endDate: end, applicantCount: int(pick(/신청\s*<b[^>]*>([\d,]+)/, li)), selectionCount: int(pick(/모집\s*<b[^>]*>([\d,]+)/, li)),
      }));
    }
    if (!fresh) break;
  }
  return out;
}

// ── 리뷰웨이브 · 메타체험단 (campaign_list.php?json=list 공용 엔진) ──
function cpList(platform, base) {
  return async (today) => {
    const out = [];
    for (let page = 1; page <= 300; page++) {
      const j = await get(`${base}/campaign_list.php?json=list&category_id=&keyword=&cp_media=&orderby=&page=${page}`, { referer: `${base}/campaign_list.php`, json: true });
      if (!j.list?.length) break;
      for (const x of j.list) {
        const day = String(x.cp_day ?? "");
        // 메타체험단은 남은 일수를 숫자만 준다
        const end = x.cp_always === "1" ? null : /^\d+$/.test(day) ? addDays(today, Number(day)) : endFrom(day, today);
        if (end === "closed") continue;
        const title = (x.cp_subject || "").trim();
        const ch = [x.cp_media_blog === "1" && "블로그", x.cp_media_instagram === "1" && "인스타그램", x.cp_media_youtube === "1" && "유튜브", x.cp_media_shop === "1" && "구매평"].filter(Boolean);
        out.push(row({
          id: `${platform}-${x.cp_id}`, platform, title, url: `${base}/campaign.php?cp_id=${x.cp_id}`, type: typeFrom(x.cp_type || ""),
          imageUrl: x.cp_img ? new URL(x.cp_img, base + "/").href : null, channel: ch.join(" · ") || null,
          reward: [x.cp_description, x.cp_point && x.cp_point !== "0" ? `${x.cp_point}P` : null].filter(Boolean).join(" · ") || null,
          endDate: end, applicantCount: int(x.cp_order), selectionCount: int(x.cp_recruit),
        }));
      }
      if (j.last_page == 1) break;
    }
    return out;
  };
}

// ── 아싸뷰 ── campaign_list.php?json=list (필드가 다른 엔진)
async function assaview(today) {
  const base = "https://assaview.co.kr";
  const out = [];
  for (let page = 1; page <= 300; page++) {
    const j = await get(`${base}/campaign_list.php?json=list&page=${page}`, { referer: `${base}/campaign_list.php`, json: true });
    if (!j.list?.length) break;
    for (const x of j.list) {
      if (x.cp_is_open === "false" || x.soldout_msg) continue;
      const cd = /(\d{4})\/(\d{2})\/(\d{2})/.exec(x.cp_countdown || "");
      const end = cd ? `${cd[1]}-${cd[2]}-${cd[3]}` : null;
      if (end && end < today) continue;
      const title = (x.cp_subject || "").trim();
      const ch = [x.cp_media_blog === "1" && "블로그", x.cp_media_clip === "1" && "클립", x.cp_media_reels === "1" && "릴스", x.cp_media_instagram === "1" && "인스타그램", x.cp_media_shop === "1" && "구매평"].filter(Boolean);
      out.push(row({
        id: `assaview-${x.cp_id}`, platform: "assaview", title, url: `${base}/campaign.php?cp_id=${x.cp_id}`, type: typeFrom(x.cp_type || ""),
        imageUrl: x.cp_img ? new URL(x.cp_img, base + "/").href : null, channel: ch.join(" · ") || null,
        reward: text(x.cp_opt_text) || null, endDate: end, applicantCount: int(x.cp_order), selectionCount: int(x.cp_recruit),
      }));
    }
    if (j.last_page == 1 || page * 20 >= (j.total_count || 0)) break;
  }
  return out;
}

// 디너의여왕 목록에 택배·뷰티의여왕 캠페인도 다 들어 있다. 택배·뷰티를 먼저 읽고, 디너의여왕은 나머지만 둔다
const queensSeen = new Set();
export const MORE_COLLECTORS = {
  tqueens: { name: "택배의여왕", url: "https://tqueens.net/", run: (t) => queens("tqueens", "https://tqueens.net")(t, queensSeen) },
  bqueens: { name: "뷰티의여왕", url: "https://bqueens.net/", run: (t) => queens("bqueens", "https://bqueens.net")(t, queensSeen) },
  dinnerqueen: { name: "디너의여왕", url: "https://dinnerqueen.net/taste", run: (t) => queens("dinnerqueen", "https://dinnerqueen.net")(t, queensSeen) },
  gangnam: { name: "강남맛집", url: "https://xn--939au0g4vj8sq.net/cp/", run: gangnam },
  seoulouba: { name: "서울오빠", url: "https://www.seoulouba.co.kr/campaign/?cat=1", run: seoulouba },
  cometoplay: { name: "놀러와체험단", url: "https://www.cometoplay.kr/item_list.php", run: cometoplay },
  reviewwave: { name: "리뷰웨이브", url: "https://www.reviewwave.kr/campaign_list.php", run: cpList("reviewwave", "https://www.reviewwave.kr") },
  meta: { name: "메타체험단", url: "https://meta-chehumdan.com/campaign_list.php", run: cpList("meta", "https://meta-chehumdan.com") },
  assaview: { name: "아싸뷰", url: "https://assaview.co.kr/campaign_list.php", run: assaview },
};
