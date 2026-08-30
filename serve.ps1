# ===========================================================================
#  Game5 - LAN sunucusu
#  Bu klasoru telefonun icin ag uzerinden yayinlar.
#  Calistir:  SUNUCU-BASLAT.bat   (ya da sag tik -> Run with PowerShell)
#  Durdur:    pencerede Ctrl+C
#
#  TcpListener + runspace havuzu -> yonetici yetkisi GEREKMIYOR,
#  tarayicinin paralel isteklerini ayni anda karsilar.
# ===========================================================================

$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$Port = 8765

function Get-LanIPs {
  try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress
  } catch {
    [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' } |
      ForEach-Object { $_.IPAddressToString }
  }
}

# --- Windows Guvenlik Duvari kurali (yetki varsa otomatik) ------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
  try {
    if (-not (Get-NetFirewallRule -DisplayName "Game5 Web $Port" -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName "Game5 Web $Port" -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
      Write-Host "Guvenlik duvari kurali eklendi (TCP $Port)." -ForegroundColor DarkGray
    }
  } catch { }
}

# --- her baglantiyi calistiran is parcasi ----------------------------------
$worker = {
  param($client, $Root)

  $Mime = @{
    '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
    '.js'='application/javascript; charset=utf-8'; '.mjs'='application/javascript; charset=utf-8'
    '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'
    '.webmanifest'='application/manifest+json; charset=utf-8'
    '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'
    '.svg'='image/svg+xml'; '.ico'='image/x-icon'
    '.ttf'='font/ttf'; '.woff'='font/woff'; '.woff2'='font/woff2'
    '.md'='text/markdown; charset=utf-8'; '.txt'='text/plain; charset=utf-8'
  }

  try {
    $client.NoDelay = $true
    $client.ReceiveTimeout = 10000
    $client.SendTimeout = 60000
    # Graceful close: without a linger + shutdown the socket can be reset before
    # the last bytes drain, which makes Chrome reject a service-worker script
    # with "An unknown error occurred when fetching the script."
    $client.LingerState = New-Object System.Net.Sockets.LingerOption($true, 5)
    $stream = $client.GetStream()

    # --- istek basligini oku (bos satira kadar) ---
    $buf = New-Object byte[] 8192
    $head = ''
    while ($head -notmatch "`r`n`r`n") {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $head += [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
      if ($head.Length -gt 65536) { break }
    }
    if ([string]::IsNullOrEmpty($head)) { return }

    $line   = ($head -split "`r`n")[0]
    $parts  = $line -split ' '
    $method = $parts[0]
    $target = if ($parts.Count -gt 1) { $parts[1] } else { '/' }
    $path   = [System.Uri]::UnescapeDataString((($target -split '\?')[0]))
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }

    $rel  = $path.TrimStart('/') -replace '/', '\'
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))

    $code = 200; $status = 'OK'; $extra = ''
    $body = $null; $ct = 'application/octet-stream'

    if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
      $code = 403; $status = 'Forbidden'; $ct = 'text/plain; charset=utf-8'
      $body = [System.Text.Encoding]::UTF8.GetBytes('403')
    }
    elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($Mime.ContainsKey($ext)) { $ct = $Mime[$ext] }
      if ($rel -ieq 'sw.js') { $extra = "Service-Worker-Allowed: /`r`n" }
      $body = [System.IO.File]::ReadAllBytes($full)
    }
    else {
      $code = 404; $status = 'Not Found'; $ct = 'text/plain; charset=utf-8'
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 $path")
    }

    $len = $body.Length
    if ($method -eq 'HEAD') { $body = New-Object byte[] 0 }

    $resp = "HTTP/1.1 $code $status`r`n" +
            "Content-Type: $ct`r`n" +
            "Content-Length: $len`r`n" +
            "Cache-Control: no-cache`r`n" +
            "Access-Control-Allow-Origin: *`r`n" +
            $extra +
            "Connection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($resp)
    $stream.Write($hb, 0, $hb.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
    try { $client.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch { }
  } catch {
    # tarayici baglantiyi erken kapatirsa yoksay
  } finally {
    try { $client.Close() } catch { }
  }
}

$pool = [runspacefactory]::CreateRunspacePool(1, 12)
$pool.ApartmentState = 'MTA'
$pool.Open()
$jobs = New-Object System.Collections.ArrayList

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Server.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket,
                                 [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
$listener.Start(64)

Write-Host ""
Write-Host "  GAME5 sunucusu calisiyor" -ForegroundColor Green
Write-Host "  Klasor: $Root" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Bu bilgisayarda : http://localhost:$Port/" -ForegroundColor Cyan
foreach ($ip in (Get-LanIPs)) {
  Write-Host "  TELEFONDA       : http://${ip}:$Port/" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Telefon ayni Wi-Fi agina bagli olmali." -ForegroundColor DarkGray
if (-not $isAdmin) {
  Write-Host "  Telefon baglanamiyorsa bu dosyayi bir kez YONETICI olarak calistir." -ForegroundColor DarkGray
}
Write-Host "  Durdurmak icin Ctrl+C." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($worker).AddArgument($client).AddArgument($Root)
    [void]$jobs.Add([pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() })

    # biten is parcalarini temizle
    for ($i = $jobs.Count - 1; $i -ge 0; $i--) {
      if ($jobs[$i].Handle.IsCompleted) {
        try { $jobs[$i].PS.EndInvoke($jobs[$i].Handle) } catch { }
        $jobs[$i].PS.Dispose()
        $jobs.RemoveAt($i)
      }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
  try { $pool.Close(); $pool.Dispose() } catch { }
  Write-Host "Sunucu durdu." -ForegroundColor DarkGray
}
