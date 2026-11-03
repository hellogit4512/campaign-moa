# 이 PC에서 매일 오전 8시에 수집 후 GitHub에 올리도록 Windows 작업 스케줄러에 등록합니다.
# 사용법: PowerShell에서  .\register-daily.ps1        (해제: .\register-daily.ps1 -Remove)
param([switch]$Remove, [string]$At = "08:00")
$name = "CampaignMoa-DailySync"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "해제했어요: $name"; return }
$dir = $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\sync-and-push.ps1`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# PC가 꺼져 있어 놓친 실행은 켜진 뒤 바로 실행
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "체험모아 캠페인 목록 매일 수집" -Force | Out-Null
"등록했어요: 매일 $At 에 $dir\sync-and-push.ps1 실행 (수집 후 GitHub에 올림)"
