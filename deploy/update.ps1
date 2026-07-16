<#
.SYNOPSIS
    Cap nhat DiscordBot dang chay nhu Windows Service len code moi nhat.

.DESCRIPTION
    - Dung service.
    - git pull code moi nhat.
    - Cai lai dependencies.
    - Khoi dong lai service.
    - In vai dong log cuoi de kiem tra nhanh.

.PARAMETER InstallDir
    Thu muc cai dat tren server. Mac dinh: C:\project\DiscordBot

.PARAMETER ServiceName
    Ten Windows Service. Mac dinh: DiscordBot

.EXAMPLE
    .\update.ps1

.EXAMPLE
    .\update.ps1 -InstallDir "D:\Bots\DiscordBot" -ServiceName "MyDiscordBot"
#>

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\project\DiscordBot",
    [string]$ServiceName = "DiscordBot"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Script nay can chay voi quyen Administrator. Mo PowerShell bang 'Run as Administrator' roi chay lai."
    }
}

Assert-Admin

if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
    throw "Khong tim thay repo tai $InstallDir. Chay deploy.ps1 truoc de cai dat lan dau."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    throw "Khong tim thay service '$ServiceName'. Chay deploy.ps1 truoc de tao service."
}

Write-Host "=== 1. Dung service ===" -ForegroundColor Cyan
if ($service.Status -eq "Running") {
    Stop-Service -Name $ServiceName
    Write-Host "Da dung '$ServiceName'." -ForegroundColor Green
} else {
    Write-Host "Service dang khong chay, bo qua buoc dung." -ForegroundColor Yellow
}

Write-Host "`n=== 2. Lay code moi nhat ===" -ForegroundColor Cyan
Push-Location $InstallDir
$beforeCommit = git rev-parse --short HEAD
git pull
$afterCommit = git rev-parse --short HEAD
Write-Host "Commit: $beforeCommit -> $afterCommit" -ForegroundColor Green

Write-Host "`n=== 3. Cai lai dependencies ===" -ForegroundColor Cyan
npm install --omit=dev
Pop-Location

Write-Host "`n=== 4. Khoi dong lai service ===" -ForegroundColor Cyan
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
Get-Service -Name $ServiceName | Format-Table -AutoSize

Write-Host "`n=== 5. Log gan nhat (stderr) ===" -ForegroundColor Cyan
$errLog = Join-Path $InstallDir "logs\err.log"
if (Test-Path $errLog) {
    Get-Content $errLog -Tail 20
} else {
    Write-Host "(chua co file log err.log)" -ForegroundColor Yellow
}

Write-Host "`nCap nhat hoan tat." -ForegroundColor Green
