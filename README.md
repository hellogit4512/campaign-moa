# 체험모아

블로그 체험단 모집을 한곳에 모아 보는 사이트입니다.

## 파일
- `index.html` — 사이트 화면 (탐색, 필터, 내 체험 관리)
- `fetch-campaigns.mjs` — 캠페인 목록을 받아 `data/campaigns.json`으로 저장 (마감 지난 건 제외, 리뷰메이커·더리뷰·리뷰나비·리뷰어스·모두모여체험단 제외)
- `collectors.mjs` — 서버 수집이 멈춘 데일리뷰·포블로그를 이 PC에서 직접 수집 (실패하면 서버 목록 사용)
- `register-daily.ps1` — 이 PC에서 매일 오전 7시에 자동 수집 (Windows 작업 스케줄러)
- `.github/workflows/daily-sync.yml` — GitHub에 올렸을 때 매일 오전 7시에 자동 수집

## 실행
    node fetch-campaigns.mjs        # 목록 새로 받기
    npx http-server@14.1.1 -p 5180  # http://localhost:5180 에서 보기

## 직접 수집 못 하는 플랫폼
- 레뷰, 미블: 목록을 보려면 로그인이 필요해서 자동 수집이 안 돼요. 원래 사이트의 "내 브라우저 수집"으로 로그인한 크롬에서 가져와야 해요.
- 리뷰노트: robots.txt가 캠페인 경로(/campaigns/) 수집을 막고 있어요.
- 포포몬: robots.txt 제한.
