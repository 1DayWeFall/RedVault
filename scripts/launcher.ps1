# ═══ RedVault 一键启动器（经桌面快捷方式调用） ═══
# 服务已运行 → 直接打开页面（幂等，不重启）
# 服务未运行 → 启动服务（最小化窗口，输出写入 data\server.log）→ 等待就绪 → 打开页面
# 启动失败   → 弹窗提示查看日志

$root = Split-Path -Parent $PSScriptRoot   # scripts\ 的上级 = 项目根
$port = 3789
$url  = "http://127.0.0.1:$port"
# node 定位：workbuddy 版本号会随更新变化（如 22.22.2-2 → 22.22.2-3），写死会失效；
# 动态取 versions 下最新 node.exe，找不到再回退 PATH 的 node
$node = $null
$wbNode = Get-ChildItem (Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions') -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($wbNode) { $node = $wbNode.FullName } else { $node = 'node' }
$log = Join-Path $root 'data\server.log'
$err = Join-Path $root 'data\server.err.log'

function Test-Health {
  try { $r = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 1; return ($r.StatusCode -eq 200) }
  catch { return $false }
}

# ---- 场景一：服务已在运行 → 直接打开浏览器 ----
if (Test-Health) { Start-Process $url; exit 0 }

# ---- 场景二：未运行 → 启动服务（独立最小化窗口，输出重定向日志） ----
Start-Process -FilePath $node -ArgumentList 'server\index.js' -WorkingDirectory $root -WindowStyle Minimized -RedirectStandardOutput $log -RedirectStandardError $err | Out-Null

# ---- 轮询健康检查，最多 15 秒 ----
$ok = $false
foreach ($i in 1..15) {
  Start-Sleep -Seconds 1
  if (Test-Health) { $ok = $true; break }
}

if ($ok) { Start-Process $url }
else {
  (New-Object -ComObject WScript.Shell).Popup("RedVault 服务启动失败，请查看日志：$err", 0, 'RedVault', 16) | Out-Null
  exit 1
}
