Set-Location $PSScriptRoot
Add-Type -AssemblyName PresentationFramework
function Avviso($testo) { [void][System.Windows.MessageBox]::Show($testo, 'Gestionale 1nnovaTeam', 'OK', 'Warning') }
function Raggiungibile($url) { try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $true } catch { $false } }

$url = 'http://127.0.0.1:3000/'

# 1. Node.js installato?
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Avviso "Node.js non è installato su questo computer, ed è necessario per usare il gestionale.`n`nSi aprirà la pagina di download: installa la versione LTS, poi riavvia questo programma."
  Start-Process 'https://nodejs.org/it/download'
  exit 1
}

# 2. Versione 18 o successiva?
$versione = (& node -v).Trim()
if ([int]($versione.TrimStart('v').Split('.')[0]) -lt 18) {
  Avviso "La versione di Node.js installata ($versione) è troppo vecchia: serve la 18 o successiva.`n`nSi aprirà la pagina di download: installa la versione LTS, poi riavvia questo programma."
  Start-Process 'https://nodejs.org/it/download'
  exit 1
}

# 3. Avvio del server (se non è già attivo)
if (-not (Raggiungibile $url)) {
  Start-Process node -ArgumentList 'server.js' -WindowStyle Hidden
  for ($i = 0; $i -lt 20 -and -not (Raggiungibile $url); $i++) { Start-Sleep -Milliseconds 500 }
}
if (-not (Raggiungibile $url)) {
  Avviso "Il server non si è avviato.`n`nPossibili cause: la porta 3000 è usata da un altro programma, oppure la cartella dell'app è incompleta (manca server.js)."
  exit 1
}

# 4. Apertura del browser (dopo 1,5 secondi)
Start-Sleep -Milliseconds 1500
Start-Process $url

