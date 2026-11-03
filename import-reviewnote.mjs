// 리뷰노트 수동 가져오기. 자동으로 페이지를 넘기지 않는다.
// 사용법: npm run import:reviewnote
//   → 열린 창에서 리뷰노트 캠페인 목록을 직접 넘겨 보면, 화면에 불러온 목록만 기록한다.
//   → 다 봤으면 창을 닫는다. 결과는 data/manual/reviewnote.json 에 합쳐진다.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openBrowser } from "./browser.mjs";
import { parseReviewnote } from "./reviewnote-parse.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "data", "manual");
const RAW = join(DIR, "raw");
await mkdir(RAW, { recursive: true });

const ctx = await openBrowser({ headless: false });
const page = ctx.pages()[0] || (await ctx.newPage());
const captured = [];
ctx.on("response", async (res) => {
  const url = res.url();
  if (!/reviewnote/.test(new URL(url).hostname)) return;
  const ct = res.headers()["content-type"] || "";
  if (!/json|text\/x-component|text\/html/.test(ct)) return;
  try { captured.push({ url, ct, body: await res.text() }); } catch {}
});
await page.goto("https://www.reviewnote.co.kr/campaigns");
console.log("리뷰노트 목록을 직접 넘겨 보세요 (지역·배송 탭, 스크롤 등). 다 봤으면 창을 닫아 주세요.");
await new Promise((resolve) => ctx.on("close", resolve));

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(join(RAW, `${stamp}.json`), JSON.stringify(captured));

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const found = parseReviewnote(captured, today);
let saved = {};
try { saved = JSON.parse(await readFile(join(DIR, "reviewnote.json"), "utf8")); } catch {}
const items = { ...(saved.items || {}) };
for (const c of found) items[c.id] = { ...c, importedAt: today };
// 마감 지난 건 정리
for (const [id, c] of Object.entries(items)) if (c.endDate && c.endDate < today) delete items[id];
await writeFile(join(DIR, "reviewnote.json"), JSON.stringify({ updatedAt: new Date().toISOString(), items }));
console.log(`이번에 본 캠페인 ${found.length}개를 가져왔어요. 저장된 리뷰노트 캠페인은 모두 ${Object.keys(items).length}개예요.`);
console.log("사이트에 올리려면: .\\sync-and-push.ps1  (또는 다음 날 오전 8시 자동 반영)");
