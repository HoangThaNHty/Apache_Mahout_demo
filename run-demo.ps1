param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$DemoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DemoUrl = "http://localhost:8080"
$JarPath = Join-Path $DemoRoot "target\mahout-demo.jar"

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay Java. Hay cai JDK 11 tro len va mo lai START_DEMO.cmd."
}

try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 2
    if ($Health.status -eq "ok" -and $Health.engine -like "*Apache Mahout*") {
        Write-Host "Demo Mahout dang chay. Mo lai giao dien..." -ForegroundColor Green
        Start-Process "$DemoUrl"
        return
    }
}
catch {
    # Port 8080 is free or the demo is not running yet.
}

$ToolRoot = Join-Path $DemoRoot ".tools"
$MavenVersion = "3.9.11"
$MavenRoot = Join-Path $ToolRoot "apache-maven-$MavenVersion"
$MavenCommand = Join-Path $MavenRoot "bin\mvn.cmd"
if (-not (Test-Path -LiteralPath $MavenCommand)) {
    Write-Host "[1/3] Tai Apache Maven..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $ToolRoot -Force | Out-Null
    $MavenZip = Join-Path $ToolRoot "apache-maven-$MavenVersion-bin.zip"
    & curl.exe --fail --location --silent --show-error "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$MavenVersion/apache-maven-$MavenVersion-bin.zip" --output $MavenZip
    if ($LASTEXITCODE -ne 0) { throw "Khong the tai Apache Maven" }
    Expand-Archive -LiteralPath $MavenZip -DestinationPath $ToolRoot -Force
    Remove-Item -LiteralPath $MavenZip -Force
}

$NeedsBuild = $Rebuild -or -not (Test-Path -LiteralPath $JarPath)
if (-not $NeedsBuild) {
    $JarTime = (Get-Item -LiteralPath $JarPath).LastWriteTimeUtc
    $LatestSource = Get-ChildItem -LiteralPath (Join-Path $DemoRoot "src"), (Join-Path $DemoRoot "pom.xml") -Recurse -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    $NeedsBuild = $LatestSource.LastWriteTimeUtc -gt $JarTime
}

Push-Location $DemoRoot
try {
    if ($NeedsBuild) {
        Write-Host "[2/3] Bien dich giao dien V2 va dong goi Mahout..." -ForegroundColor Cyan
        & $MavenCommand -q -DskipTests package
        if ($LASTEXITCODE -ne 0) { throw "Maven build failed with exit code $LASTEXITCODE" }
    }
    else {
        Write-Host "[2/3] Su dung ban demo da dong goi. Khong can bien dich lai." -ForegroundColor DarkCyan
    }

    Write-Host "[3/3] Khoi dong demo tai $DemoUrl" -ForegroundColor Green
    Write-Host "Nhan Ctrl+C trong cua so nay de dung server." -ForegroundColor Yellow
    & java '-Dfile.encoding=UTF-8' -jar $JarPath --port 8080 --open
}
finally {
    Pop-Location
}
