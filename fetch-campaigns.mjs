// 체험모아 데이터 수집 스크립트 — 하루 한 번 실행
// 사용법: node fetch-campaigns.mjs
// 결과: data/campaigns.json (마감 지난 캠페인 제외, 화면에 필요한 필드만)
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_COLLECTORS } from "./collectors.mjs";
import { MORE_COLLECTORS } from "./collectors-more.mjs";

const API = "https://campaign-moa.greenorbit3.chatgpt.site/api/campaigns?format=compact";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const REWARD_MAX = 140;
// 사이트에서 빼는 플랫폼
const EXCLUDED = new Set(["reviewmaker", "thereview", "reviewnavi", "reviewus", "modumoyeo", "popomon", "storyn", "reviewwave"]);

// KST 기준 오늘 날짜 (YYYY-MM-DD)
const todayKST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function fetchWithRetry(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 campaign-moa-sync" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries) throw err;
      console.warn(`요청 실패 (${i}/${tries}): ${err.message} — 10초 후 재시도`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

// 원래 사이트 서버는 보조 자료. 응답이 없어도 직접 수집한 목록으로 계속 진행한다
let src;
try {
  src = await fetchWithRetry(API);
} catch (err) {
  console.warn(`원래 사이트 서버 응답 없음: ${err.message} — 직접 수집한 목록만 사용`);
  src = { fields: ["id", "platform"], rows: [], sources: [], generatedAt: null };
}
const at = Object.fromEntries(src.fields.map((f, i) => [f, i]));

// 출력 필드 순서 — index.html 은 fields 로 위치를 찾는다
const FIELDS = ["id", "platform", "title", "url", "category", "type", "province", "district",
  "region", "imageUrl", "channel", "reward", "endDate", "applicantCount", "selectionCount", "createdAt"];

// 처음 본 날짜 기록 (직접 수집한 캠페인의 "새로 등록" 판단용)
const firstSeenPath = join(OUT_DIR, "first-seen.json");
const firstSeen = await readJSON(firstSeenPath, {});

// 서버 수집이 멈춘 플랫폼은 이 PC에서 직접 수집한다. 실패하면 서버 목록을 그대로 쓴다.
const local = {};
const localStatus = {};
const DIRECT = { ...LOCAL_COLLECTORS, ...MORE_COLLECTORS };
for (const [id, c] of Object.entries(DIRECT)) {
  try {
    const list = await c.run(todayKST);
    // 0개면 사이트 구조가 바뀌었을 가능성이 커서 실패로 본다 (지난 결과나 서버 목록을 대신 씀)
    if (!list.length) throw new Error("가져온 캠페인이 0개");
    local[id] = list;
    localStatus[id] = { status: "success", records: list.length, lastSyncAt: new Date().toISOString(), url: c.url, name: c.name };
    console.log(`직접 수집 ${c.name}: ${local[id].length}개`);
  } catch (err) {
    localStatus[id] = { status: "error", error: err.message };
    console.warn(`직접 수집 실패 ${c.name}: ${err.message} — 서버 목록 사용`);
  }
}
// 레뷰·미블은 로그인한 크롬 프로필이 있는 PC에서만 수집한다 (GitHub Actions 에서는 건너뜀)
if (!process.env.MOA_NO_LOGIN && existsSync(join(dirname(fileURLToPath(import.meta.url)), "browser-profile"))) {
  const { runLoginCollectors, LOGIN_COLLECTORS } = await import("./collectors-login.mjs");
  const { results, status } = await runLoginCollectors(todayKST);
  Object.assign(local, results);
  for (const [id, s] of Object.entries(status)) localStatus[id] = { ...s, url: LOGIN_COLLECTORS[id].url, name: LOGIN_COLLECTORS[id].name };
}
// 리뷰노트는 직접 둘러보며 가져온 목록(npm run import:reviewnote)을 쓴다
const manual = await readJSON(join(OUT_DIR, "manual", "reviewnote.json"), null);
if (manual?.items) {
  local.reviewnote = Object.values(manual.items);
  localStatus.reviewnote = { status: "success", records: local.reviewnote.length, lastSyncAt: manual.updatedAt, url: "https://www.reviewnote.co.kr/campaigns", method: "manual", name: "리뷰노트" };
  console.log(`수동 가져오기 리뷰노트: ${local.reviewnote.length}개 (${manual.updatedAt.slice(0, 10)})`);
}

// 이번에 직접 수집하지 못한 플랫폼(예: GitHub Actions 에서 도는 레뷰·미블·데일리뷰·포블로그)은
// 지난번 PC 수집 결과가 3일 이내면 서버의 옛 목록 대신 그걸 이어 쓴다
const prev = await readJSON(join(OUT_DIR, "campaigns.json"), null);
if (prev?.fields && prev.sources) {
  const pf = Object.fromEntries(prev.fields.map((k, i) => [k, i]));
  for (const s of prev.sources) {
    if (local[s.id] || s.method !== "local" || !s.lastSyncAt) continue;
    if (Date.now() - Date.parse(s.lastSyncAt) > 3 * 86400e3) continue;
    local[s.id] = prev.rows.filter((r) => r[pf.platform] === s.id).map((r) => Object.fromEntries(FIELDS.map((f) => [f, r[pf[f]] ?? null])));
    localStatus[s.id] = { status: "success", records: local[s.id].length, lastSyncAt: s.lastSyncAt, url: s.url, name: s.name };
    console.log(`지난 PC 수집 유지 ${s.name}: ${local[s.id].length}개 (${s.lastSyncAt.slice(0, 10)})`);
  }
}

const candidates = [];
for (const r of src.rows) {
  const platform = r[at.platform];
  if (EXCLUDED.has(platform) || local[platform]) continue;
  candidates.push(Object.fromEntries(FIELDS.map((f) => [f, r[at[f]] ?? null])));
}
for (const list of Object.values(local)) {
  for (const c of list) candidates.push({ ...c, createdAt: firstSeen[c.id] || todayKST });
}

const seen = new Set();
const rows = [];
for (const c of candidates) {
  if (c.endDate && c.endDate < todayKST) continue; // 마감 지난 캠페인 제외
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  if (local[c.platform] && !firstSeen[c.id]) firstSeen[c.id] = todayKST;
  rows.push(FIELDS.map((f) => {
    let v = c[f] ?? null;
    if (f === "reward" && typeof v === "string" && v.length > REWARD_MAX) v = v.slice(0, REWARD_MAX) + "…";
    if (f === "createdAt" && v) v = v.slice(0, 10);
    return v;
  }));
}

const sources = src.sources.filter((s) => !EXCLUDED.has(s.id)).map((s) => {
  const base = { id: s.id, name: s.name, url: s.url, status: s.status, records: s.recordsFound, lastSyncAt: s.lastSyncAt ?? null, method: s.collectionMethod };
  const l = localStatus[s.id];
  if (l?.status === "success") return { ...base, url: l.url || LOCAL_COLLECTORS[s.id].url, status: "success", records: l.records, lastSyncAt: l.lastSyncAt, method: l.method || "local" };
  if (l?.status === "login_required") return { ...base, status: "login_required" };
  return base;
});
// 서버 목록에 없는 플랫폼(서버가 응답하지 않은 날 등)도 수집 현황에 남긴다
for (const [id, l] of Object.entries(localStatus)) {
  if (EXCLUDED.has(id) || sources.some((s) => s.id === id) || l.status !== "success") continue;
  const old = prev?.sources?.find((s) => s.id === id);
  sources.push({ id, name: l.name || old?.name || id, url: l.url || old?.url || null, status: "success", records: l.records, lastSyncAt: l.lastSyncAt, method: l.method || "local" });
}

const out = {
  syncedAt: new Date().toISOString(),
  sourceGeneratedAt: src.generatedAt,
  today: todayKST,
  fields: FIELDS,
  sources,
  rows,
};

await mkdir(OUT_DIR, { recursive: true });
const tmp = join(OUT_DIR, "campaigns.json.tmp");
await writeFile(tmp, JSON.stringify(out));
await rename(tmp, join(OUT_DIR, "campaigns.json"));
// 90일 넘게 안 보인 기록은 정리
const keepAfter = new Date(Date.parse(todayKST) - 90 * 86400e3).toISOString().slice(0, 10);
for (const [id, d] of Object.entries(firstSeen)) if (d < keepAfter && !seen.has(id)) delete firstSeen[id];
await writeFile(firstSeenPath, JSON.stringify(firstSeen));

const stale = sources.filter((s) => s.lastSyncAt && (Date.now() - Date.parse(s.lastSyncAt)) > 3 * 86400e3);
console.log(`완료: 진행 중 ${rows.length}개 저장 (${todayKST})`);
if (stale.length) console.log(`3일 넘게 갱신 안 된 플랫폼: ${stale.map((s) => s.name).join(", ")}`);
