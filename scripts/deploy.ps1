# Deploy built extension to the installed extension directory.
# The Extension Host must be restarted for JS changes (restart Live).
# Webview HTML changes take effect on next dialog open (no restart needed).

$installDir = "C:\Users\jborn\AppData\Local\Ableton\Extensions\arrangement-coach.arrangement-coach"

if (!(Test-Path $installDir)) {
    Write-Host "Install directory not found. Install the .ablx first." -ForegroundColor Red
    exit 1
}

# Copy built files
Copy-Item "dist\extension.js" "$installDir\dist\extension.js" -Force
Copy-Item "dist\webview\index.html" "$installDir\webview\index.html" -Force

Write-Host "Deployed to $installDir" -ForegroundColor Green
Write-Host "  - extension.js: requires Live restart to take effect"
Write-Host "  - webview/index.html: takes effect on next dialog open"
