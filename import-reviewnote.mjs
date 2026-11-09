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
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

let ctx;
try {
  ctx = await openBrowser({ headless: false });
} catch (err) {
  console.log("수집용 크롬 창을 열지 못했어요.");
  console.log("- 이미 열린 수집용 크롬 창(로그인 창, 가져오기 창)이 있으면 닫고 다시 실행해 주세요.");
  console.log("- 오전 8시 자동 수집이 도는 중이면 15분쯤 뒤에 다시 실행해 주세요.");
  console.log(`(자세한 오류: ${err.message.split("\n")[0]})`);
  process.exit(1);
}
const page = ctx.pages()[0] || (await ctx.newPage());
const captured = [];
let listResponses = 0, loggedOut = false;
const ids = new Set();
ctx.on("response", async (res) => {
  const url = res.url();
  if (!/reviewnote/.test(new URL(url).hostname)) return;
  const ct = res.headers()["content-type"] || "";
  if (!/json|text\/x-component|text\/html/.test(ct)) return;
  let body;
  try { body = await res.text(); } catch { return; }
  captured.push({ url, ct, body });
  if (url.includes("/api/v2/currentUser") && (res.status() === 401 || body.trim() === "null")) loggedOut = true;
  if (url.includes("/api/v2/campaigns")) {
    listResponses++;
    for (const c of parseReviewnote([{ url, body }], today)) ids.add(c.id);
    process.stdout.write(`\r지금까지 모집 중인 캠페인 ${ids.size}개를 기록했어요   `);
  }
});
await page.goto("https://www.reviewnote.co.kr/campaigns").catch(() => {});
console.log("리뷰노트 목록을 최신순으로 바꾸고 아래로 스크롤해 주세요. 다 봤으면 창을 닫아 주세요.");
await new Promise((resolve) => ctx.on("close", resolve));
console.log("");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(join(RAW, `${stamp}.json`), JSON.stringify(captured));

const found = parseReviewnote(captured, today);
if (!found.length) {
  console.log("이번에는 캠페인을 하나도 기록하지 못했어요. 저장된 목록은 그대로 뒀어요.");
  if (!listResponses) console.log("- 목록이 한 번도 불러와지지 않았어요. 창에서 캠페인 목록 화면이 떴는지, 스크롤을 했는지 확인해 주세요.");
  else console.log("- 목록은 불러왔는데 모집 중인 캠페인이 없었어요. 리뷰노트 화면 구조가 바뀌었을 수 있어요.");
  if (loggedOut) console.log("- 리뷰노트 로그인이 풀려 있었어요. 창에서 로그인한 뒤 다시 둘러봐 주세요.");
  process.exit(1);
}
let saved = {};
try { saved = JSON.parse(await readFile(join(DIR, "reviewnote.json"), "utf8")); } catch {}
const items = { ...(saved.items || {}) };
for (const c of found) items[c.id] = { ...c, importedAt: today };
// 마감 지난 건 정리
for (const [id, c] of Object.entries(items)) if (c.endDate && c.endDate < today) delete items[id];
await writeFile(join(DIR, "reviewnote.json"), JSON.stringify({ updatedAt: new Date().toISOString(), items }));
console.log(`이번에 본 캠페인 ${found.length}개를 가져왔어요. 저장된 리뷰노트 캠페인은 모두 ${Object.keys(items).length}개예요.`);
console.log("사이트에 바로 올리려면: .\\sync-and-push.ps1  (그냥 두면 다음 날 오전 8시에 반영돼요)");
