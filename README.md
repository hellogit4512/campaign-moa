# 체험모아

블로그 체험단 모집을 한곳에 모아 보는 사이트입니다.

## 파일
- `index.html` — 사이트 화면 (탐색, 필터, 내 체험 관리)
- `fetch-campaigns.mjs` — 캠페인 목록을 받아 `data/campaigns.json`으로 저장 (마감 지난 건 제외, 리뷰메이커·더리뷰·리뷰나비·리뷰어스·모두모여체험단 제외)
- `collectors.mjs` — 서버 수집이 멈춘 데일리뷰·포블로그를 직접 수집 (실패하면 서버 목록 사용)
- `collectors-login.mjs` — 레뷰·미블을 로그인한 전용 크롬으로 수집
- `sync-and-push.ps1` — 수집 후 GitHub에 올림 (작업 스케줄러가 매일 오전 8시 실행)
- `register-daily.ps1` — 작업 스케줄러에 매일 오전 8시 등록
- `.github/workflows/daily-sync.yml` — GitHub에 올렸을 때 매일 오전 7시에 자동 수집

## 실행
    node fetch-campaigns.mjs        # 목록 새로 받기
    npx http-server@14.1.1 -p 5180  # http://localhost:5180 에서 보기

## 레뷰·미블 (로그인 수집)
- 처음 한 번, 또는 수집 로그(data/sync.log)에 "다시 로그인"이 보이면: `npm run login` → 열린 창에서 두 사이트에 로그인하고 창 닫기
- 로그인 정보는 `browser-profile/` 에만 저장되고 GitHub에는 올라가지 않아요
- 이 PC가 매일 오전 8시에 수집해서 올려요. PC가 꺼진 날은 최근 3일 안의 수집 결과를 그대로 유지해요

## 수집하지 않는 플랫폼
- 리뷰노트, 포포몬: robots.txt가 캠페인 목록 수집을 막고 있어요
- 리뷰메이커, 더리뷰, 리뷰나비, 리뷰어스, 모두모여체험단: 사이트에서 뺐어요
