// 서버 수집이 멈춘 플랫폼을 이 PC에서 직접 수집한다.
// 각 함수는 fetch-campaigns.mjs 의 FIELDS 순서와 같은 객체 배열을 돌려준다.
// 모두 공개 목록 API만 읽고, robots.txt 가 막은 경로는 요청하지 않는다.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 campaign-moa-sync";
const DELAY_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, referer) {
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Referer: referer } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// ── 공통 정리 ──
const PROVINCE = {
  서울특별시: "서울", 서울시: "서울", 서울: "서울", 경기도: "경기", 경기: "경기", 인천광역시: "인천", 인천: "인천",
  부산광역시: "부산", 부산: "부산", 대구광역시: "대구", 대구: "대구", 대전광역시: "대전", 대전: "대전",
  광주광역시: "광주", 광주: "광주", 울산광역시: "울산", 울산: "울산", 세종특별자치시: "세종", 세종: "세종",
  강원도: "강원", 강원특별자치도: "강원", 강원: "강원", 충청북도: "충북", 충북: "충북", 충청남도: "충남", 충남: "충남",
  전라북도: "전북", 전북특별자치도: "전북", 전북: "전북", 전라남도: "전남", 전남: "전남",
  경상북도: "경북", 경북: "경북", 경상남도: "경남", 경남: "경남", 제주특별자치도: "제주", 제주도: "제주", 제주: "제주",
};
// 대괄호 지역 표기에 시·도 없이 도시 이름만 올 때 쓰는 보조 표
const CITY_PROVINCE = {
  강남: "서울", 역삼: "서울", 홍대: "서울", 신촌: "서울", 성수: "서울", 잠실: "서울", 건대: "서울", 이태원: "서울", 여의도: "서울", 종로: "서울", 명동: "서울",
  수원: "경기", 성남: "경기", 분당: "경기", 용인: "경기", 고양: "경기", 일산: "경기", 부천: "경기", 안산: "경기", 안양: "경기", 화성: "경기", 동탄: "경기",
  평택: "경기", 시흥: "경기", 김포: "경기", 파주: "경기", 의정부: "경기", 광명: "경기", 하남: "경기", 남양주: "경기", 구리: "경기", 군포: "경기", 오산: "경기", 이천: "경기", 양주: "경기", 의왕: "경기", 광주시: "경기", 동두천: "경기", 포천: "경기", 가평: "경기", 양평: "경기", 안성: "경기", 여주: "경기", 과천: "경기", 연천: "경기",
  강동: "서울", 강서: "서울", 마포: "서울", 망원: "서울", 합정: "서울", 연남: "서울", 을지로: "서울", 압구정: "서울", 신사: "서울", 노원: "서울", 영등포: "서울", 송파: "서울", 서초: "서울",
  송도: "인천", 청라: "인천", 해운대: "부산", 서면: "부산", 창원: "경남", 김해: "경남", 양산: "경남", 진주: "경남", 거제: "경남", 통영: "경남",
  포항: "경북", 구미: "경북", 경주: "경북", 안동: "경북", 청주: "충북", 충주: "충북", 천안: "충남", 아산: "충남", 당진: "충남", 서산: "충남",
  전주: "전북", 익산: "전북", 군산: "전북", 여수: "전남", 순천: "전남", 목포: "전남", 춘천: "강원", 원주: "강원", 강릉: "강원", 속초: "강원", 서귀포: "제주",
};

function area({ addr, label, delivery, text }) {
  if (delivery) return { province: "전국", district: null, region: "전국 배송" };
  let province = null, district = null;
  const a = (addr || "").trim().split(/\s+/);
  if (PROVINCE[a[0]]) { province = PROVINCE[a[0]]; district = a[1] || null; }
  if (!province && label) {
    const t = label.replace(/[\[\]]/g, "").split(/[\/\s]+/).filter(Boolean);
    if (PROVINCE[t[0]]) { province = PROVINCE[t[0]]; district = t[1] || null; }
    else {
      const city = t[0]?.replace(/(시|군|구)$/, "");
      if (CITY_PROVINCE[t[0]] || CITY_PROVINCE[city]) { province = CITY_PROVINCE[t[0]] || CITY_PROVINCE[city]; district = t[0]; }
    }
  }
  // 지역 표기가 없으면 제목 속 동네 이름으로 시·도만 추정
  if (!province && text) {
    const hit = Object.keys(CITY_PROVINCE).find((k) => text.includes(k));
    if (hit) { province = CITY_PROVINCE[hit]; district = hit; }
  }
  return { province, district, region: [province, district].filter(Boolean).join(" ") || null };
}

