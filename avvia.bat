@echo off
cd /d "%~dp0"
rem Avvio silenzioso: controlla i requisiti, avvia il server senza finestra e apre il browser.
rem Per fermare il server usare il pulsante "Spegni" nell'app.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0avvia.ps1"
