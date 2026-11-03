// 로그인이 필요한 레뷰·미블 수집기. 전용 크롬 프로필(browser-profile/)의 로그인 상태를 쓴다.
// 로그인이 풀렸으면 LoginRequiredError 를 던진다 → npm run login 으로 다시 로그인.
import { openBrowser } from "./browser.mjs";
import { guessArea } from "./regions.mjs";
import { category as guessCategory } from "./collectors.mjs";

export class LoginRequiredError extends Error {}

const DELAY_MS = 1200; // 계정 보호를 위해 천천히 읽는다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addDays = (today, n) => new Date(Date.parse(today) + n * 86400e3).toISOString().slice(0, 10);
const int = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const text = (s) => (s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const PROVINCES = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const LONG = { 서울특별시: "서울", 경기도: "경기", 인천광역시: "인천", 부산광역시: "부산", 대구광역시: "대구", 대전광역시: "대전", 광주광역시: "광주", 울산광역시: "울산", 세종특별자치시: "세종", 강원도: "강원", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주" };
function fromAddress(addr) {
  const t = (addr || "").trim().split(/\s+/);
  const p = LONG[t[0]] || (PROVINCES.includes(t[0]) ? t[0] : null);
  return p ? { province: p, district: t[1] || null, region: [p, t[1]].filter(Boolean).join(" ") } : null;
}
const fromLabel = guessArea;
const DELIVERY = { province: "전국", district: null, region: "전국 배송" };

// ── 레뷰 ── api.weble.net 목록 API. 페이지가 보낸 인증 헤더를 그대로 쓴다.
export async function revu(ctx, today) {
  const page = await ctx.newPage();
  const reqP = page.waitForRequest((r) => r.url().includes("api.weble.net/v1/campaigns"), { timeout: 60000 });
  await page.goto("https://www.revu.net/category/%EC%A7%80%EC%97%AD", { waitUntil: "domcontentloaded", timeout: 60000 });
  if (page.url().includes("/login")) throw new LoginRequiredError("레뷰 로그인이 풀렸어요");
  const first = await reqP;
  const auth = (await first.allHeaders()).authorization;
  if (!auth) throw new LoginRequiredError("레뷰 로그인이 풀렸어요");
  const base = new URL(first.url());
  const out = new Map();
  for (const cat of ["지역", "제품", "기자단"]) {
    for (let p = 1; p <= 200; p++) {
      base.searchParams.set("cat", cat);
      base.searchParams.set("page", String(p));
      base.searchParams.set("limit", "50");
      await sleep(DELAY_MS);
      const res = await ctx.request.get(base.href, { headers: { authorization: auth, referer: "https://www.revu.net/" } });
      if (res.status() === 401) throw new LoginRequiredError("레뷰 로그인이 풀렸어요");
      if (!res.ok()) throw new Error(`레뷰 HTTP ${res.status()}`);
      const j = await res.json();
      for (const x of j.items || []) {
        if (x.status && x.status !== "REQUEST") continue;
        const cats = x.category || [];
        const type = cats.some((c) => /방문/.test(c)) ? "방문" : cats.some((c) => /배송|구매/.test(c)) || cat === "제품" ? "배송" : cat === "기자단" ? "기자단" : "기타";
        const area = type === "배송" ? DELIVERY : fromAddress(x.venue?.addressFirst) || fromLabel(/^\[([^\]]+)\]/.exec(x.item || "")?.[1]);
        const sub = cats.find((c) => ["맛집", "뷰티"].includes(c));
        out.set(x.id, {
          id: `revu-${x.id}`, platform: "revu", title: x.item || x.title, url: `https://www.revu.net/campaign/${x.id}`,
          category: sub || guessCategory(type, x.item || ""), type, ...area,
          imageUrl: x.thumbnail || null,
          channel: { blog: "블로그", instagram: "인스타그램", youtube: "유튜브", clip: "클립", reels: "릴스" }[x.media] || null,
          reward: x.brief || (x.campaignData?.point ? `${Number(x.campaignData.point).toLocaleString("ko-KR")} 포인트` : null),
          endDate: x.requestEndedOn || null,
          applicantCount: x.campaignStats?.requestCount ?? null, selectionCount: x.reviewerLimit ?? null,
        });
      }
      if (!j.items?.length || p * 50 >= (j.total || 0)) break;
    }
  }
  await page.close();
  return [...out.values()];
}

// ── 미블 ── /xhr/campaigns 가 목록 HTML 조각을 준다. CSRF 토큰 때문에 페이지 안에서 요청한다.
export async function mible(ctx, today) {
  const page = await ctx.newPage();
  await page.goto("https://www.mrblog.net/campaigns", { waitUntil: "domcontentloaded", timeout: 60000 });
  if (page.url().includes("/login")) throw new LoginRequiredError("미블 로그인이 풀렸어요");
  const out = new Map();
  for (let p = 1; p <= 300; p++) {
    await sleep(DELAY_MS);
    const r = await page.evaluate(async (pg) => {
      const tok = document.querySelector('meta[name="csrf-token"]')?.content || "";
      const res = await fetch(`/xhr/campaigns?type=all&page=${pg}&category=&order_by=1&is_instagram%5B0%5D=0&is_instagram%5B1%5D=1&is_premium=&category_seq=`,
        { headers: { "X-Requested-With": "XMLHttpRequest", "X-CSRF-TOKEN": tok } });
      return { status: res.status, body: await res.text() };
    }, p);
    if (r.status === 401 || r.status === 419) throw new LoginRequiredError("미블 로그인이 풀렸어요");
    if (r.status !== 200) throw new Error(`미블 HTTP ${r.status}`);
    const j = JSON.parse(r.body);
    const items = (j.html || "").split(/<li>/).slice(1);
    if (!items.length) break;
    for (const li of items) {
      const id = /\/campaigns\/(\d+)/.exec(li)?.[1];
      if (!id) continue;
      const dday = text(/class="d_day">([\s\S]*?)<\/span>/.exec(li)?.[1]);
      if (/마감|종료/.test(dday) && !/오늘/.test(dday)) continue;
      const areaRaw = text(/class="area">([\s\S]*?)<\/span>\s*<strong/.exec(li)?.[1]);
      const sns = [...li.matchAll(/sns_icon ([a-z_]+)/g)].map((m) => m[1]);
      const prefix = /^(릴스|클립)\s/.exec(areaRaw)?.[1];
      const isDelivery = /배송|재택|택배|전국/.test(areaRaw);
      const type = isDelivery ? "배송" : "방문";
      const title = text(/class="subject">([\s\S]*?)<\/strong>/.exec(li)?.[1]);
      const n = int(dday);
      out.set(id, {
        id: `mible-${id}`, platform: "mible", title, url: `https://www.mrblog.net/campaigns/${id}`,
        category: guessCategory(type, `${title} ${text(/class="desc">([\s\S]*?)<\/p>/.exec(li)?.[1])}`), type, ...(isDelivery ? DELIVERY : fromLabel(areaRaw)),
        imageUrl: (/<img src="([^"]+)"/.exec(li)?.[1] || "").replace(/^http:/, "https:") || null,
        channel: prefix || sns.map((s) => ({ blog: "블로그", insta: "인스타그램", instagram: "인스타그램", reels: "릴스", clip: "클립", youtube: "유튜브" }[s])).filter(Boolean).join(" · ") || null,
        reward: text(/class="desc">([\s\S]*?)<\/p>/.exec(li)?.[1]) || null,
        endDate: /오늘/.test(dday) ? today : n != null ? addDays(today, n) : null,
        applicantCount: int(/신청\s*<strong>([\d,]+)/.exec(li)?.[1]), selectionCount: int(/모집\s*([\d,]+)\s*명/.exec(li)?.[1]),
      });
    }
  }
  await page.close();
  return [...out.values()];
}

