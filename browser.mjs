// 레뷰·미블 수집에 쓰는 전용 크롬 프로필. 로그인 쿠키가 browser-profile/ 에 남는다 (git 에 올리지 않음).
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_DIR = join(dirname(fileURLToPath(import.meta.url)), "browser-profile");

function chromePath() {
  const candidates = [
    join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("크롬(또는 엣지)을 찾지 못했어요.");
  return found;
}

export function openBrowser({ headless = true } = {}) {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: chromePath(),
    headless,
    viewport: headless ? { width: 1280, height: 900 } : null,
    locale: "ko-KR",
    args: ["--disable-blink-features=AutomationControlled"],
  });
}
