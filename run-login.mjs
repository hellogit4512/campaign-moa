// 레뷰·미블 로그인 수집만 따로 돌리는 작은 프로그램.
// fetch-campaigns.mjs 가 이걸 별도 콘솔(분리된 프로세스)로 실행한다. 크롬이 닫히거나 죽을 때 보내는
// 종료 신호가 매일 수집 전체를 끄는 일이 있어서, 크롬을 본 작업과 떼어 놓기 위함이다.
// 사용법: node run-login.mjs <결과를 쓸 json 경로> <YYYY-MM-DD>
import { writeFile } from "node:fs/promises";
import { runLoginCollectors } from "./collectors-login.mjs";

const [out, today] = process.argv.slice(2);
const logs = [];
const { results, status } = await runLoginCollectors(today, (m) => logs.push(m));
await writeFile(out, JSON.stringify({ results, status, logs }));
process.exit(0);
