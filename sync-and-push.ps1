﻿# 이 PC에서 목록을 수집해 GitHub에 올립니다 (작업 스케줄러가 매일 실행).
# GitHub Actions 는 데일리뷰·포블로그에 접속이 막혀 있어서, PC가 켜져 있는 날은 이 결과로 덮어씁니다.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "data\sync.log"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -FilePath $log -Append -Encoding utf8 }
# git·node 는 진행 메시지를 stderr 로 내보내므로 종료 코드로만 성공 여부를 본다
function Run([string]$label, [scriptblock]$cmd) {
    & $cmd 2>&1 | ForEach-Object { Log "  $_" }
    if ($LASTEXITCODE -ne 0) { Log "실패: $label (종료 코드 $LASTEXITCODE)"; exit 1 }
}

Log "시작"
# GitHub Actions 가 그사이 올린 목록 커밋이 있어도 멈추지 않게 rebase 로 받는다 (목록 파일은 어차피 새로 만든다)
Run "pull" { git pull --rebase -X theirs origin main }
Run "수집" { node fetch-campaigns.mjs }
Run "add" { git add data/campaigns.json data/first-seen.json }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    $msg = "캠페인 목록 갱신 $(Get-Date -Format 'yyyy-MM-dd') (PC 수집)"
    Run "commit" { git commit -m $msg }
    # 수집하는 20분 사이에 Actions 가 먼저 올렸으면 push 가 거절되므로, 한 번 더 받아서 다시 올린다
    git push origin main 2>&1 | ForEach-Object { Log "  $_" }
    if ($LASTEXITCODE -ne 0) {
        Run "pull (재시도)" { git pull --rebase -X theirs origin main }
        Run "push" { git push origin main }
    }
}
Log "완료"
