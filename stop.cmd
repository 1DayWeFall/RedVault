@echo off
REM Stop only the local RedVault listener on port 3789.
powershell.exe -NoProfile -WindowStyle Hidden -Command "$pids=netstat -ano | Select-String ':3789\s+.*LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' } | Select-Object -Unique; foreach($p in $pids){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}"
exit /b 0
