'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = path.join(__dirname, 'data.json');
const TMP_FILE = DATA_FILE + '.tmp';
const BACKUP_FILE = path.join(__dirname, 'data.backup.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 1024 * 1024;

const RISORSE = ['clienti', 'bandi', 'checklist', 'pratiche'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// ---------- Validazione ----------
const str = (v) => typeof v === 'string';
const SCHEMI = {
  clienti: {
    obbligatori: ['ragioneSociale'],
    campi: {
      ragioneSociale: 'string', partitaIva: 'string', codiceFiscale: 'string',
      dimensione: ['', 'micro', 'piccola', 'media'], referente: 'string',
      email: 'string', telefono: 'string', indirizzo: 'string', note: 'string',
    },
    default: { partitaIva: '', codiceFiscale: '', dimensione: '', referente: '', email: '', telefono: '', indirizzo: '', note: '' },
  },
  bandi: {
    obbligatori: ['nome'],
    campi: {
      nome: 'string', ente: 'string', scadenza: 'data', percentuale: 'numero',
      dotazione: 'numero', stato: ['aperto', 'in arrivo', 'chiuso'], link: 'string', note: 'string', modello: 'lista',
    },
    default: { ente: '', scadenza: '', percentuale: null, dotazione: null, stato: 'aperto', link: '', note: '', modello: [] },
  },
  checklist: {
    obbligatori: ['titolo'],
    campi: {
      titolo: 'string', fatto: 'bool', scadenza: 'data', clienteId: 'rif', bandoId: 'rif',
      priorita: ['bassa', 'normale', 'alta'], note: 'string',
    },
    default: { fatto: false, scadenza: '', clienteId: null, bandoId: null, priorita: 'normale', note: '' },
  },
  pratiche: {
    obbligatori: ['clienteId', 'bandoId'],
    campi: { clienteId: 'string', bandoId: 'string', passi: 'passi', note: 'string' },
    default: { passi: [], note: '' },
  },
};

function validaCampi(risorsa, dati, parziale) {
  const s = SCHEMI[risorsa];
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return 'Dati non validi.';
  for (const k of s.obbligatori) {
    if (!parziale || k in dati) {
      if (!str(dati[k]) || !dati[k].trim()) return `Il campo "${k}" è obbligatorio.`;
    }
  }
  for (const [k, tipo] of Object.entries(s.campi)) {
    if (!(k in dati)) continue;
    const v = dati[k];
    if (Array.isArray(tipo)) {
      if (!tipo.includes(v)) return `Valore non valido per "${k}".`;
    } else if (tipo === 'string') {
      if (!str(v)) return `Il campo "${k}" deve essere un testo.`;
    } else if (tipo === 'numero') {
      if (v !== null && v !== '' && (typeof v !== 'number' || !isFinite(v))) return `Il campo "${k}" deve essere un numero.`;
    } else if (tipo === 'bool') {
      if (typeof v !== 'boolean') return `Il campo "${k}" deve essere vero/falso.`;
    } else if (tipo === 'data') {
      if (v !== '' && v !== null && !(str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v))) return `Il campo "${k}" deve essere una data (aaaa-mm-gg).`;
    } else if (tipo === 'lista') {
      if (!Array.isArray(v) || !v.every(str)) return `Il campo "${k}" deve essere un elenco di testi.`;
    } else if (tipo === 'passi') {
      if (!Array.isArray(v) || !v.every((p) => p && str(p.titolo) && p.titolo.trim() && (p.fatto === undefined || typeof p.fatto === 'boolean'))) return 'I passi della pratica non sono validi.';
    } else if (tipo === 'rif') {
      if (v !== null && !str(v)) return `Il campo "${k}" non è valido.`;
    }
  }
  if (risorsa === 'clienti' && 'partitaIva' in dati && dati.partitaIva && !/^\d{11}$/.test(dati.partitaIva.trim())) {
    return 'La partita IVA deve essere di 11 cifre.';
  }
  return null;
}

function pulisci(risorsa, dati) {
  const out = {};
  for (const k of Object.keys(SCHEMI[risorsa].campi)) {
    if (!(k in dati)) continue;
    let v = dati[k];
    if (str(v)) v = v.trim();
    if (SCHEMI[risorsa].campi[k] === 'numero' && v === '') v = null;
    if (SCHEMI[risorsa].campi[k] === 'lista') v = v.map((x) => x.trim()).filter(Boolean);
    if (SCHEMI[risorsa].campi[k] === 'passi') v = v.map((p) => ({ id: str(p.id) && p.id ? p.id : crypto.randomUUID(), titolo: p.titolo.trim(), fatto: !!p.fatto }));
    out[k] = v;
  }
  return out;
}

function strutturaValida(d) {
  if (!d || typeof d !== 'object') return 'Struttura non valida.';
  for (const r of RISORSE) {
    if (r === 'pratiche' && d[r] === undefined) continue;
    if (!Array.isArray(d[r])) return `Manca l'elenco "${r}".`;
    for (const rec of d[r]) {
      if (!rec || typeof rec !== 'object' || !str(rec.id)) return `Record senza id in "${r}".`;
      const err = validaCampi(r, rec, false);
      if (err) return `In "${r}": ${err}`;
    }
  }
  return null;
}

// ---------- Archivio ----------
let db = null;
let erroreDati = null;
let coda = Promise.resolve();

const vuoto = () => ({ clienti: [], bandi: [], checklist: [], pratiche: [] });

function caricaDati() {
  if (!fs.existsSync(DATA_FILE)) {
    db = vuoto();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    return;
  }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const r of RISORSE) if (!Array.isArray(d[r])) d[r] = [];
    db = d;
    erroreDati = null;
  } catch (e) {
    db = null;
    erroreDati = 'Il file data.json è illeggibile. Ripristinare data.backup.json (vedi README) e riavviare il server.';
    console.error(erroreDati, e.message);
  }
}

