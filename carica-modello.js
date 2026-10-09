'use strict';
// Carica un modello di bando (modelli/*.json) nell'app tramite l'API, senza duplicati.
// Uso: node carica-modello.js [modelli/bando-innovazione-2026.json]   (server già avviato)
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, 'modelli', 'bando-innovazione-2026.json');
const base = `http://127.0.0.1:${process.env.PORT || 3000}/api/bandi`;
(async () => {
  const modello = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const esistenti = await (await fetch(base)).json();
    if (esistenti.some((b) => b.nome === modello.nome)) return console.log('Bando già presente, niente da fare.');
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modello) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.errore);
    console.log(`Bando «${d.nome}» creato con ${d.modello.length} passi.`);
  } catch (e) {
    console.error('Errore:', e.message, '\nIl server è avviato? (avvia.bat)');
    process.exit(1);
  }
})();
