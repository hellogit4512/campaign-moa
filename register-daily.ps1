# 이 PC에서 매일 오전 7시에 수집 스크립트를 실행하도록 Windows 작업 스케줄러에 등록합니다.
# 사용법: PowerShell에서  .\register-daily.ps1        (해제: .\register-daily.ps1 -Remove)
param([switch]$Remove, [string]$At = "07:00")
$name = "CampaignMoa-DailySync"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "해제했어요: $name"; return }
$dir = $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\fetch-campaigns.mjs`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# PC가 꺼져 있어 놓친 실행은 켜진 뒤 바로 실행
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "체험모아 캠페인 목록 매일 수집" -Force | Out-Null
"등록했어요: 매일 $At 에 $dir\fetch-campaigns.mjs 실행"