function salva() {
  const snapshot = JSON.stringify(db, null, 2);
  const op = coda.then(async () => {
    if (fs.existsSync(DATA_FILE)) {
      try { JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); await fs.promises.copyFile(DATA_FILE, BACKUP_FILE); } catch (_) { /* non sovrascrivere il backup con dati rotti */ }
    }
    await fs.promises.writeFile(TMP_FILE, snapshot);
    // su Windows il rename può fallire con EPERM/EBUSY (antivirus, indicizzazione): riprova
    for (let i = 0; ; i++) {
      try { await fs.promises.rename(TMP_FILE, DATA_FILE); return; }
      catch (e) {
        if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
  });
  coda = op.catch(() => {}); // un errore non deve bloccare le scritture successive
  return op;
}

// ---------- HTTP ----------
function rispondi(res, stato, corpo, headers) {
  const isBuf = Buffer.isBuffer(corpo);
  res.writeHead(stato, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(isBuf ? corpo : JSON.stringify(corpo));
}
const errore = (res, stato, msg) => rispondi(res, stato, { errore: msg });

function leggiBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject({ stato: 413, msg: 'Richiesta troppo grande (max 1 MB).' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject({ stato: 400, msg: 'JSON non valido.' }); }
    });
    req.on('error', () => reject({ stato: 400, msg: 'Errore di lettura.' }));
  });
}

// ---------- Aggiornamento da GitHub (senza git: scarica lo zip e sovrascrive i file, tranne i dati) ----------
const REPO = process.env.GITHUB_REPO || (require('./package.json').githubRepo || ''); // "utente/repo"
const RAMO = process.env.GITHUB_BRANCH || 'main';
const FILE_VERSIONE = path.join(__dirname, 'versione.txt');
const NON_TOCCARE = new Set(['data.json', 'data.backup.json', 'data.json.tmp', 'versione.txt', 'node_modules', '.git']);

// Restituisce null se già aggiornato, altrimenti lo sha installato.
async function scaricaAggiornamento() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) throw new Error('repository GitHub non configurato (campo "githubRepo" in package.json, es. "utente/repo").');
  const os = require('os');
  const { execFile } = require('child_process');
  const h = { 'User-Agent': 'gestionale-1nnovateam' };
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(RAMO)}`, { headers: h }).catch(() => null);
  if (!r) throw new Error('GitHub non raggiungibile.');
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status} (il repository deve essere pubblico).`);
  const sha = (await r.json()).sha;
  let attuale = '';
  try { attuale = fs.readFileSync(FILE_VERSIONE, 'utf8').trim(); } catch (_) {}
  if (sha === attuale) return null;
  const z = await fetch(`https://codeload.github.com/${REPO}/zip/${sha}`, { headers: h }).catch(() => null);
  if (!z || !z.ok) throw new Error('Download non riuscito.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-'));
  try {
    const zip = path.join(tmp, 'a.zip');
    fs.writeFileSync(zip, Buffer.from(await z.arrayBuffer()));
    await new Promise((ok, ko) => execFile('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zip, path.join(tmp, 'x')],
      { timeout: 120000 }, (err, _o, se) => err ? ko(new Error('Estrazione fallita: ' + (se || err.message).trim())) : ok()));
    const radice = path.join(tmp, 'x', fs.readdirSync(path.join(tmp, 'x'))[0]);
    for (const nome of fs.readdirSync(radice)) {
      if (NON_TOCCARE.has(nome)) continue;
      fs.cpSync(path.join(radice, nome), path.join(__dirname, nome), { recursive: true, force: true });
    }
    fs.writeFileSync(FILE_VERSIONE, sha);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return sha;
}

