// 수집 전용 크롬 창을 열어 레뷰·미블에 직접 로그인해 두는 스크립트.
// 사용법: npm run login  → 열린 창에서 두 사이트에 로그인한 뒤 창을 닫으면 끝.
import { openBrowser } from "./browser.mjs";

const ctx = await openBrowser({ headless: false });
const pages = ctx.pages();
const first = pages[0] || (await ctx.newPage());
await first.goto("https://www.revu.net/login");
const second = await ctx.newPage();
await second.goto("https://www.mrblog.net/login");
console.log("열린 창에서 레뷰와 미블에 로그인한 뒤, 창을 닫아 주세요.");
await new Promise((resolve) => ctx.on("close", resolve));
console.log("로그인 정보를 저장했어요.");
