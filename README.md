# Gestionale 1nnovaTeam

Anagrafica clienti, anagrafica bandi e checklist. Nessuna dipendenza: serve solo Node.js >= 18.

## Avvio

- Windows: doppio clic su `avvia.bat` (avvia il server e apre il browser).
- Altrimenti: `node server.js` e aprire <http://127.0.0.1:3000>.
- Porta diversa: variabile `PORT` (es. `set PORT=4000`).

## Aggiornamento

Il pulsante **Aggiorna app** nel footer scarica da GitHub l'ultima versione (zip, senza bisogno di Git)
e sovrascrive i file dell'app. Prima va impostato `githubRepo` in `package.json` (es. `"utente/repo"`;
il repository deve essere pubblico; ramo `main`, o variabile `GITHUB_BRANCH`). Se c'è una nuova versione
il server si ferma: riaprire `avvia.bat`. `data.json`, i backup e `versione.txt` non vengono toccati.

## Dati

Tutto è salvato in `data.json` (creato al primo avvio) nella cartella dell'app.
Prima di ogni scrittura l'ultima versione valida viene copiata in `data.backup.json`;
la scrittura è atomica (`data.json.tmp` poi rinominato).

### Backup e ripristino

- Backup: copiare `data.json`, oppure usare **Esporta JSON** nel footer.
- Se `data.json` risulta illeggibile il server parte ma mostra un errore: fermare il server,
  copiare `data.backup.json` sopra `data.json` e riavviare.
- **Importa JSON** sostituisce tutti i dati (viene creato prima il backup).

## Rete locale

Per impostazione predefinita il server ascolta solo su `127.0.0.1`. Per condividerlo in rete locale:

```
set HOST=0.0.0.0
node server.js
```

Non c'è autenticazione: usarlo solo su reti fidate.

`data.json`, `data.backup.json` e `data.json.tmp` sono in `.gitignore`.

## Modelli di bando

`modelli/*.json` contiene bandi con la checklist standard già pronta. Con il server avviato:
`node carica-modello.js modelli/bando-innovazione-2026.json` (non crea duplicati).
