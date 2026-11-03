@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 캠페인 목록을 새로 받는 중...
node fetch-campaigns.mjs
echo.
echo 사이트를 엽니다: http://localhost:5180  (끄려면 이 창을 닫으세요)
start "" http://localhost:5180
npx -y http-server@14.1.1 -p 5180 -c-1 --silent