async function gestisciApi(req, res, parti) {
  if (erroreDati) return errore(res, 500, erroreDati);
  const [risorsa, id] = parti;

  if (risorsa === 'spegni' && req.method === 'POST') {
    // l'header custom blocca le richieste da altri siti (richiede preflight CORS, che il server non concede)
    if (req.headers['x-richiesta'] !== '1') return errore(res, 403, 'Richiesta non consentita.');
    rispondi(res, 200, { ok: true });
    coda.then(() => { server.close(); process.exit(0); });
    return;
  }
  if (risorsa === 'aggiorna' && req.method === 'POST') {
    if (req.headers['x-richiesta'] !== '1') return errore(res, 403, 'Richiesta non consentita.');
    let sha;
    try { sha = await scaricaAggiornamento(); }
    catch (e) { return errore(res, 500, 'Aggiornamento non riuscito: ' + e.message); }
    const aggiornato = sha !== null;
    rispondi(res, 200, { aggiornato });
    if (aggiornato) coda.then(() => { server.close(); process.exit(0); }); // si ferma per caricare il nuovo codice
    return;
  }
  if (risorsa === 'export' && req.method === 'GET') {
    return rispondi(res, 200, Buffer.from(JSON.stringify(db, null, 2)), {
      'Content-Disposition': 'attachment; filename="data.json"',
    });
  }
  if (risorsa === 'import' && req.method === 'POST') {
    const d = await leggiBody(req);
    const err = strutturaValida(d);
    if (err) return errore(res, 400, err);
    const nuovo = { clienti: d.clienti, bandi: d.bandi, checklist: d.checklist, pratiche: d.pratiche || [] };
    try { await fs.promises.copyFile(DATA_FILE, BACKUP_FILE); } catch (_) { /* niente da salvare */ }
    db = nuovo;
    await salva();
    return rispondi(res, 200, { ok: true });
  }

  if (!RISORSE.includes(risorsa)) return errore(res, 404, 'Risorsa inesistente.');
  const lista = db[risorsa];

  if (req.method === 'GET' && !id) return rispondi(res, 200, lista);

  if (req.method === 'POST' && !id) {
    const dati = await leggiBody(req);
    const err = validaCampi(risorsa, dati, false);
    if (err) return errore(res, 400, err);
    let extra = {};
    if (risorsa === 'pratiche') {
      const bando = db.bandi.find((b) => b.id === dati.bandoId);
      if (!db.clienti.some((c) => c.id === dati.clienteId) || !bando) return errore(res, 400, 'Cliente o bando inesistente.');
      if (lista.some((p) => p.clienteId === dati.clienteId && p.bandoId === dati.bandoId)) return errore(res, 400, 'Esiste già una pratica per questo cliente e bando.');
      if (!dati.passi) extra.passi = (bando.modello || []).map((t) => ({ id: crypto.randomUUID(), titolo: t, fatto: false }));
    }
    const ora = new Date().toISOString();
    const rec = Object.assign({ id: crypto.randomUUID() }, SCHEMI[risorsa].default, pulisci(risorsa, dati), extra, { creatoIl: ora, modificatoIl: ora });
    lista.push(rec);
    await salva();
    return rispondi(res, 201, rec);
  }

  if (id) {
    const idx = lista.findIndex((r) => r.id === id);
    if (idx < 0) return errore(res, 404, 'Elemento inesistente.');
    if (req.method === 'PUT') {
      const dati = await leggiBody(req);
      const err = validaCampi(risorsa, dati, true);
      if (err) return errore(res, 400, err);
      if (risorsa === 'pratiche') { delete dati.clienteId; delete dati.bandoId; }
      Object.assign(lista[idx], pulisci(risorsa, dati), { modificatoIl: new Date().toISOString() });
      await salva();
      return rispondi(res, 200, lista[idx]);
    }
    if (req.method === 'DELETE') {
      lista.splice(idx, 1);
      if (risorsa === 'clienti' || risorsa === 'bandi') {
        const campo = risorsa === 'clienti' ? 'clienteId' : 'bandoId';
        db.pratiche = db.pratiche.filter((p) => p[campo] !== id);
        for (const v of db.checklist) if (v[campo] === id) { v[campo] = null; v.modificatoIl = new Date().toISOString(); }
      }
      await salva();
      return rispondi(res, 200, { ok: true });
    }
  }
  return errore(res, 405, 'Metodo non consentito.');
}

function servi(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return errore(res, 405, 'Metodo non consentito.');
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (_) { return errore(res, 400, 'Percorso non valido.'); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return errore(res, 403, 'Accesso negato.');
  fs.readFile(file, (err, buf) => {
    if (err) return errore(res, 404, 'File non trovato.');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) {
      const parti = pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
      return await gestisciApi(req, res, parti);
    }
    servi(req, res, pathname);
  } catch (e) {
    if (e && e.stato) return errore(res, e.stato, e.msg);
    console.error(e);
    errore(res, 500, 'Errore interno del server.');
  }
});

caricaDati();
server.listen(PORT, HOST, () => console.log(`1nnovaTeam Gestionale su http://${HOST}:${PORT}`));
