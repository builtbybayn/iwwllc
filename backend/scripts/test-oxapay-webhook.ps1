$ErrorActionPreference = "Stop"

if (-not $env:OXAPAY_MERCHANT_KEY) {
  Write-Error "Missing OXAPAY_MERCHANT_KEY env var"
  exit 1
}

$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8080" }

$body = '{"status":"expired","trackId":"test_track_123"}'

$hmac = New-Object System.Security.Cryptography.HMACSHA512
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($env:OXAPAY_MERCHANT_KEY)
$sigBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))
$sig = ([BitConverter]::ToString($sigBytes) -replace '-', '').ToLower()

Invoke-WebRequest -Uri "$baseUrl/v1/payments/webhook/oxapay" `
  -Method Post `
  -Headers @{ "HMAC" = $sig } `
  -ContentType "application/json" `
  -Body $body
