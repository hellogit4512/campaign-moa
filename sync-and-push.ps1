# 이 PC에서 목록을 수집해 GitHub에 올립니다 (작업 스케줄러가 매일 실행).
# GitHub Actions 는 데일리뷰·포블로그에 접속이 막혀 있어서, PC가 켜져 있는 날은 이 결과로 덮어씁니다.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "data\sync.log"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -FilePath $log -Append -Encoding utf8 }

try {
    git pull --ff-only origin main 2>&1 | Out-Null
    node fetch-campaigns.mjs 2>&1 | ForEach-Object { Log $_ }
    git add data/campaigns.json data/first-seen.json
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        git commit -m "캠페인 목록 갱신 $(Get-Date -Format 'yyyy-MM-dd') (PC 수집)" 2>&1 | Out-Null
        git push origin main 2>&1 | ForEach-Object { Log $_ }
    }
    Log "완료"
} catch {
    Log "실패: $_"
    exit 1
}
