// 리뷰노트 화면이 불러온 /api/v2/campaigns 응답에서 모집 중인 캠페인을 뽑는다.
import { category as guessCategory } from "./collectors.mjs";

const IMG = "https://img.reviewnote.cloud/cdn-cgi/image/width=640,quality=60,format=auto,fit=scale-down/https://firebasestorage.googleapis.com/v0/b/reviewnote-e92d9.appspot.com/o/";
const TYPE = { VISIT: "방문", TAKEOUT: "방문", TODAY: "방문", DELIVERY: "배송", PAYBACK: "배송", REPORTER: "기자단" };
const CHANNEL = { BLOG: "블로그", BLOG_CLIP: "블로그 · 클립", CLIP: "클립", INSTAGRAM: "인스타그램", REELS: "릴스", SHORTS: "유튜브", YOUTUBE: "유튜브" };
const CITY = { 서울: "서울", 경기: "경기", 인천: "인천", 부산: "부산", 대구: "대구", 대전: "대전", 광주: "광주", 울산: "울산", 세종: "세종", 강원: "강원", 충북: "충북", 충남: "충남", 전북: "전북", 전남: "전남", 경북: "경북", 경남: "경남", 제주: "제주" };

// UTC 마감 시각을 KST 날짜로
const kstDate = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10) : null);

export function parseReviewnote(captured, today) {
  const out = new Map();
  for (const r of captured) {
    if (!r.url.includes("/api/v2/campaigns")) continue;
    let j; try { j = JSON.parse(r.body); } catch { continue; }
    for (const x of j.objects || []) {
      if (x.status !== "SELECT") continue; // 모집 중만
      const end = kstDate(x.applyEndAt);
      if (end && end < today) continue;
      const type = TYPE[x.sort] || (x.city === "재택" || x.city === "전국" ? "배송" : "기타");
      const province = CITY[x.city] || null;
      const area = type === "배송" || x.city === "재택" || x.city === "전국"
        ? { province: "전국", district: null, region: "전국 배송" }
        : { province, district: x.sido?.name || null, region: [province, x.sido?.name].filter(Boolean).join(" ") || null };
      const cat = x.category?.title;
      out.set(x.id, {
        id: `reviewnote-${x.id}`, platform: "reviewnote", title: x.title, url: `https://www.reviewnote.co.kr/campaigns/${x.id}`,
        category: ["맛집", "뷰티", "제품"].includes(cat) ? cat : guessCategory(type === "기타" ? "방문" : type, `${x.title} ${x.offer || ""}`),
        type, ...area,
        imageUrl: x.imageKey ? IMG + encodeURIComponent(x.imageKey) + "?alt=media" : null,
        channel: CHANNEL[x.channel] || null, reward: x.offer || null, endDate: end,
        applicantCount: x.applicantCount ?? null, selectionCount: x.infNum ?? null,
      });
    }
  }
  return [...out.values()];
}
