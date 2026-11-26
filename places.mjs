// 캠페인별 정확한 위치. 상세 페이지를 한 번만 읽고 data/places.json 에 저장해 두어, 매일은 새 캠페인만 읽는다.
//  - 디너의여왕·뷰티의여왕·놀러와체험단: 상세 페이지 지도 좌표(kakao LatLng)
//  - 서울오빠: 상세 페이지의 lat / lon 값
//  - 강남맛집: 상세 페이지 주소 → OpenStreetMap 으로 위치 찾기 (못 찾으면 동 단위)
//  - 레뷰: 목록에 좌표가 있어 수집기가 바로 넣는다
//  - 리뷰노트·미블: 공개 목록에 위치가 없어 동네 단위로 둔다 (geo.mjs)
import { readFile, writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 campaign-moa-sync";
const GEO_UA = "campaign-moa/1.0 (+https://github.com/hellogit4512/campaign-moa)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KAKAO_DEFAULT = "33.450701"; // 카카오 지도 예제 기본값(제주) — 실제 위치가 아님
const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132;
const round = (n) => Math.round(n * 1e5) / 1e5;

function fromLatLng(html) {
  for (const m of html.matchAll(/LatLng\(\s*(3[3-8]\.\d+)\s*,\s*(12[4-9]\.\d+)/g)) {
    if (m[1].startsWith(KAKAO_DEFAULT)) continue;
    return [round(+m[1]), round(+m[2])];
  }
  return null;
}
function fromLatLon(html) {
  const lat = /\blat["'\s:=]+["']?(3[3-8]\.\d{4,})/i.exec(html)?.[1];
  const lon = /\b(?:lon|lng)["'\s:=]+["']?(12[4-9]\.\d{4,})/i.exec(html)?.[1];
  return lat && lon ? [round(+lat), round(+lon)] : null;
}

async function nominatim(q) {
  await sleep(1100);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": GEO_UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const j = await res.json();
  return j[0] ? [round(+j[0].lat), round(+j[0].lon)] : null;
}
// "서울 송파구 송파동 131" → 그대로, 안 되면 번지 빼고 "서울 송파구 송파동"
async function geocodeAddress(addr, cache) {
  const key = `addr:${addr}`;
  if (key in cache) return cache[key];
  const tries = [addr, addr.replace(/\s+[\d-]+(\s.*)?$/, ""), addr.replace(/\s+\S+$/, "")].filter((v, i, a) => v && a.indexOf(v) === i);
  let hit = null;
  for (const q of tries) if ((hit = await nominatim(q))) break;
  cache[key] = hit;
  return hit;
}

const DETAIL = {
  dinnerqueen: (html) => fromLatLng(html),
  bqueens: (html) => fromLatLng(html),
  cometoplay: (html) => fromLatLng(html),
  seoulouba: (html) => fromLatLon(html),
  gangnam: async (html, geoCache) => {
    const addr = /loca\s*=\s*["']([^"']{5,})["']/.exec(html)?.[1]?.trim()
      || /((?:서울|경기|인천)[가-힣]*\s[가-힣]+(?:시|군|구)\s[^<>"'\t\r\n]{3,60})/.exec(html)?.[1]?.trim();
    return addr ? geocodeAddress(addr.replace(/\s+/g, " "), geoCache) : null;
  },
};

// rows 중 위치를 아는 캠페인에 lat/lng/exact 를 붙인다. maxFetch 만큼만 새 상세 페이지를 읽는다.
export async function addPlaces(rows, placesPath, geoCachePath, { maxFetch = 900, prune = true, log = console.log } = {}) {
  let places = {}, geoCache = {};
  try { places = JSON.parse(await readFile(placesPath, "utf8")); } catch {}
  try { geoCache = JSON.parse(await readFile(geoCachePath, "utf8")); } catch {}
  let fetched = 0, found = 0;
  const todo = rows.filter((r) => DETAIL[r.platform] && !(r.id in places) && r.url);
  for (const r of todo) {
    if (fetched >= maxFetch) break;
    try {
      await sleep(350);
      fetched++;
      const res = await fetch(r.url, { headers: { "User-Agent": UA } });
      if (!res.ok) { places[r.id] = 0; continue; }
      const hit = await DETAIL[r.platform](await res.text(), geoCache);
      places[r.id] = hit && inKorea(hit[0], hit[1]) ? hit : 0;
      if (places[r.id]) found++;
    } catch (err) {
      if (/Nominatim/.test(err.message)) { log(`주소 위치 찾기 중단: ${err.message}`); break; }
    }
    // 중간에 끊겨도 진행분이 남도록 200개마다 저장
    if (fetched % 200 === 0) { await writeFile(placesPath, JSON.stringify(places)); await writeFile(geoCachePath, JSON.stringify(geoCache)); }
  }
  // 목록에서 사라진 캠페인 기록은 정리 (rows 가 전체 목록일 때만)
  if (prune) {
    const alive = new Set(rows.map((r) => r.id));
    for (const id of Object.keys(places)) if (!alive.has(id)) delete places[id];
  }
  await writeFile(placesPath, JSON.stringify(places));
  await writeFile(geoCachePath, JSON.stringify(geoCache));
  if (fetched) log(`정확한 위치: 새로 ${fetched}곳 확인, ${found}곳 찾음 (남은 ${Math.max(0, todo.length - fetched)}곳은 다음 실행 때)`);
  for (const r of rows) {
    const p = places[r.id];
    if (p) { r.lat = p[0]; r.lng = p[1]; r.exact = 1; }
    else if (r.lat != null && r.lng != null) r.exact = 1; // 레뷰처럼 수집기가 좌표를 준 경우
  }
}
