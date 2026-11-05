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

## 리뷰노트 (직접 둘러보며 가져오기)
- 리뷰노트는 robots.txt로 자동 수집을 막고 있어서, 직접 보면서 가져와요
- `npm run import:reviewnote` → 열린 창에서 최신순으로 정렬해 새 캠페인까지 스크롤 → 창 닫기
- 가져온 목록은 `data/manual/reviewnote.json`에 쌓이고, 마감된 건 자동으로 빠져요. 다음 날 오전 8시 업로드 때 반영돼요 (바로 올리려면 `.sync-and-push.ps1`)

## 수집하지 않는 플랫폼
- 포포몬, 리뷰메이커, 더리뷰, 리뷰나비, 리뷰어스, 모두모여체험단: 사이트에서 뺐어요

## 쿠팡 리뷰 작성기
- 주소: https://hellogit4512.github.io/campaign-moa/review-writer/ (PC에서는 `리뷰작성기.bat`으로도 열려요)
- 메모·별점·쿠팡 주문 상세(Ctrl+A, Ctrl+C로 복사해 붙여넣기)로 지시문을 만들어 복사하고, 무료 제미나이(gemini.google.com)를 열어 줘요
- 제미나이에 사진을 올리고 붙여넣으면 템플릿 섹션에 맞춰 제목·본문을 써 줘요. API 키·사용량 제한 없음
- 붙여넣은 배송 정보에서 이름·연락처·주소 줄은 지우고 지시문에 넣어요. 템플릿은 화면의 "템플릿 고치기"에서 바꿔요