export const LOGIN_COLLECTORS = {
  revu: { name: "레뷰", url: "https://www.revu.net/", run: revu },
  mible: { name: "미블", url: "https://www.mrblog.net/campaigns", run: mible },
};

// 한 번에 실행: 브라우저를 열고 두 사이트를 차례로 수집
export async function runLoginCollectors(today, log = console.log) {
  const results = {}, status = {};
  let ctx;
  try {
    ctx = await openBrowser({ headless: true });
  } catch (err) {
    for (const id of Object.keys(LOGIN_COLLECTORS)) status[id] = { status: "error", error: `브라우저를 열지 못했어요: ${err.message}` };
    return { results, status };
  }
  for (const [id, c] of Object.entries(LOGIN_COLLECTORS)) {
    try {
      results[id] = await c.run(ctx, today);
      status[id] = { status: "success", records: results[id].length, lastSyncAt: new Date().toISOString() };
      log(`로그인 수집 ${c.name}: ${results[id].length}개`);
    } catch (err) {
      status[id] = { status: err instanceof LoginRequiredError ? "login_required" : "error", error: err.message };
      log(`로그인 수집 실패 ${c.name}: ${err.message}${err instanceof LoginRequiredError ? " — npm run login 으로 다시 로그인해 주세요" : ""}`);
    }
  }
  await ctx.close();
  return { results, status };
}
