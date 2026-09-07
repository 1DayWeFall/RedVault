# ============================================
# One-click sync script: git add -> commit -> push
# Usage: run  .\sync.ps1  in terminal
# ============================================

$repoDir = "c:\Users\NEVERFIRE\CodeBuddy\20260907154022"
Set-Location $repoDir

# 1. Check for uncommitted changes
$status = git status --porcelain
if (-not $status) {
    Write-Host "[OK] Nothing to sync. Repository is up to date." -ForegroundColor Green
    exit 0
}

Write-Host "[..] Uncommitted changes detected, syncing..." -ForegroundColor Yellow

# 2. Stage all changes
git add .

# 3. Commit (message includes timestamp)
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "auto-sync: $timestamp"

# 4. Push to GitHub
git push

Write-Host "[OK] Sync completed ($timestamp)" -ForegroundColor Cyan
