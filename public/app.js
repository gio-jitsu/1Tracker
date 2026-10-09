'use strict';

const $ = (s) => document.querySelector(s);
const main = $('#main');
const dlg = $('#dlg');
const stato = { clienti: [], bandi: [], checklist: [], pratiche: [] };
const ui = {
  tab: 'clienti',
  cerca: { clienti: '', bandi: '' },
  ord: { clienti: { k: 'ragioneSociale', d: 1 }, bandi: { k: 'scadenza', d: 1 } },
  chk: { filtro: 'tutte', cliente: '', bando: '', cerca: '' },
  pr: { cliente: '', bando: '' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const dataIt = (d) => d ? d.split('-').reverse().join('/') : '';
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const giorniA = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(oggi() + 'T00:00:00')) / 864e5);

// ---------- API ----------
function mostraErrore(msg) {
  const e = $('#errore');
  e.textContent = msg;
  e.hidden = !msg;
}
async function api(metodo, url, corpo) {
  let r;
  try {
    r = await fetch(url, { method: metodo, headers: Object.assign({ 'X-Richiesta': '1' }, corpo ? { 'Content-Type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
  } catch (_) {
    throw new Error('Server non raggiungibile, avviare `node server.js`.');
  }
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dati.errore || `Errore ${r.status}`);
  return dati;
}
async function azione(fn) {
  try { mostraErrore(''); await fn(); return true; }
  catch (e) { mostraErrore(e.message); return false; }
}
async function carica() {
  await azione(async () => {
    for (const r of Object.keys(stato)) stato[r] = await api('GET', '/api/' + r);
  });
  render();
}

// ---------- Schede ----------
function vaiA(tab) {
  if (!['clienti', 'bandi', 'pratiche', 'checklist'].includes(tab)) tab = 'clienti';
  ui.tab = tab;
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  render();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => vaiA(b.dataset.tab)));
window.addEventListener('hashchange', () => vaiA(location.hash.slice(1)));

function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  if (ui.tab === 'checklist') renderChecklist(); else if (ui.tab === 'pratiche') renderPratiche(); else renderAnagrafica(ui.tab);
}

// ---------- Anagrafiche ----------
const COLONNE = {
  clienti: [
    ['ragioneSociale', 'Ragione sociale'], ['partitaIva', 'P.IVA'], ['dimensione', 'Dimensione'],
    ['referente', 'Referente'], ['email', 'Email'],
  ],
  bandi: [
    ['nome', 'Nome'], ['ente', 'Ente'], ['scadenza', 'Scadenza'], ['stato', 'Stato'], ['percentuale', 'Contributo %'],
  ],
};
const CAMPI = {
  clienti: [
    ['ragioneSociale', 'Ragione sociale *', 'text', true], ['partitaIva', 'Partita IVA', 'text'],
    ['codiceFiscale', 'Codice fiscale', 'text'], ['dimensione', 'Dimensione', ['', 'micro', 'piccola', 'media']],
    ['referente', 'Referente', 'text'], ['email', 'Email', 'email'], ['telefono', 'Telefono', 'tel'],
    ['indirizzo', 'Indirizzo', 'text'], ['note', 'Note', 'area'],
  ],
  bandi: [
    ['nome', 'Nome *', 'text', true], ['ente', 'Ente erogatore', 'text'], ['scadenza', 'Scadenza', 'date'],
    ['stato', 'Stato', ['aperto', 'in arrivo', 'chiuso']], ['percentuale', 'Percentuale contributo', 'number'],
    ['dotazione', 'Dotazione (€)', 'number'], ['link', 'Link', 'url'], ['note', 'Note', 'area'],
    ['modello', 'Passi standard della pratica (uno per riga)', 'lista'],
  ],
};

function cellaBando(r, k) {
  if (k === 'scadenza') {
    if (!r.scadenza) return '';
    const g = giorniA(r.scadenza);
    const cls = g < 0 ? 'rosso' : (r.stato === 'aperto' && g <= 14 ? 'arancio' : '');
    return `<span class="${cls}">${dataIt(r.scadenza)}</span>`;
  }
  if (k === 'percentuale') return r.percentuale === null || r.percentuale === undefined ? '' : esc(r.percentuale) + '%';
  return esc(r[k]);
}

function renderAnagrafica(ris) {
  const q = ui.cerca[ris].toLowerCase();
  const { k, d } = ui.ord[ris];
  let righe = stato[ris].filter((r) => !q || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)));
  righe = righe.slice().sort((a, b) => {
    const x = a[k] ?? '', y = b[k] ?? '';
    if (x === '' && y !== '') return 1;
    if (y === '' && x !== '') return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true })) * d;
  });
  main.innerHTML = `
    <div class="bar">
      <input class="grow" id="cerca" type="search" placeholder="Cerca…" value="${esc(ui.cerca[ris])}">
      <button class="btn" id="nuovo">+ Nuovo</button>
    </div>
    <div class="tw"><table>
      <thead><tr>${COLONNE[ris].map(([c, t]) => `<th data-k="${c}">${t}${c === k ? (d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${righe.map((r) => `<tr data-id="${esc(r.id)}">${COLONNE[ris].map(([c]) =>
        `<td>${ris === 'bandi' ? cellaBando(r, c) : esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    ${righe.length ? '' : '<div class="vuoto">Nessun elemento.</div>'}`;
  const cerca = $('#cerca');
  cerca.addEventListener('input', () => {
    ui.cerca[ris] = cerca.value;
    const pos = cerca.selectionStart;
    renderAnagrafica(ris);
    const n = $('#cerca'); n.focus(); n.setSelectionRange(pos, pos);
  });
  $('#nuovo').addEventListener('click', () => apriModale(ris));
  main.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const o = ui.ord[ris];
    ui.ord[ris] = { k: th.dataset.k, d: o.k === th.dataset.k ? -o.d : 1 };
    renderAnagrafica(ris);
  }));
  main.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => apriModale(ris, tr.dataset.id)));
}

// ---------- Modale ----------
function campoHtml([nome, etichetta, tipo, req], val) {
  const v = val ?? '';
  if (Array.isArray(tipo)) return `<label>${etichetta}<select name="${nome}">${tipo.map((o) => `<option value="${o}"${o === v ? ' selected' : ''}>${o || '—'}</option>`).join('')}</select></label>`;
  if (tipo === 'lista') return `<label class="full">${etichetta}<textarea name="${nome}" rows="5">${esc((val || []).join('\n'))}</textarea></label>`;
  if (tipo === 'area') return `<label class="full">${etichetta}<textarea name="${nome}">${esc(v)}</textarea></label>`;
  const extra = tipo === 'number' ? ' step="any"' : '';
  return `<label${nome === 'ragioneSociale' || nome === 'nome' || tipo === 'url' ? ' class="full"' : ''}>${etichetta}<input name="${nome}" type="${tipo}"${extra}${req ? ' required' : ''} value="${esc(v)}"></label>`;
}

function leggiForm(form, campi) {
  const out = {};
  for (const [nome, , tipo] of campi) {
    const el = form.elements[nome];
    if (!el) continue;
    if (tipo === 'lista') out[nome] = el.value.split('\n');
    else if (tipo === 'number') out[nome] = el.value === '' ? null : Number(el.value);
    else out[nome] = el.value;
  }
  return out;
}

function apriModale(ris, id) {
  const rec = id ? stato[ris].find((r) => r.id === id) : null;
  const titolo = { clienti: 'Cliente', bandi: 'Bando' }[ris];
  dlg.innerHTML = `<form method="dialog" id="frm"><h2 class="full">${rec ? 'Modifica' : 'Nuovo'} ${titolo.toLowerCase()}</h2>
    ${CAMPI[ris].map((c) => campoHtml(c, rec ? rec[c[0]] : (c[0] === 'stato' ? 'aperto' : ''))).join('')}
    <div class="warn full" id="avviso"></div>
    <div class="actions full">
      ${rec ? '<button type="button" class="btn-danger" id="elimina">Elimina</button>' : ''}
      <button type="button" class="btn2" id="annulla">Annulla</button>
      <button type="submit" class="btn">Salva</button>
    </div></form>`;
  const form = $('#frm');
  if (ris === 'clienti') {
    const piva = form.elements.partitaIva;
    const ctrl = () => {
      const dup = piva.value.trim() && stato.clienti.some((c) => c.partitaIva === piva.value.trim() && c.id !== id);
      $('#avviso').textContent = dup ? 'Attenzione: esiste già un cliente con questa partita IVA.' : '';
    };
    piva.addEventListener('input', ctrl); ctrl();
  }
  $('#annulla').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = leggiForm(form, CAMPI[ris]);
    const ok = await azione(async () => {
      const salvato = rec ? await api('PUT', `/api/${ris}/${id}`, dati) : await api('POST', '/api/' + ris, dati);
      const i = stato[ris].findIndex((r) => r.id === salvato.id);
      if (i >= 0) stato[ris][i] = salvato; else stato[ris].push(salvato);
    });
    if (ok) { dlg.close(); render(); }
  });
  if (rec) $('#elimina').addEventListener('click', async () => {
    const campo = ris === 'clienti' ? 'clienteId' : 'bandoId';
    const n = stato.checklist.filter((v) => v[campo] === id).length;
    const np = stato.pratiche.filter((p) => p[campo] === id).length;
    const msg = `Eliminare «${rec.ragioneSociale || rec.nome}»?` + (n ? `\n${n} voci della checklist perderanno il collegamento.` : '') + (np ? `\nVerranno eliminate anche ${np} pratiche collegate.` : '');
    if (!confirm(msg)) return;
    const ok = await azione(async () => {
      await api('DELETE', `/api/${ris}/${id}`);
      stato[ris] = stato[ris].filter((r) => r.id !== id);
      stato.checklist.forEach((v) => { if (v[campo] === id) v[campo] = null; });
      stato.pratiche = stato.pratiche.filter((p) => p[campo] !== id);
    });
    if (ok) { dlg.close(); render(); }
  });
  dlg.showModal();
}

// ---------- Checklist ----------
const PRI = { alta: 0, normale: 1, bassa: 2 };
function ordinaChecklist(a, b) {
  if (a.fatto !== b.fatto) return a.fatto ? 1 : -1;
  if (a.scadenza !== b.scadenza) {
    if (!a.scadenza) return 1;
    if (!b.scadenza) return -1;
    return a.scadenza < b.scadenza ? -1 : 1;
  }
  return PRI[a.priorita] - PRI[b.priorita];
}

function renderChecklist() {
  const f = ui.chk;
  const t = oggi();
  const daFare = stato.checklist.filter((v) => !v.fatto);
  const scadute = daFare.filter((v) => v.scadenza && v.scadenza < t).length;
  const nomeC = (id) => (stato.clienti.find((c) => c.id === id) || {}).ragioneSociale;
  const nomeB = (id) => (stato.bandi.find((b) => b.id === id) || {}).nome;
  const q = f.cerca.toLowerCase();
  const voci = stato.checklist.filter((v) =>
    (f.filtro === 'tutte' || (f.filtro === 'fatte') === v.fatto) &&
    (!f.cliente || v.clienteId === f.cliente) && (!f.bando || v.bandoId === f.bando) &&
    (!q || [v.titolo, v.note, nomeC(v.clienteId), nomeB(v.bandoId)].some((s) => (s || '').toLowerCase().includes(q)))
  ).sort(ordinaChecklist);

  main.innerHTML = `
    <p class="counter"><b>${daFare.length}</b> da fare · <b class="${scadute ? 'rosso' : ''}">${scadute}</b> scadute</p>
    <div class="quick"><input id="nuova" placeholder="Nuova attività (premi Invio)…"><button class="btn2" id="dettagli" title="Aggiungi con dettagli">＋</button></div>
    <div class="filters">
      <span class="seg">${['tutte', 'da fare', 'fatte'].map((x) => `<button data-f="${x === 'da fare' ? 'dafare' : x}"${(x === 'da fare' ? 'dafare' : x) === f.filtro ? ' class="active"' : ''}>${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</span>
      <select id="fc"><option value="">Tutti i clienti</option>${stato.clienti.map((c) => `<option value="${esc(c.id)}"${c.id === f.cliente ? ' selected' : ''}>${esc(c.ragioneSociale)}</option>`).join('')}</select>
      <select id="fb"><option value="">Tutti i bandi</option>${stato.bandi.map((b) => `<option value="${esc(b.id)}"${b.id === f.bando ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select>
      <input id="fq" type="search" placeholder="Cerca…" value="${esc(f.cerca)}">
    </div>
    <div>${voci.map((v) => `
      <div class="item${v.fatto ? ' fatto' : ''}" data-id="${esc(v.id)}">
        <input type="checkbox"${v.fatto ? ' checked' : ''} aria-label="Fatto">
        <div class="main">
          <div class="titolo">${esc(v.titolo)}</div>
          <div class="meta">
            ${v.scadenza ? `<span class="${!v.fatto && v.scadenza < t ? 'rosso' : ''}">${dataIt(v.scadenza)}</span>` : ''}
            ${v.priorita !== 'normale' ? `<span class="pri-${v.priorita}">${v.priorita}</span>` : ''}
            ${v.clienteId && nomeC(v.clienteId) ? `<span class="chip" data-go="clienti" data-ref="${esc(v.clienteId)}">${esc(nomeC(v.clienteId))}</span>` : ''}
            ${v.bandoId && nomeB(v.bandoId) ? `<span class="chip bando" data-go="bandi" data-ref="${esc(v.bandoId)}">${esc(nomeB(v.bandoId))}</span>` : ''}
          </div>
        </div>
        <button class="edit" title="Dettagli">✎</button>
      </div>`).join('') || '<div class="vuoto">Nessuna attività.</div>'}</div>`;

  $('#nuova').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const titolo = e.target.value.trim();
    const ok = await azione(async () => { stato.checklist.push(await api('POST', '/api/checklist', { titolo })); });
    if (ok) { renderChecklist(); $('#nuova').focus(); }
  });
  $('#dettagli').addEventListener('click', () => apriModaleChecklist(null, $('#nuova').value.trim()));
  main.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { f.filtro = b.dataset.f; renderChecklist(); }));
  $('#fc').addEventListener('change', (e) => { f.cliente = e.target.value; renderChecklist(); });
  $('#fb').addEventListener('change', (e) => { f.bando = e.target.value; renderChecklist(); });
  $('#fq').addEventListener('input', (e) => {
    f.cerca = e.target.value; const pos = e.target.selectionStart;
    renderChecklist(); const n = $('#fq'); n.focus(); n.setSelectionRange(pos, pos);
  });
  main.querySelectorAll('.item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
      const v = stato.checklist.find((x) => x.id === id);
      const ok = await azione(async () => { Object.assign(v, await api('PUT', '/api/checklist/' + id, { fatto: e.target.checked })); });
      renderChecklist(); if (!ok) return;
    });
    el.querySelector('.edit').addEventListener('click', () => apriModaleChecklist(id));
    el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
      ui.cerca[c.dataset.go] = '';
      vaiA(c.dataset.go);
      apriModale(c.dataset.go, c.dataset.ref);
    }));
  });
}

function apriModaleChecklist(id, titoloIniziale) {
  const v = id ? stato.checklist.find((x) => x.id === id) : { titolo: titoloIniziale || '', scadenza: '', clienteId: null, bandoId: null, priorita: 'normale', note: '' };
  const opz = (lista, nome, sel) => `<option value="">— nessuno —</option>${lista.map((x) => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x[nome])}</option>`).join('')}`;
  dlg.innerHTML = `<form method="dialog" id="frm"><h2 class="full">${id ? 'Modifica' : 'Nuova'} attività</h2>
    <label class="full">Titolo *<input name="titolo" required value="${esc(v.titolo)}"></label>
    <label>Scadenza<input name="scadenza" type="date" value="${esc(v.scadenza)}"></label>
    <label>Priorità<select name="priorita">${['bassa', 'normale', 'alta'].map((p) => `<option${p === v.priorita ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
    <label>Cliente<select name="clienteId">${opz(stato.clienti, 'ragioneSociale', v.clienteId)}</select></label>
    <label>Bando<select name="bandoId">${opz(stato.bandi, 'nome', v.bandoId)}</select></label>
    <label class="full">Note<textarea name="note">${esc(v.note)}</textarea></label>
    <div class="actions full">
      ${id ? '<button type="button" class="btn-danger" id="elimina">Elimina</button>' : ''}
      <button type="button" class="btn2" id="annulla">Annulla</button>
      <button type="submit" class="btn">Salva</button>
    </div></form>`;
  const form = $('#frm');
  $('#annulla').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = form.elements;
    const dati = { titolo: el.titolo.value, scadenza: el.scadenza.value, priorita: el.priorita.value, clienteId: el.clienteId.value || null, bandoId: el.bandoId.value || null, note: el.note.value };
    const ok = await azione(async () => {
      const s = id ? await api('PUT', '/api/checklist/' + id, dati) : await api('POST', '/api/checklist', dati);
      const i = stato.checklist.findIndex((x) => x.id === s.id);
      if (i >= 0) stato.checklist[i] = s; else stato.checklist.push(s);
    });
    if (ok) { dlg.close(); renderChecklist(); }
  });
  if (id) $('#elimina').addEventListener('click', async () => {
    if (!confirm('Eliminare questa attività?')) return;
    const ok = await azione(async () => {
      await api('DELETE', '/api/checklist/' + id);
      stato.checklist = stato.checklist.filter((x) => x.id !== id);
    });
    if (ok) { dlg.close(); renderChecklist(); }
  });
  dlg.showModal();
}

// ---------- Pratiche (checklist per cliente × bando) ----------
const avanz = (p) => ({ fatti: p.passi.filter((x) => x.fatto).length, tot: p.passi.length });

function renderPratiche() {
  const f = ui.pr;
  const nomeC = (id) => (stato.clienti.find((c) => c.id === id) || {}).ragioneSociale || '?';
  const nomeB = (id) => (stato.bandi.find((b) => b.id === id) || {}).nome || '?';
  const righe = stato.pratiche.filter((p) => (!f.cliente || p.clienteId === f.cliente) && (!f.bando || p.bandoId === f.bando))
    .sort((a, b) => nomeC(a.clienteId).localeCompare(nomeC(b.clienteId), 'it') || nomeB(a.bandoId).localeCompare(nomeB(b.bandoId), 'it'));
  main.innerHTML = `
    <div class="bar">
      <select id="fc"><option value="">Tutti i clienti</option>${stato.clienti.map((c) => `<option value="${esc(c.id)}"${c.id === f.cliente ? ' selected' : ''}>${esc(c.ragioneSociale)}</option>`).join('')}</select>
      <select id="fb"><option value="">Tutti i bandi</option>${stato.bandi.map((b) => `<option value="${esc(b.id)}"${b.id === f.bando ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select>
      <span class="grow"></span>
      <button class="btn" id="nuovo">+ Nuova pratica</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Bando</th><th>Scadenza bando</th><th>Avanzamento</th></tr></thead>
      <tbody>${righe.map((p) => {
        const { fatti, tot } = avanz(p);
        const b = stato.bandi.find((x) => x.id === p.bandoId);
        return `<tr data-id="${esc(p.id)}"><td>${esc(nomeC(p.clienteId))}</td><td>${esc(nomeB(p.bandoId))}</td><td>${b && b.scadenza ? dataIt(b.scadenza) : ''}</td>
          <td><progress max="${tot || 1}" value="${fatti}"></progress> ${fatti}/${tot}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    ${righe.length ? '' : '<div class="vuoto">Nessuna pratica. Crea una pratica per abbinare un cliente a un bando: i passi vengono copiati dal modello del bando.</div>'}`;
  $('#fc').addEventListener('change', (e) => { f.cliente = e.target.value; renderPratiche(); });
  $('#fb').addEventListener('change', (e) => { f.bando = e.target.value; renderPratiche(); });
  $('#nuovo').addEventListener('click', apriNuovaPratica);
  main.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => apriPratica(tr.dataset.id)));
}

function apriNuovaPratica() {
  if (!stato.clienti.length || !stato.bandi.length) { mostraErrore('Servono almeno un cliente e un bando.'); return; }
  const opz = (l, n, sel) => l.map((x) => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x[n])}</option>`).join('');
  dlg.innerHTML = `<form method="dialog" id="frm"><h2 class="full">Nuova pratica</h2>
    <label>Cliente<select name="clienteId">${opz(stato.clienti, 'ragioneSociale', ui.pr.cliente)}</select></label>
    <label>Bando<select name="bandoId">${opz(stato.bandi, 'nome', ui.pr.bando)}</select></label>
    <div class="warn full">I passi vengono copiati dal modello del bando e poi si possono modificare.</div>
    <div class="actions full"><button type="button" class="btn2" id="annulla">Annulla</button><button type="submit" class="btn">Crea</button></div></form>`;
  $('#annulla').addEventListener('click', () => dlg.close());
  $('#frm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = e.target.elements;
    let nuova;
    const ok = await azione(async () => { nuova = await api('POST', '/api/pratiche', { clienteId: el.clienteId.value, bandoId: el.bandoId.value }); stato.pratiche.push(nuova); });
    if (ok) { dlg.close(); render(); apriPratica(nuova.id); }
  });
  dlg.showModal();
}

function apriPratica(id) {
  const p = stato.pratiche.find((x) => x.id === id);
  if (!p) return;
  const cliente = stato.clienti.find((c) => c.id === p.clienteId);
  const bando = stato.bandi.find((b) => b.id === p.bandoId);
  const salvaPassi = async () => {
    await azione(async () => { Object.assign(p, await api('PUT', '/api/pratiche/' + id, { passi: p.passi })); });
    disegna(); render();
  };
  const disegna = () => {
    const { fatti, tot } = avanz(p);
    const mancanti = ((bando && bando.modello) || []).filter((t) => !p.passi.some((x) => x.titolo === t));
    dlg.innerHTML = `<div id="pr">
      <h2>${esc(cliente ? cliente.ragioneSociale : '?')} · ${esc(bando ? bando.nome : '?')}</h2>
      <p class="counter"><progress max="${tot || 1}" value="${fatti}"></progress> ${fatti}/${tot} completati</p>
      <div>${p.passi.map((x, i) => `<div class="item${x.fatto ? ' fatto' : ''}" data-i="${i}">
        <input type="checkbox"${x.fatto ? ' checked' : ''}><div class="main"><div class="titolo">${esc(x.titolo)}</div></div><button class="edit" title="Rimuovi">×</button></div>`).join('') || '<div class="vuoto">Nessun passo.</div>'}</div>
      <div class="quick" style="margin-top:12px"><input id="nuovoPasso" placeholder="Nuovo passo (premi Invio)…"></div>
      <div class="actions">
        <button class="btn-danger" id="elimina">Elimina pratica</button>
        ${mancanti.length ? `<button class="btn2" id="sync">Aggiungi dal modello (${mancanti.length})</button>` : ''}
        <button class="btn" id="chiudi">Chiudi</button>
      </div></div>`;
    dlg.querySelectorAll('.item').forEach((el) => {
      const i = Number(el.dataset.i);
      el.querySelector('input').addEventListener('change', (e) => { p.passi[i].fatto = e.target.checked; salvaPassi(); });
      el.querySelector('.edit').addEventListener('click', () => { p.passi.splice(i, 1); salvaPassi(); });
    });
    $('#nuovoPasso').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      p.passi.push({ titolo: e.target.value.trim(), fatto: false }); salvaPassi();
    });
    const sync = $('#sync');
    if (sync) sync.addEventListener('click', () => { mancanti.forEach((t) => p.passi.push({ titolo: t, fatto: false })); salvaPassi(); });
    $('#chiudi').addEventListener('click', () => dlg.close());
    $('#elimina').addEventListener('click', async () => {
      if (!confirm('Eliminare questa pratica e la sua checklist?')) return;
      const ok = await azione(async () => { await api('DELETE', '/api/pratiche/' + id); stato.pratiche = stato.pratiche.filter((q) => q.id !== id); });
      if (ok) { dlg.close(); render(); }
    });
  };
  disegna();
  dlg.showModal();
}

// ---------- Esporta / Importa ----------
$('#esporta').addEventListener('click', () => { location.href = '/api/export'; });
$('#importa').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Importare questo file? Sostituirà tutti i dati attuali (verrà creato un backup).')) return;
  const ok = await azione(async () => {
    let dati;
    try { dati = JSON.parse(await file.text()); } catch (_) { throw new Error('Il file non è un JSON valido.'); }
    await api('POST', '/api/import', dati);
  });
  if (ok) carica();
});

$('#aggiorna').addEventListener('click', async () => {
  let r;
  const ok = await azione(async () => { r = await api('POST', '/api/aggiorna'); });
  if (!ok) return;
  if (!r.aggiornato) return alert('Sei già all\'ultima versione.');
  document.body.innerHTML = '<div class="wrap"><main class="card"><div class="loading">Aggiornamento scaricato. Il server si è fermato: riapri avvia.bat per usare la nuova versione. I dati non sono stati toccati.</div></main></div>';
});

$('#spegni').addEventListener('click', async () => {
  const ok = await azione(async () => { await api('POST', '/api/spegni'); });
  if (ok) document.body.innerHTML = '<div class="wrap"><main class="card"><div class="loading">Server spento. Puoi chiudere questa scheda. Per riaccendere, riapri avvia.bat.</div></main></div>';
});

// ---------- Avvio ----------
ui.tab = ['clienti', 'bandi', 'pratiche', 'checklist'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'clienti';
carica();
