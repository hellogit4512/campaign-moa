// 지도용 좌표. 캠페인 목록에는 정확한 주소가 거의 없어서 "서울 마포구", "경기 고양" 같은 동네 단위로 위치를 잡는다.
// OpenStreetMap Nominatim(무료)으로 찾고 data/geo-cache.json 에 저장해 두어, 같은 동네는 다시 묻지 않는다.
// Nominatim 이용 규칙: 1초에 1번 이하, 앱 이름이 담긴 User-Agent, 결과 캐시.
import { readFile, writeFile } from "node:fs/promises";

const UA = "campaign-moa/1.0 (+https://github.com/hellogit4512/campaign-moa)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FULL = { 서울: "서울특별시", 경기: "경기도", 인천: "인천광역시", 부산: "부산광역시", 대구: "대구광역시", 대전: "대전광역시", 광주: "광주광역시", 울산: "울산광역시", 세종: "세종특별자치시", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도" };

async function search(q) {
  await sleep(1100);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const j = await res.json();
  return j[0] ? [Math.round(Number(j[0].lat) * 1e5) / 1e5, Math.round(Number(j[0].lon) * 1e5) / 1e5] : null;
}

// "경기 고양" → "경기도 고양시", "서울 잠실역" → "서울특별시 잠실역" 순으로 몇 가지를 시도
function queries(province, district) {
  const p = FULL[province] || province;
  const d = (district || "").replace(/\s+/g, " ").trim();
  if (!d) return [p];
  const out = [`${p} ${d}`];
  if (!/[시군구동읍면리역]$/.test(d)) out.push(`${p} ${d}시`, `${p} ${d}구`);
  out.push(d);
  return out;
}

// rows: { province, district } 객체 배열. 좌표를 lat/lng 로 붙인다. maxLookups 만큼만 새로 묻는다.
export async function addCoords(rows, cachePath, { maxLookups = 400, log = console.log } = {}) {
  let cache = {};
  try { cache = JSON.parse(await readFile(cachePath, "utf8")); } catch {}
  const keyOf = (r) => `${r.province || ""}|${r.district || ""}`;
  const missing = [...new Set(rows.filter((r) => !r.exact && r.province && r.province !== "전국").map(keyOf))].filter((k) => !(k in cache));
  let looked = 0;
  for (const k of missing) {
    if (looked >= maxLookups) break;
    const [province, district] = k.split("|");
    let hit = null;
    try {
      for (const q of queries(province, district)) { looked++; if ((hit = await search(q))) break; }
    } catch (err) { log(`위치 찾기 중단: ${err.message}`); break; }
    // 동네를 못 찾으면 시·도 중심이라도 쓴다
    if (!hit && district) hit = cache[`${province}|`] || (await search(FULL[province] || province).catch(() => null));
    cache[k] = hit;
  }
  if (looked) log(`위치 새로 찾음: ${looked}번 조회 (남은 동네 ${Math.max(0, missing.length - looked)}곳)`);
  await writeFile(cachePath, JSON.stringify(cache));
  for (const r of rows) {
    if (r.exact) continue; // 상세 페이지 등에서 정확한 좌표를 이미 받은 캠페인
    const c = cache[keyOf(r)];
    r.lat = c?.[0] ?? null;
    r.lng = c?.[1] ?? null;
  }
}