const BEAUTY = /(피부|헤어|미용|네일|왁싱|속눈썹|에스테틱|마사지|스파|두피|눈썹|반영구|필라테스|요가|PT|클리닉|성형|치과|한의원)/i;
const FOOD = /(맛집|식당|카페|고기|횟집|회|초밥|스시|요리|음식|디저트|베이커리|빵|술집|포차|이자카야|파스타|피자|치킨|국밥|갈비|삼겹|한우|곱창|족발|브런치|레스토랑|뷔페|칼국수|냉면|국수|라멘|쌀국수|감자탕|순대|떡볶이|분식|오마카세|와인|펍|bar)/i;
function category(type, text) {
  if (type === "배송") return "제품";
  if (BEAUTY.test(text)) return "뷰티";
  if (FOOD.test(text)) return "맛집";
  return "기타";
}

// "11.08(일)" 같은 월.일 → YYYY-MM-DD (연도는 오늘 기준으로 가까운 쪽)
function monthDay(md, today) {
  const m = /(\d{1,2})\.(\d{1,2})/.exec(md || "");
  if (!m) return null;
  const y = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  const mm = Number(m[1]);
  const year = mm < tm - 6 ? y + 1 : mm > tm + 6 ? y - 1 : y;
  return `${year}-${String(mm).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}
const addDays = (today, n) => new Date(Date.parse(today) + n * 86400e3).toISOString().slice(0, 10);
const strip = (html) => (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null;
const int = (v) => { const n = parseInt(String(v ?? "").replace(/,/g, ""), 10); return Number.isFinite(n) ? n : null; };
const join = (list) => list.filter(Boolean).join(" · ") || null;

// ── 데일리뷰 ── 공개 목록 JSON (review_campaign_list.php?json=list)
export async function dailyview(today) {
  const base = "https://dailyview.kr/";
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const j = await getJSON(`${base}review_campaign_list.php?json=list&page=${page}`, base + "review_campaign_list.php");
    if (!j.list?.length) break;
    for (const x of j.list) {
      if (/마감/.test(x.cp_day || "")) continue;
      x.cp_subject = (x.cp_subject || "").trim();
      const type = /배송/.test(x.cp_type_cut) ? "배송" : /기자/.test(x.cp_type_cut) ? "기자단" : /방문/.test(x.cp_type_cut) ? "방문" : "기타";
      const ch = [x.cp_media_blog && "블로그", x.cp_media_clip && "클립", (x.cp_media_instagram_reels) && "릴스",
        x.cp_media_instagram && "인스타그램", (x.cp_media_youtube || x.cp_media_youtube_shorts) && "유튜브", x.cp_media_shop && "구매평"];
      const label = /^\[([^\]]+)\]/.exec(x.cp_subject)?.[1];
      out.push({
        id: `dailyview-${x.cp_id}`, platform: "dailyview", title: x.cp_subject, url: `${base}review_campaign.php?cp_id=${x.cp_id}`,
        category: category(type, `${x.cp_subject} ${x.cp_keyword_cut || ""} ${x.cp_description || ""}`), type,
        ...area({ addr: x.cp_addr1, label, delivery: type === "배송" }),
        imageUrl: x.cp_img_cut ? new URL(x.cp_img_cut, base).href : null,
        channel: join(ch), reward: strip(x.cp_reward_cut) || x.cp_description || null,
        endDate: monthDay(x.cp_edate_cut, today), applicantCount: int(x.cp_order_cut), selectionCount: int(x.cp_recruit_cut),
      });
    }
  }
  return out;
}

// ── 모두모여체험단 ── 공개 목록 JSON (campaign_list.php?json=list). 상세(campaign.php)는 robots.txt 제한이라 읽지 않는다.
export async function modumoyeo(today) {
  const base = "https://xn--6j1br0ag3lba435lvsj96p.com/";
  const out = [];
  // 모집 중·상시모집이 오래된 페이지에도 섞여 있어 마지막 페이지(last_page)까지 읽는다
  for (let page = 1; page <= 300; page++) {
    const j = await getJSON(`${base}campaign_list.php?json=list&category_id=&keyword=&cp_media=&orderby=&page=${page}`, base + "campaign_list.php");
    if (!j.list?.length) break;
    for (const x of j.list) {
      x.cp_subject = (x.cp_subject || "").trim();
      if (/마감/.test(x.cp_day || "") || /^모집마감/.test(x.cp_subject)) continue;
      const d = /(\d+)/.exec(x.cp_day || "");
      const end = x.cp_always === "1" ? null : /오늘/.test(x.cp_day || "") ? today : d ? addDays(today, Number(d[1])) : null;
      const type = /배송/.test(x.cp_type) ? "배송" : /기자/.test(x.cp_type) ? "기자단" : /방문/.test(x.cp_type) ? "방문" : "기타";
      const label = /^\[([^\]]+)\]/.exec(x.cp_subject)?.[1];
      const ch = [x.cp_media_blog === "1" && "블로그", x.cp_media_instagram === "1" && "인스타그램", x.cp_media_youtube === "1" && "유튜브", x.cp_media_shop === "1" && "구매평"];
      out.push({
        id: `modumoyeo-${x.cp_id}`, platform: "modumoyeo", title: x.cp_subject, url: `${base}campaign.php?cp_id=${x.cp_id}`,
        category: category(type, `${x.cp_subject} ${x.cp_description || ""}`), type,
        ...area({ label, delivery: type === "배송", text: type === "방문" ? x.cp_subject : null }),
        imageUrl: x.cp_img ? new URL(x.cp_img, base).href : null,
        channel: join(ch), reward: [x.cp_description, x.cp_point && x.cp_point !== "0" ? `${x.cp_point}P` : null].filter(Boolean).join(" · ") || null,
        endDate: end, applicantCount: int(x.cp_order), selectionCount: int(x.cp_recruit),
      });
    }
    if (j.last_page == 1) break;
  }
  return out;
}

// ── 포블로그 ── 목록 API. 전체 목록은 400~600개에서 끊기므로 세부 지역·배송·기자단으로 나눠서 읽는다.
export async function blog4(today) {
  const base = "https://4blog.net/";
  const list = async (params, referer) => {
    const items = [];
    for (let offset = 0; offset < 5000; ) {
      const q = new URLSearchParams({ offset, limit: 50, maxLoadCount: 600, category: "", sort: "", category1: "", location: "", location1: "", search: "", search2: "", bid: "", ...params });
      const j = await getJSON(`${base}loadMoreDataCategoryV2?${q}`, referer);
      if (!Array.isArray(j) || !j.length) break;
      items.push(...j); offset += j.length;
    }
    return items;
  };
  const codes = await getJSON(`${base}api/categoryLocationCodes`, base);
  const seen = new Map(); // CID → { item, addr }
  for (const d of codes.detailCode || []) {
    for (const x of await list({ category1: "local", location: d.GROUP_ID, location1: d.CODE }, `${base}list/all/local/${d.GROUP_ID}/${d.CODE}`)) {
      if (!seen.has(x.CID)) seen.set(x.CID, { x, addr: d.ADDRESS });
    }
  }
  // 세부 지역에 안 잡힌 지역 캠페인 + 배송·기자단
  for (const c1 of ["local", "deliv", "reporter"]) {
    for (const x of await list({ category1: c1 }, `${base}list/all/${c1}`)) if (!seen.has(x.CID)) seen.set(x.CID, { x, addr: null });
  }
  const CH = { blog: "블로그", reels: "릴스", instar21: "인스타그램", shorts: "유튜브", clip: "클립" };
  const out = [];
  for (const { x, addr } of seen.values()) {
    const type = x.CATEGORY1 === "deliv" ? "배송" : x.CATEGORY1 === "reporter" ? "기자단" : "방문";
    const label = (x.LOCATION_NM || "").replace(/[\[\]]/g, "");
    let a = area({ label: /^\[([^\]]+)\]/.exec(x.CAMPAIGN_NM)?.[1] || label, delivery: type === "배송" });
    // 세부 지역 코드의 대표 주소에서 시·도를 가져오고, 구·시는 캠페인의 지역 표기를 쓴다
    if (addr && type !== "배송") {
      const province = PROVINCE[addr.split(/\s+/)[0]];
      const district = label.split("/")[0] || addr.split(/\s+/)[1];
      if (province) a = { province, district, region: `${province} ${district}` };
    }
    const end = Number.isFinite(x.REMAINDATE) ? addDays(today, x.REMAINDATE) : monthDay(x.REQ_CLOSE_DT, today);
    out.push({
      id: `blog4-${x.CID}`, platform: "blog4", title: x.CAMPAIGN_NM, url: `${base}campaign/${x.CID}/`,
      category: category(type, `${x.CAMPAIGN_NM} ${x.KEYWORD || ""}`), type, ...a,
      imageUrl: x.IMGKEY ? `https://d3oxv6xcx9d0j1.cloudfront.net/public/pr/${x.PRID}/thumbnail/${x.IMGKEY}` : null,
      channel: CH[x.CATEGORY] || null, reward: x.REVIEWER_BENEFIT || null,
      endDate: end, applicantCount: int(x.REVIEWER_REQ_CNT), selectionCount: int(x.REVIEWER_CNT),
    });
  }
  return out;
}

export const LOCAL_COLLECTORS = {
  dailyview: { name: "데일리뷰", url: "https://dailyview.kr/review_campaign_list.php", run: dailyview },
  blog4: { name: "포블로그", url: "https://4blog.net/", run: blog4 },
};
