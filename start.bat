@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8080

echo ============================================
echo   Buchi Toolbox / 不吃工具箱 - Local Server
echo   http://localhost:%PORT%/
echo   Press Ctrl+C to stop.
echo ============================================
start "" "http://localhost:%PORT%/"

where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server %PORT%
    goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 -m http.server %PORT%
    goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
    npx --yes serve -l %PORT% .
    goto :eof
)
echo No Python or Node.js found. Just open index.html directly in your browser.
pause
