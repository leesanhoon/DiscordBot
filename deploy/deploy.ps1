<#
.SYNOPSIS
    Cai dat lan dau DiscordBot len may Windows Server, chay nhu mot Windows Service (qua NSSM).

.DESCRIPTION
    - Kiem tra Node.js va Git da duoc cai dat.
    - Clone repo (neu chua co) hoac pull code moi nhat (neu da co).
    - Cai dependency production.
    - Tai NSSM neu chua co.
    - Tao/cap nhat Windows Service tro toi src/index.js va khoi dong.

.PARAMETER RepoUrl
    URL cua git repo. Mac dinh: https://github.com/leesanhoon/DiscordBot.git

.PARAMETER InstallDir
    Thu muc cai dat tren server (co the da duoc git clone san). Mac dinh: C:\project\DiscordBot

.PARAMETER ServiceName
    Ten Windows Service. Mac dinh: DiscordBot

.EXAMPLE
    .\deploy.ps1

.EXAMPLE
    .\deploy.ps1 -InstallDir "D:\Bots\DiscordBot" -ServiceName "MyDiscordBot"
#>

[CmdletBinding()]
param(
    [string]$RepoUrl = "https://github.com/leesanhoon/DiscordBot.git",
    [string]$InstallDir = "C:\project\DiscordBot",
    [string]$ServiceName = "DiscordBot",
    [string]$NssmDir = "C:\project\nssm"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Script nay can chay voi quyen Administrator. Mo PowerShell bang 'Run as Administrator' roi chay lai."
    }
}

function Assert-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Khong tim thay '$name' trong PATH. $hint"
    }
}

Write-Host "=== 1. Kiem tra yeu cau ===" -ForegroundColor Cyan
Assert-Admin
Assert-Command "node" "Cai Node.js LTS tu https://nodejs.org roi mo lai PowerShell."
Assert-Command "git"  "Cai Git tu https://git-scm.com/download/win roi mo lai PowerShell."
Write-Host "Node: $(node -v) | Git: $(git --version)" -ForegroundColor Green

Write-Host "`n=== 2. Lay code ===" -ForegroundColor Cyan
if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Host "Da co repo tai $InstallDir, chuyen sang git pull..." -ForegroundColor Yellow
    Push-Location $InstallDir
    git pull
    Pop-Location
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent) | Out-Null
    git clone $RepoUrl $InstallDir
}

Write-Host "`n=== 3. Cai dependencies ===" -ForegroundColor Cyan
Push-Location $InstallDir
npm install --omit=dev
Pop-Location

Write-Host "`n=== 4. Kiem tra file .env ===" -ForegroundColor Cyan
$envPath = Join-Path $InstallDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "Chua co .env, tao template..." -ForegroundColor Yellow
    @'
DISCORD_TOKEN=""
OPENROUTER_API_KEY=""
'@ | Set-Content -Path $envPath -Encoding UTF8
    Write-Host "`nDA TAO $envPath NHUNG CON TRONG." -ForegroundColor Red
    Write-Host "Mo file nay, dien DISCORD_TOKEN va OPENROUTER_API_KEY that, sau do chay lai script nay." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 5. Tao thu muc log ===" -ForegroundColor Cyan
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "`n=== 6. Chuan bi NSSM ===" -ForegroundColor Cyan
$nssmExe = Join-Path $NssmDir "nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Host "Chua co NSSM, tai ve..." -ForegroundColor Yellow
    $zipUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath = Join-Path $env:TEMP "nssm.zip"
    $extractPath = Join-Path $env:TEMP "nssm-extract"

    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null
    $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
    Copy-Item (Join-Path $extractPath "nssm-2.24\$arch\nssm.exe") -Destination $nssmExe -Force

    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
}
Write-Host "NSSM san sang tai $nssmExe" -ForegroundColor Green

Write-Host "`n=== 7. Cai dat Windows Service ===" -ForegroundColor Cyan
$nodeExe = (Get-Command node).Source
$serviceExists = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)

if ($serviceExists) {
    Write-Host "Service '$ServiceName' da ton tai, dung de cap nhat cau hinh..." -ForegroundColor Yellow
    if ($serviceExists.Status -eq "Running") {
        Stop-Service -Name $ServiceName
    }
} else {
    & $nssmExe install $ServiceName $nodeExe (Join-Path $InstallDir "src\index.js")
}

& $nssmExe set $ServiceName AppDirectory $InstallDir
& $nssmExe set $ServiceName AppStdout (Join-Path $logDir "out.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $logDir "err.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateOnline 1
& $nssmExe set $ServiceName AppRotateBytes 10485760
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppExit Default Restart

Write-Host "`n=== 8. Khoi dong service ===" -ForegroundColor Cyan
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
Get-Service -Name $ServiceName | Format-Table -AutoSize

Write-Host "`nHoan tat. Xem log bang:" -ForegroundColor Green
Write-Host "  Get-Content '$logDir\out.log' -Tail 30 -Wait" -ForegroundColor Gray
Write-Host "  Get-Content '$logDir\err.log' -Tail 30 -Wait" -ForegroundColor Gray
