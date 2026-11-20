'use strict';
/* Rikka – Hideaway Group Oy – www.hideawaygroup.fi */
const SUPA_URL = 'https://wzahtemqxdjmnorqnfhi.supabase.co';
const SUPA_KEY = 'sb_publishable_PTEr0PMpjUHRVzhohtJLcg_dm7fluXg';
const TUKI = 'tomi.kuusisto@hideawaygroup.fi';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY, {auth: {persistSession: true, autoRefreshToken: true}});

/* ---------- apurit ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nyt = () => new Date().toISOString();
const tanaan = () => new Date().toISOString().slice(0, 10);
const pvmFi = d => { if (!d) return ''; const x = new Date(String(d).length === 10 ? d + 'T12:00' : d); return isNaN(x) ? d : x.toLocaleDateString('fi-FI'); };
const aikaFi = d => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('fi-FI', {day:'numeric', month:'numeric'}) + ' klo ' + x.toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'}); };
const tiedostoNimi = s => (String(s || 'kohde').trim().replace(/[^\wåäöÅÄÖ-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'kohde');
const rnd = () => Math.random().toString(36).slice(2, 8);
const PIN = {oletus:'#0f766e', ok:'#15803d', ei:'#b91c1c', avoin:'#78716c'};
const TILAT = {tarjous:'Tarjousvaihe', aktiivinen:'Sopimus voimassa', paattynyt:'Päättynyt', hylatty:'Tarjous hylätty'};
const KAYTANNOT = {sallittu:'Kuvat sallittu (myös raportissa)', sisainen:'Kuvat vain sisäiseen käyttöön', ei:'Ei kuvia (tyhjä pohja)'};
const KAYTANTO_SELITE = {sallittu:'Kuvat näkyvät esimiehille ja kohteen siivoojille sekä raportissa vesileimattuina.', sisainen:'Kuvat näkyvät vain esimiehille ja kohteen siivoojille. Raportissa ei ole kuvia.', ei:'Kohteesta ei oteta kuvia. Siivottavat kohdat merkitään tyhjälle pohjalle.'};

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }
function busy(on, t) { let b = $('.busy'); if (on) { if (!b) { b = document.createElement('div'); b.className = 'busy'; document.body.appendChild(b); } b.textContent = t || 'Hetki…'; } else if (b) b.remove(); }
function virhe(e, oletus) {
  console.error(e);
  const m = (e && e.message) || '';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) toast('Ei yhteyttä palvelimeen. Tarkista verkkoyhteys.');
  else toast(oletus || m || 'Jokin meni vikaan');
}
const tarkista = r => { if (r.error) throw r.error; return r.data; };
function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }

/* ---------- tila ---------- */
const S = {user:null, prof:null, yritys:null, kohteet:[], b:null, kayttajat:[], stack:[{v:'alku'}], urls:{}};
const view = () => S.stack[S.stack.length - 1];
const es = () => S.prof && S.prof.rooli === 'esimies';
const me = () => S.user && S.user.id;

async function go(v) { S.stack.push(v); await nayta(); scrollTo(0, 0); }
async function back() { if (S.stack.length > 1) S.stack.pop(); await nayta(); }
async function home() { S.stack = [{v:'koti'}]; await nayta(); }
async function nayta() {
  const v = view(), f = LOAD[v.v];
  if (f) {
    const t = setTimeout(() => busy(true, 'Ladataan…'), 300);
    try { await f(v); } catch (e) { virhe(e, 'Tietojen haku epäonnistui'); }
    clearTimeout(t); busy(false);
  }
  render();
}

/* ---------- kuvien allekirjoitetut osoitteet ---------- */
async function urlit(paths) {
  const need = [...new Set(paths.filter(Boolean))].filter(p => !S.urls[p] || S.urls[p].exp < Date.now() + 60000);
  if (!need.length) return;
  const {data, error} = await sb.storage.from('kuvat').createSignedUrls(need, 600);
  if (error) { console.error(error); return; }
  (data || []).forEach(d => { if (d.signedUrl) S.urls[d.path] = {url:d.signedUrl, exp:Date.now() + 600000}; });
}
const url = p => p && S.urls[p] ? S.urls[p].url : null;

/* ---------- lataukset ---------- */
async function lataaYritys() { S.yritys = tarkista(await sb.from('yritykset').select('*').eq('id', S.prof.yritys_id).single()); }
async function lataaKayttajat() { S.kayttajat = tarkista(await sb.from('profiilit').select('*').order('rooli').order('nimi')); }
const ekaKuva = k => { const t = (k.tilat || []).filter(x => x.kuva_polku).sort((a, b) => a.jarjestys - b.jarjestys)[0]; return t ? t.kuva_polku : null; };
async function lataaKohteet() {
  S.kohteet = tarkista(await sb.from('kohteet').select('id,asiakas,osoite,tila,kuvakaytanto,muokattu,tilat(id,kuva_polku,jarjestys)').order('muokattu', {ascending:false}));
  await urlit(S.kohteet.map(ekaKuva));
}
async function lataaKuittaukset(b) {
  b.kuitt = {};
  if (!b.kayntiId) return;
  tarkista(await sb.from('kuittaukset').select('*').eq('kaynti_id', b.kayntiId)).forEach(r => { b.kuitt[r.piste_id] = r; });
}
async function lataaKohde(id) {
  const [k, t, p, ks, ka] = await Promise.all([
    sb.from('kohteet').select('*').eq('id', id).single(),
    sb.from('tilat').select('*').eq('kohde_id', id).order('jarjestys').order('luotu'),
    sb.from('pisteet').select('*').eq('kohde_id', id).order('jarjestys').order('luotu'),
    sb.from('kohde_siivoojat').select('kayttaja_id').eq('kohde_id', id),
    sb.from('kaynnit').select('*').eq('kohde_id', id).order('alku', {ascending:false}).limit(30)]);
  [k, t, p, ks, ka].forEach(tarkista);
  const vanha = S.b && S.b.k.id === id ? S.b : null;
  const b = {k:k.data, tilat:t.data.map(x => ({...x, pisteet:p.data.filter(q => q.tila_id === x.id)})), siivoojat:ks.data.map(x => x.kayttaja_id), kaynnit:ka.data, kayntiId:null, kuitt:{}, valittuKasin:false};
  if (es()) {
    if (vanha && vanha.valittuKasin && b.kaynnit.some(x => x.id === vanha.kayntiId)) { b.kayntiId = vanha.kayntiId; b.valittuKasin = true; }
    else b.kayntiId = b.kaynnit[0] ? b.kaynnit[0].id : null;
  } else {
    const a = b.kaynnit.find(x => x.siivooja_id === me() && !x.valmis); b.kayntiId = a ? a.id : null;
  }
  await lataaKuittaukset(b);
  S.b = b;
  await urlit(b.tilat.map(x => x.kuva_polku));
  if (es()) { if (!S.kayttajat.length) await lataaKayttajat(); kuuntele(id); }
}
const LOAD = {
  koti: lataaKohteet,
  kohde: v => lataaKohde(v.id),
  tila: async v => { if (!S.b || S.b.k.id !== v.id) await lataaKohde(v.id); else await urlit(S.b.tilat.map(x => x.kuva_polku)); },
  kayttajat: lataaKayttajat,
  asetukset: lataaYritys
};

/* ---------- reaaliaikainen tilannekuva (esimies) ---------- */
let kanava = null, odottaaRenderia = false;
function kuuntele(kid) {
  if (kanava && kanava.kid === kid) return;
  if (kanava) sb.removeChannel(kanava);
  kanava = sb.channel('kohde-' + kid)
    .on('postgres_changes', {event:'*', schema:'public', table:'kuittaukset', filter:'kohde_id=eq.' + kid}, livePaivitys)
    .on('postgres_changes', {event:'*', schema:'public', table:'kaynnit', filter:'kohde_id=eq.' + kid}, livePaivitys)
    .subscribe();
  kanava.kid = kid;
}
const livePaivitys = debounce(async () => {
  const v = view(); if (!S.b || !['kohde', 'tila'].includes(v.v) || v.id !== S.b.k.id) return;
  try {
    S.b.kaynnit = tarkista(await sb.from('kaynnit').select('*').eq('kohde_id', S.b.k.id).order('alku', {ascending:false}).limit(30));
    if (!S.b.valittuKasin) S.b.kayntiId = S.b.kaynnit[0] ? S.b.kaynnit[0].id : null;
    await lataaKuittaukset(S.b);
    turvallinenRender();
  } catch (e) { console.error(e); }
}, 600);
function turvallinenRender() {
  const a = document.activeElement;
  if (a && $('#app').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { odottaaRenderia = true; return; }
  if ($('#sheet').classList.contains('open')) { odottaaRenderia = true; return; }
  const y = scrollY; render(); scrollTo(0, y);
}
document.addEventListener('focusout', () => setTimeout(() => { if (odottaaRenderia && !$('#sheet').classList.contains('open')) { odottaaRenderia = false; turvallinenRender(); } }, 50));

/* ---------- laskenta ---------- */
function numerot() { const m = {}; let n = 1; S.b.tilat.forEach(t => t.pisteet.forEach(p => { m[p.id] = n++; })); return m; }
const kuittaus = pid => S.b.kuitt[pid] || null;
function pinVari(pid) {
  const q = kuittaus(pid), st = q && q.tila;
  if (!es()) return st ? PIN[st] : PIN.oletus;
  if (!S.b.kayntiId) return PIN.oletus;
  return st ? PIN[st] : PIN.avoin;
}
function tilasto(tilat) {
  const r = {yht:0, ok:0, ei:0, avoin:0};
  (tilat || S.b.tilat).forEach(t => t.pisteet.forEach(p => { r.yht++; const q = kuittaus(p.id); if (q && q.tila === 'ok') r.ok++; else if (q && q.tila === 'ei') r.ei++; else r.avoin++; }));
  return r;
}
function palkki(s) {
  const pc = v => s.yht ? (v / s.yht * 100).toFixed(1) : 0;
  return `<div class="bar"><i style="width:${pc(s.ok)}%;background:var(--ok)"></i><i style="width:${pc(s.ei)}%;background:var(--bad)"></i></div>
  <div class="counts"><span><i class="dot" style="background:var(--ok)"></i>Siivottu ${s.ok}</span><span><i class="dot" style="background:var(--bad)"></i>Ei siivottu ${s.ei}</span><span><i class="dot" style="background:#cfccc4"></i>Kuittaamatta ${s.avoin}</span></div>`;
}
function tilaMerkki(q) {
  if (!q || !q.tila) return '<span class="st avoin">Kuittaamatta</span>';
  return q.tila === 'ok' ? `<span class="st ok">✓ Siivottu · ${esc(aikaFi(q.aika))}</span>` : `<span class="st ei">✕ Ei siivottu · ${esc(aikaFi(q.aika))}</span>`;
}
function poistoPvm(k) {
  if (k.kuvat_poistettu) return `Kuvat poistettu ${pvmFi(k.kuvat_poistettu)}.`;
  if (!['paattynyt', 'hylatty'].includes(k.tila)) return '';
  const pv = (S.yritys && S.yritys.kuvien_sailytys_pv) || 60;
  return `Kuvat poistetaan automaattisesti ${pvmFi(new Date(new Date(k.tila_muutettu).getTime() + pv * 86400000).toISOString())}.`;
}

/* ---------- kuvat ja tiedostot ---------- */
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    document.body.appendChild(i);
    i.onchange = () => { res(i.files[0] || null); i.remove(); };
    i.click();
  });
}
function lueKuva(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1600; let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u);
      c.toBlob(blob => blob ? res({blob, w, h}) : rej(new Error('kuva')), 'image/jpeg', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Kuvaa ei voitu avata')); };
    img.src = u;
  });
}
async function lataaKuva(kohde, tilaId, blob) {
  const polku = `${kohde.yritys_id}/${kohde.id}/${tilaId}-${rnd()}.jpg`;
  tarkista(await sb.storage.from('kuvat').upload(polku, blob, {contentType:'image/jpeg', upsert:false}));
  return polku;
}
async function poistaKuvat(polut) { polut = polut.filter(Boolean); if (polut.length) await sb.storage.from('kuvat').remove(polut); }
async function tallennaTiedosto(nimi, blob) {
  const f = new File([blob], nimi, {type: blob.type || 'application/pdf'});
  try { if (navigator.canShare && navigator.canShare({files:[f]})) { await navigator.share({files:[f], title:nimi}); return true; } }
  catch (e) { if (e && e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nimi; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return true;
}
async function kutsuFunktio(nimi, body) {
  const {data, error} = await sb.functions.invoke(nimi, {body});
  if (error) {
    let m = 'Toiminto epäonnistui';
    try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) {}
    throw new Error(m);
  }
  return data;
}

/* ---------- alalaatikko ---------- */
let sheetClose = null;
function openSheet(html, onMount, onCancel) {
  const sh = $('#sheet'), bg = $('#sheetBg');
  sh.innerHTML = '<div class="grab"></div>' + html;
  bg.style.display = 'block'; requestAnimationFrame(() => sh.classList.add('open'));
  sheetClose = onCancel || null;
  bg.onclick = () => { const c = sheetClose; closeSheet(); if (c) c(); };
  if (onMount) onMount(sh);
}
function closeSheet() {
  $('#sheet').classList.remove('open'); $('#sheetBg').style.display = 'none'; sheetClose = null;
  if (odottaaRenderia) { odottaaRenderia = false; setTimeout(turvallinenRender, 250); }
}
function vahvista(teksti, ok, vaarallinen, lisa) {
  return new Promise(res => {
    openSheet(`<h3>${esc(teksti)}</h3>${lisa ? `<p class="muted small">${esc(lisa)}</p>` : ''}<div class="row"><button data-x="no">Peruuta</button><button class="${vaarallinen ? 'danger' : 'pri'}" data-x="yes">${esc(ok)}</button></div>`,
      sh => sh.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { closeSheet(); res(b.dataset.x === 'yes'); }),
      () => res(false));
  });
}

/* ---------- näkymät ---------- */
function topbar(title, right) {
  const b = S.stack.length > 1 ? '<button class="back" data-act="back" aria-label="Takaisin">‹</button>' : '';
  const m = S.stack.length > 1 ? '' : '<img class="mark" src="logo.svg" alt="">';
  return `<div class="top"><div class="in">${b}${m}<h1>${esc(title)}</h1>${right || ''}</div></div>`;
}
const footer = () => '<div class="foot"><img class="mark" src="logo.svg" alt="">Rikka · Hideaway Group Oy · www.hideawaygroup.fi</div>';

function render() {
  const app = $('#app'), v = view();
  const V = {alku:() => '<div class="loading">Ladataan…</div>', kirjaudu:vKirjaudu, rekisteroi:vRekisteroi, vaihdaSalasana:vVaihdaSalasana, koti:vKoti, kohde:vKohde, tila:vTila, kayttajat:vKayttajat, asetukset:vAsetukset};
  if (['kohde', 'tila'].includes(v.v) && (!S.b || S.b.k.id !== v.id)) { app.innerHTML = topbar('Rikka') + '<div class="wrap"><div class="empty"><b>Kohdetta ei löytynyt</b>Se on ehkä poistettu, tai sinulla ei ole siihen enää oikeutta.</div></div>'; return; }
  if (v.v === 'tila' && !S.b.tilat.find(t => t.id === v.tid)) { S.stack.pop(); render(); return; }
  app.innerHTML = (V[v.v] || V.alku)();
  if (v.v === 'tila' && es()) pinEditori();
  if (v.v === 'tila' && !es()) pinLinkit();
}

function vKirjaudu() {
  return `<div class="auth"><div class="brandrow"><img class="mark" src="logo.svg" alt=""><span class="brand">Rikka<i>.</i></span></div><p class="muted" style="margin-top:14px">Siivouskohteiden kartoitus, tarjousraportti ja siivousten kuittaus.</p>
  <form id="fLogin" class="card" autocomplete="on"><h2>Kirjaudu</h2>
  <label for="lEmail">Sähköposti</label><input id="lEmail" type="email" autocomplete="username" required>
  <label for="lPw">Salasana</label><input id="lPw" type="password" autocomplete="current-password" required>
  <div class="err" id="lErr"></div>
  <button class="pri block" type="submit" style="margin-top:6px">Kirjaudu</button>
  <p class="muted small" style="margin:14px 0 0">Unohtuiko salasana? Pyydä esimiestäsi nollaamaan se. Esimiehet: ota yhteyttä ${esc(TUKI)}.</p></form>
  <div class="card"><h2>Uusi siivousyritys?</h2><p class="muted small" style="margin:0 0 10px">Rekisteröi yrityksesi ja luo esimiehen tunnus. Siivoojat lisäät sovelluksessa.</p>
  <button class="block" data-act="rekisteroiNakyma">Rekisteröi yritys</button></div>${footer()}</div>`;
}
function vRekisteroi() {
  return `<div class="auth"><button class="link" data-act="kirjauduNakyma">‹ Takaisin kirjautumiseen</button>
  <form id="fReg" class="card"><h2>Rekisteröi siivousyritys</h2>
  <label for="rY">Yrityksen nimi</label><input id="rY" required autocomplete="organization">
  <label for="rN">Oma nimesi</label><input id="rN" required autocomplete="name">
  <label for="rE">Sähköposti</label><input id="rE" type="email" required autocomplete="username">
  <label for="rP">Salasana (vähintään 8 merkkiä)</label><input id="rP" type="password" minlength="8" required autocomplete="new-password">
  <div class="err" id="rErr"></div>
  <button class="pri block" type="submit" style="margin-top:6px">Luo tunnus</button></form>${footer()}</div>`;
}
function vVaihdaSalasana() {
  return `<div class="auth"><form id="fPw" class="card"><h2>Vaihda salasana</h2>
  <p class="muted small" style="margin:0">Sait tilapäisen salasanan. Valitse nyt oma salasana, jota vain sinä tiedät.</p>
  <label for="p1">Uusi salasana (vähintään 8 merkkiä)</label><input id="p1" type="password" minlength="8" required autocomplete="new-password">
  <label for="p2">Uusi salasana uudelleen</label><input id="p2" type="password" minlength="8" required autocomplete="new-password">
  <div class="err" id="pErr"></div><button class="pri block" type="submit" style="margin-top:6px">Tallenna salasana</button></form>
  <button class="link" data-act="ulos">Kirjaudu ulos</button></div>`;
}

function vKoti() {
  const gear = '<button class="ghost" data-act="asetukset" aria-label="Asetukset" style="font-size:20px">⚙︎</button>';
  const users = es() ? '<button class="ghost" data-act="kayttajat" aria-label="Käyttäjät" style="font-size:14px;font-weight:600;color:var(--pri-d)">Käyttäjät</button>' : '';
  let h = topbar(S.yritys ? S.yritys.nimi : 'Rikka', `<span class="pill">${es() ? 'Esimies' : 'Siivooja'}</span>${users}${gear}`) + '<div class="wrap">';
  if (es()) h += '<div class="row"><button class="pri" data-act="uusiKohde">+ Uusi kohde</button></div>';
  if (!S.kohteet.length) {
    h += `<div class="empty"><b>${es() ? 'Ei vielä kohteita' : 'Ei siivouskohteita'}</b>${es()
      ? 'Luo uusi kohde asiakaskäynnillä: ota kuvat tiloista ja merkitse niihin siivottavat paikat. Lisää siivoojat kohdasta Käyttäjät.'
      : 'Esimies lisää sinut kohteisiin. Ne näkyvät tässä automaattisesti.'}</div>`;
  }
  S.kohteet.forEach(k => {
    const u = url(ekaKuva(k));
    h += `<button class="item" data-act="avaa" data-id="${k.id}">${u ? `<img src="${esc(u)}" alt="">` : `<div class="ph">${esc((k.asiakas || '?')[0])}</div>`}
      <div class="t"><b>${esc(k.asiakas)}</b><div class="muted small">${esc(k.osoite || '')}</div>
      <div class="small" style="margin-top:4px">${es() ? `<span class="badge ${k.tila}">${TILAT[k.tila]}</span> ` : ''}${(k.tilat || []).length} tilaa</div></div><span class="chev">›</span></button>`;
  });
  return h + footer() + '</div>';
}

function infoKortti(k) {
  const rivit = [['Osoite', k.osoite], ['Yhteyshenkilö', [k.yhteyshenkilo, k.puhelin].filter(Boolean).join(', ')], ['Kartoitettu', pvmFi(k.pvm)], ['Lisätiedot', k.lisatiedot]]
    .filter(r => r[1]).map(r => `<dt>${r[0]}</dt><dd style="white-space:pre-wrap">${esc(r[1])}</dd>`).join('');
  return `<div class="card"><div style="display:flex;align-items:center;gap:8px"><h2 style="flex:1;margin:0">${esc(k.asiakas)}</h2>${es() ? '<button class="ghost" data-act="muokkaaKohde">Muokkaa</button>' : ''}</div>
  <dl class="info" style="margin:0">${rivit || '<dd class="muted small">Ei lisätietoja.</dd>'}</dl></div>`;
}
function tilaLista(nayttaaTilan) {
  return S.b.tilat.map(t => {
    const s = tilasto([t]), u = url(t.kuva_polku);
    const lisa = nayttaaTilan ? ` · ${s.ok}/${s.yht} siivottu${s.ei ? `, ${s.ei} ei` : ''}` : '';
    return `<button class="item" data-act="avaaTila" data-tid="${t.id}">${u ? `<img src="${esc(u)}" alt="">` : '<div class="ph" style="font-size:13px">pohja</div>'}<div class="t"><b>${esc(t.nimi)}</b><div class="muted small">${s.yht} kohtaa${lisa}</div></div><span class="chev">›</span></button>`;
  }).join('');
}

function vKohde() {
  const b = S.b, k = b.k, s = tilasto(), num = numerot();
  let h = topbar(k.asiakas) + '<div class="wrap">' + infoKortti(k);
  if (es()) {
    const pp = poistoPvm(k);
    h += `<div class="card"><h2>Kohteen tila ja kuvat</h2>
      <label for="kTila">Tila</label><select id="kTila">${Object.entries(TILAT).map(([a, l]) => `<option value="${a}" ${k.tila === a ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label for="kKuvat">Asiakkaan toive kuvista</label><select id="kKuvat">${Object.entries(KAYTANNOT).map(([a, l]) => `<option value="${a}" ${k.kuvakaytanto === a ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <p class="muted small" style="margin:8px 0 0">${KAYTANTO_SELITE[k.kuvakaytanto]}</p>
      ${pp ? `<p class="small" style="margin:10px 0 0;color:var(--open)">${esc(pp)}</p>` : '<p class="muted small" style="margin:10px 0 0">Kun kohde merkitään päättyneeksi tai tarjous hylätyksi, kuvat poistetaan automaattisesti säilytysajan jälkeen.</p>'}</div>`;

    const siiv = S.kayttajat.filter(u => u.rooli === 'siivooja');
    h += `<div class="card"><h2>Siivoojat</h2>${siiv.length ? siiv.map(u => `<label class="chk"><input type="checkbox" data-siivooja="${u.id}" ${b.siivoojat.includes(u.id) ? 'checked' : ''}>${esc(u.nimi || u.email)}</label>`).join('')
      : '<p class="muted small" style="margin:0">Ei vielä siivoojia. Lisää heidät kohdasta Käyttäjät.</p>'}</div>`;

    h += '<div class="card"><h2>Tilannekuva</h2>';
    if (b.kaynnit.length) {
      const ka = b.kaynnit.find(x => x.id === b.kayntiId);
      h += `<select id="kKaynti">${b.kaynnit.map(x => `<option value="${x.id}" ${x.id === b.kayntiId ? 'selected' : ''}>${esc(aikaFi(x.alku))} · ${esc(x.siivooja_nimi || 'Siivooja')}${x.valmis ? ' · valmis' : ''}</option>`).join('')}</select>
        <div class="muted small" style="margin-top:8px">${ka ? `Päivitetty ${esc(aikaFi(ka.paivitetty))}${ka.valmis ? ' · käynti merkitty valmiiksi' : ' · käynti kesken'}` : ''}</div>${palkki(s)}`;
      const huom = [];
      b.tilat.forEach(t => t.pisteet.forEach(p => { const q = kuittaus(p.id); if (q && (q.tila === 'ei' || q.kommentti)) huom.push({t, p, q}); }));
      if (huom.length) h += '<div style="margin-top:12px">' + huom.map(({t, p, q}) => `<div class="issue"><b>${num[p.id]}. ${esc(p.otsikko || 'Kohta')}</b> <span class="muted">(${esc(t.nimi)})</span><br>${q.tila === 'ei' ? '<span style="color:var(--bad);font-weight:600">Ei siivottu</span>' : q.tila === 'ok' ? '<span style="color:var(--ok);font-weight:600">Siivottu</span>' : '<span class="muted">Kommentti</span>'}${q.kommentti ? ': ' + esc(q.kommentti) : ''}</div>`).join('') + '</div>';
      h += '<p class="muted small" style="margin:10px 0 0">Päivittyy automaattisesti, kun siivooja kuittaa.</p>';
    } else h += '<p class="muted small" style="margin:0">Ei vielä siivouskäyntejä. Tilanne päivittyy tähän automaattisesti, kun siivooja kuittaa ensimmäisen kohdan.</p>';
    h += '</div>';

    h += `<div class="card"><h2>Tilat</h2>${b.tilat.length ? tilaLista(!!b.kayntiId) : `<p class="muted small" style="margin:0">${k.kuvakaytanto === 'ei' ? 'Lisää tila. Siivottavat kohdat merkitään tyhjälle pohjalle.' : 'Lisää ensimmäinen tila ottamalla siitä kuva.'}</p>`}
      <div class="row"><button class="pri" data-act="lisaaTila">+ Lisää tila${k.kuvakaytanto === 'ei' ? '' : ' (kuva)'}</button></div></div>`;
    h += `<div class="card"><h2>Raportti</h2><button class="pri block" data-act="raportti" ${s.yht ? '' : 'disabled'}>Luo A4-raportti (PDF)</button>
      <p class="muted small">${k.kuvakaytanto === 'sallittu' ? 'Kuviin tulee vesileima "Luottamuksellinen", asiakkaan nimi ja päivämäärä.' : 'Raportissa ei ole kuvia asiakkaan toiveen mukaisesti, vain numeroitu luettelo.'}</p></div>
      <button class="danger block" data-act="poistaKohde" style="margin-top:14px">Poista kohde ja sen kuvat</button>`;
  } else {
    const ka = b.kaynnit.find(x => x.id === b.kayntiId);
    h += `<div class="card"><h2>Siivouskäynti</h2>${ka ? `<div class="muted small">Aloitettu ${esc(aikaFi(ka.alku))}</div>` : '<div class="muted small">Käynti alkaa ensimmäisestä kuittauksesta.</div>'}${palkki(s)}
      <div class="row"><button class="pri" data-act="kayntiValmis" ${ka ? '' : 'disabled'}>Merkitse käynti valmiiksi</button></div>
      <p class="muted small">Kuittaukset näkyvät esimiehelle heti. Valmiiksi merkitsemisen jälkeen seuraava kuittaus aloittaa uuden käynnin.</p></div>`;
    h += `<div class="card"><h2>Siivottavat tilat</h2>${b.tilat.length ? tilaLista(true) : '<p class="muted small" style="margin:0">Kohteessa ei ole vielä tiloja.</p>'}</div>`;
  }
  return h + '</div>';
}

function kuvaAlue(t, num, edit) {
  const u = url(t.kuva_polku);
  const pins = t.pisteet.map(p => `<div class="pin" data-pid="${p.id}" style="left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%;background:${p.id === 'uusi' ? PIN.oletus : pinVari(p.id)}">${p.id === 'uusi' ? '+' : num[p.id]}</div>`).join('');
  if (u) return `<div class="photo${edit ? ' edit' : ''}" id="photo"><img src="${esc(u)}" alt="">${pins}</div>`;
  const syy = t.kuva_polku ? 'Kuvaa ei voitu ladata' : S.b.k.kuvat_poistettu ? 'Kuva poistettu säilytysajan päätyttyä' : S.b.k.kuvakaytanto === 'ei' ? 'Pohja (ei kuvia)' : 'Ei kuvaa';
  return `<div class="photo${edit ? ' edit' : ''}" id="photo"><div class="pohja"><span class="lbl">${esc(syy)}</span></div>${pins}</div>`;
}
function vTila() {
  const v = view(), t = S.b.tilat.find(x => x.id === v.tid), num = numerot();
  let h = topbar(t.nimi) + '<div class="wrap">';
  if (es()) {
    h += `<input class="title-input" id="tilaNimi" value="${esc(t.nimi)}" aria-label="Tilan nimi">${kuvaAlue(t, num, true)}
      <p class="hint">Napauta ${t.kuva_polku ? 'kuvaa' : 'pohjaa'} lisätäksesi siivottavan kohdan. Vedä palloa siirtääksesi sitä, napauta muokataksesi.</p>`;
    const kohdat = t.pisteet.filter(p => p.id !== 'uusi');
    if (!kohdat.length) h += '<div class="empty" style="padding:20px"><b>Ei vielä merkintöjä</b>Napauta paikkaa, joka kuuluu siivousvastuulle.</div>';
    kohdat.forEach(p => {
      const q = S.b.kayntiId ? kuittaus(p.id) : undefined;
      h += `<button class="pt clickable" id="pt-${p.id}" data-act="muokkaaPiste" data-pid="${p.id}"><div class="num" style="background:${pinVari(p.id)}">${num[p.id]}</div><div class="body">
        <b>${esc(p.otsikko || 'Nimetön kohta')}</b>${p.teksti ? `<p class="muted">${esc(p.teksti)}</p>` : ''}
        ${q !== undefined ? tilaMerkki(q) + (q && q.kommentti ? `<div class="kom">${esc(q.kommentti)}</div>` : '') : ''}</div></button>`;
    });
    h += `<div class="row">${S.b.k.kuvakaytanto === 'ei' ? '' : `<button data-act="vaihdaKuva">${t.kuva_polku ? 'Vaihda kuva' : 'Lisää kuva'}</button>`}<button class="danger" data-act="poistaTila">Poista tila</button></div>`;
  } else {
    h += kuvaAlue(t, num, false) + '<p class="hint">Napauta palloa nähdäksesi kohdan.</p>';
    t.pisteet.forEach(p => {
      const q = kuittaus(p.id);
      h += `<div class="pt" id="pt-${p.id}"><div class="num" style="background:${pinVari(p.id)}">${num[p.id]}</div><div class="body">
        <b>${esc(p.otsikko || 'Kohta')}</b>${p.teksti ? `<p class="muted">${esc(p.teksti)}</p>` : ''}
        ${q && q.kommentti ? `<div class="kom">${esc(q.kommentti)}</div>` : ''}
        <div class="btns"><button class="okb ${q && q.tila === 'ok' ? 'on' : ''}" data-act="kuittaa" data-pid="${p.id}" data-t="ok">✓ Siivottu</button>
        <button class="eib ${q && q.tila === 'ei' ? 'on' : ''}" data-act="kuittaa" data-pid="${p.id}" data-t="ei">✕ Ei siivottu</button>
        <button data-act="kommentoi" data-pid="${p.id}">Kommentti</button></div></div></div>`;
    });
    if (t.pisteet.length) h += '<div class="row"><button class="pri" data-act="kaikkiOk">Merkitse kaikki tämän tilan kohdat siivotuiksi</button></div>';
  }
  return h + '</div>';
}

function vKayttajat() {
  const rivi = u => `<div class="user"><div class="t"><b>${esc(u.nimi || '(nimetön)')}</b>${u.id === me() ? ' <span class="muted small">(sinä)</span>' : ''}<div class="muted small">${esc(u.email || '')}</div>
    ${u.vaihda_salasana ? '<div class="small" style="color:var(--open)">Ei ole vielä kirjautunut / vaihtanut salasanaa</div>' : ''}</div>
    ${u.id === me() ? '' : `<div class="ua"><button class="ghost" data-act="nollaa" data-id="${u.id}">Nollaa salasana</button><button class="ghost" style="color:var(--bad)" data-act="poistaKayttaja" data-id="${u.id}">Poista</button></div>`}</div>`;
  const e = S.kayttajat.filter(u => u.rooli === 'esimies'), s = S.kayttajat.filter(u => u.rooli === 'siivooja');
  return topbar('Käyttäjät') + `<div class="wrap"><div class="row"><button class="pri" data-act="lisaaKayttaja">+ Lisää käyttäjä</button></div>
    <div class="card"><h2>Siivoojat (${s.length})</h2>${s.map(rivi).join('') || '<p class="muted small" style="margin:0">Ei vielä siivoojia.</p>'}</div>
    <div class="card"><h2>Esimiehet (${e.length})</h2>${e.map(rivi).join('')}</div>
    <p class="muted small">Poistettu käyttäjä ei pääse enää sovellukseen, eikä hän näe kohteita tai kuvia. Hänen tekemänsä kuittaukset säilyvät.</p></div>`;
}

function vAsetukset() {
  const y = S.yritys || {}, p = S.prof;
  return topbar('Asetukset') + `<div class="wrap">
    ${es() ? `<form class="card" id="fYritys"><h2>Yrityksen tiedot</h2><p class="muted small" style="margin:0">Näkyvät A4-raportissa.</p>
      <label for="yN">Yrityksen nimi</label><input id="yN" value="${esc(y.nimi)}" required>
      <label for="yP">Puhelin</label><input id="yP" type="tel" value="${esc(y.puhelin)}">
      <label for="yE">Sähköposti</label><input id="yE" type="email" value="${esc(y.email)}">
      <label for="yS">Kuvien säilytysaika kohteen päättymisen tai tarjouksen hylkäämisen jälkeen (päivää)</label><input id="yS" type="number" min="7" max="3650" value="${esc(y.kuvien_sailytys_pv)}">
      <button class="pri block" type="submit" style="margin-top:14px">Tallenna</button></form>` : ''}
    <form class="card" id="fOma"><h2>Omat tiedot</h2><label for="oN">Nimesi</label><input id="oN" value="${esc(p.nimi)}" required>
      <p class="muted small">Kirjautunut: ${esc(S.user.email)}</p><button class="pri block" type="submit">Tallenna</button></form>
    <div class="card"><h2>Tili</h2><div class="row" style="margin-top:4px"><button data-act="omaSalasana">Vaihda salasana</button><button class="danger" data-act="ulos">Kirjaudu ulos</button></div></div>
    <div class="card"><h2>Tietoturva</h2><p class="muted small" style="margin:0">Kuvat ovat suljetussa palvelinvarastossa EU:ssa. Niitä näkevät vain oman yrityksesi esimiehet ja kohteeseen lisätyt siivoojat, eikä niitä tallenneta puhelimen kuvagalleriaan.</p></div>
    ${footer()}</div>`;
}

/* ---------- pallojen muokkaus (esimies) ---------- */
function pinEditori() {
  const ph = $('#photo'); if (!ph) return;
  const v = view(), t = S.b.tilat.find(x => x.id === v.tid);
  const alue = () => (ph.querySelector('img') || ph.querySelector('.pohja')).getBoundingClientRect();
  const coords = e => { const r = alue(); return {x:Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y:Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))}; };
  ph.addEventListener('click', e => {
    if (e.target.closest('.pin') || t.pisteet.some(p => p.id === 'uusi')) return;
    const c = coords(e), p = {id:'uusi', x:c.x, y:c.y, otsikko:'', teksti:''};
    t.pisteet.push(p); render(); pisteLomake(t, p);
  });
  ph.querySelectorAll('.pin').forEach(el => {
    if (el.dataset.pid === 'uusi') return;
    let st = null;
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); st = {x:e.clientX, y:e.clientY, moved:false}; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!st) return;
      if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) { st.moved = true; el.classList.add('drag'); }
      if (st.moved) { const c = coords(e); el.style.left = c.x * 100 + '%'; el.style.top = c.y * 100 + '%'; }
    });
    el.addEventListener('pointerup', async e => {
      if (!st) return; const moved = st.moved; st = null; el.classList.remove('drag');
      const p = t.pisteet.find(x => x.id === el.dataset.pid); if (!p) return;
      if (moved) {
        const c = coords(e); p.x = c.x; p.y = c.y;
        try { tarkista(await sb.from('pisteet').update({x:c.x, y:c.y}).eq('id', p.id)); } catch (er) { virhe(er, 'Siirron tallennus epäonnistui'); }
      } else pisteLomake(t, p);
    });
    el.addEventListener('pointercancel', () => { st = null; el.classList.remove('drag'); render(); });
  });
}
function pisteLomake(t, p) {
  const uusi = p.id === 'uusi', n = uusi ? '' : numerot()[p.id];
  const peru = () => { if (uusi) { t.pisteet = t.pisteet.filter(x => x !== p); render(); } };
  openSheet(`<h3>${uusi ? 'Uusi kohta' : 'Kohta ' + n}</h3><p class="muted small" style="margin:0">${esc(t.nimi)}</p>
    <label for="pOts">Otsikko</label><input id="pOts" value="${esc(p.otsikko)}" placeholder="Esim. Ikkunalaudat">
    <label for="pTxt">Kuvaus</label><textarea id="pTxt" placeholder="Mitä tehdään ja kuinka usein. Esim. Pyyhintä kostealla liinalla 1 x viikossa.">${esc(p.teksti)}</textarea>
    <div class="row"><button data-x="peru">Peruuta</button><button class="pri" data-x="ok">Tallenna</button></div>
    ${uusi ? '' : '<button class="danger block" data-x="del" style="margin-top:10px">Poista kohta</button>'}`,
    sh => {
      if (uusi) setTimeout(() => sh.querySelector('#pOts').focus(), 250);
      sh.querySelector('[data-x=peru]').onclick = () => { closeSheet(); peru(); };
      sh.querySelector('[data-x=ok]').onclick = async e => {
        const otsikko = sh.querySelector('#pOts').value.trim(), teksti = sh.querySelector('#pTxt').value.trim();
        e.target.disabled = true;
        try {
          if (uusi) {
            const r = tarkista(await sb.from('pisteet').insert({tila_id:t.id, kohde_id:S.b.k.id, yritys_id:S.b.k.yritys_id, x:p.x, y:p.y, otsikko, teksti, jarjestys:t.pisteet.length}).select().single());
            Object.assign(p, r);
          } else {
            tarkista(await sb.from('pisteet').update({otsikko, teksti}).eq('id', p.id));
            Object.assign(p, {otsikko, teksti});
          }
          closeSheet(); render();
        } catch (er) { e.target.disabled = false; virhe(er, 'Tallennus epäonnistui'); }
      };
      const d = sh.querySelector('[data-x=del]');
      if (d) d.onclick = async () => {
        try { tarkista(await sb.from('pisteet').delete().eq('id', p.id)); t.pisteet = t.pisteet.filter(x => x !== p); closeSheet(); render(); }
        catch (er) { virhe(er, 'Poisto epäonnistui'); }
      };
    }, peru);
}
function pinLinkit() {
  const ph = $('#photo'); if (!ph) return;
  ph.querySelectorAll('.pin').forEach(el => el.addEventListener('click', () => {
    const c = document.getElementById('pt-' + el.dataset.pid);
    if (c) { c.scrollIntoView({behavior:'smooth', block:'center'}); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 900); }
  }));
}

/* ---------- lomakkeet ---------- */
function kohdeLomake(k) {
  const uusi = !k; k = k || {asiakas:'', osoite:'', yhteyshenkilo:'', puhelin:'', pvm:tanaan(), lisatiedot:'', kuvakaytanto:'sallittu'};
  openSheet(`<h3>${uusi ? 'Uusi kohde' : 'Muokkaa kohdetta'}</h3>
    <label for="kA">Asiakas *</label><input id="kA" value="${esc(k.asiakas)}" placeholder="Yrityksen tai asiakkaan nimi">
    <label for="kO">Osoite</label><input id="kO" value="${esc(k.osoite)}" placeholder="Katuosoite, kaupunki">
    <label for="kY">Yhteyshenkilö</label><input id="kY" value="${esc(k.yhteyshenkilo)}">
    <label for="kP">Yhteyshenkilön puhelin</label><input id="kP" type="tel" value="${esc(k.puhelin)}">
    <label for="kD">Kartoituspäivä</label><input id="kD" type="date" value="${esc(k.pvm)}">
    ${uusi ? `<label for="kK">Asiakkaan toive kuvista</label><select id="kK">${Object.entries(KAYTANNOT).map(([a, l]) => `<option value="${a}">${l}</option>`).join('')}</select>` : ''}
    <label for="kL">Lisätiedot</label><textarea id="kL" placeholder="Esim. siivousväli, avainjärjestelyt">${esc(k.lisatiedot)}</textarea>
    <p class="muted small">Älä kirjoita tänne hälytys- tai ovikoodeja.</p>
    <div class="row"><button data-x="peru">Peruuta</button><button class="pri" data-x="ok">${uusi ? 'Luo kohde' : 'Tallenna'}</button></div>`,
    sh => {
      sh.querySelector('[data-x=peru]').onclick = closeSheet;
      sh.querySelector('[data-x=ok]').onclick = async e => {
        const g = id => sh.querySelector(id).value.trim();
        if (!g('#kA')) { sh.querySelector('#kA').focus(); toast('Anna asiakkaan nimi'); return; }
        const d = {asiakas:g('#kA'), osoite:g('#kO'), yhteyshenkilo:g('#kY'), puhelin:g('#kP'), pvm:g('#kD') || null, lisatiedot:g('#kL')};
        e.target.disabled = true;
        try {
          if (uusi) {
            const r = tarkista(await sb.from('kohteet').insert({...d, kuvakaytanto:g('#kK'), yritys_id:S.prof.yritys_id, luoja:me()}).select().single());
            closeSheet(); await go({v:'kohde', id:r.id});
          } else {
            tarkista(await sb.from('kohteet').update(d).eq('id', S.b.k.id));
            Object.assign(S.b.k, d); closeSheet(); render();
          }
        } catch (er) { e.target.disabled = false; virhe(er, 'Tallennus epäonnistui'); }
      };
    });
}
function kommenttiLomake(pid) {
  const q = kuittaus(pid) || {};
  const syyt = ['Ovi oli lukossa', 'Ei pääsyä tilaan', 'Tila oli käytössä', 'Tarvikkeet loppu', 'Vaatii lisäsiivousta'];
  openSheet(`<h3>Kommentti</h3><p class="muted small" style="margin:0">Näkyy esimiehelle heti.</p>
    <div class="chips">${syyt.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <label for="kom">Kommentti</label><textarea id="kom" placeholder="Kirjoita kommentti">${esc(q.kommentti || '')}</textarea>
    <div class="row"><button data-x="peru">Peruuta</button><button class="pri" data-x="ok">Tallenna</button></div>`,
    sh => {
      const ta = sh.querySelector('#kom');
      sh.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { ta.value = ta.value.trim() ? ta.value.trim() + '. ' + b.dataset.s : b.dataset.s; });
      sh.querySelector('[data-x=peru]').onclick = closeSheet;
      sh.querySelector('[data-x=ok]').onclick = async e => {
        e.target.disabled = true;
        try { await kirjaaKuittaus(pid, (kuittaus(pid) || {}).tila || null, ta.value.trim()); closeSheet(); render(); }
        catch (er) { e.target.disabled = false; virhe(er, 'Tallennus epäonnistui'); }
      };
    });
}
function kayttajaLomake() {
  openSheet(`<h3>Lisää käyttäjä</h3>
    <label for="uN">Nimi</label><input id="uN" autocomplete="off">
    <label for="uE">Sähköposti (käyttäjätunnus)</label><input id="uE" type="email" autocomplete="off">
    <label for="uR">Rooli</label><select id="uR"><option value="siivooja">Siivooja</option><option value="esimies">Esimies</option></select>
    <p class="muted small">Saat tilapäisen salasanan, jonka annat käyttäjälle. Hän vaihtaa sen ensimmäisellä kirjautumisella.</p>
    <div class="err" id="uErr"></div>
    <div class="row"><button data-x="peru">Peruuta</button><button class="pri" data-x="ok">Lisää</button></div>`,
    sh => {
      setTimeout(() => sh.querySelector('#uN').focus(), 250);
      sh.querySelector('[data-x=peru]').onclick = closeSheet;
      sh.querySelector('[data-x=ok]').onclick = async e => {
        const nimi = sh.querySelector('#uN').value.trim(), email = sh.querySelector('#uE').value.trim(), rooli = sh.querySelector('#uR').value;
        e.target.disabled = true; sh.querySelector('#uErr').textContent = '';
        try {
          const r = await kutsuFunktio('kayttajat', {toiminto:'lisaa', nimi, email, rooli});
          await lataaKayttajat(); render();
          naytaSalasana(nimi, email, r.salasana, 'Käyttäjä lisätty');
        } catch (er) { e.target.disabled = false; sh.querySelector('#uErr').textContent = er.message; }
      };
    });
}
function naytaSalasana(nimi, email, salasana, otsikko) {
  const osoite = location.origin + location.pathname;
  const viesti = `Hei ${nimi}! Sinulle on luotu tunnus Rikka-sovellukseen.\n\nOsoite: ${osoite}\nKäyttäjätunnus: ${email}\nTilapäinen salasana: ${salasana}\n\nVaihdat salasanan ensimmäisellä kirjautumisella.`;
  openSheet(`<h3>${esc(otsikko)}</h3><p class="small" style="margin:0">Anna nämä tiedot käyttäjälle <b>${esc(nimi)}</b>:</p>
    <p class="small" style="margin:8px 0 0">Osoite: <b>${esc(osoite)}</b><br>Tunnus: <b>${esc(email)}</b></p>
    <div class="pw">${esc(salasana)}</div>
    <p class="muted small" style="margin:0">Salasana näytetään vain nyt. Jos se hukkuu, voit nollata sen uudelleen.</p>
    <div class="row"><button data-x="kopio">Kopioi viesti</button><button class="pri" data-x="ok">Valmis</button></div>`,
    sh => {
      sh.querySelector('[data-x=ok]').onclick = closeSheet;
      sh.querySelector('[data-x=kopio]').onclick = async () => {
        try { await navigator.clipboard.writeText(viesti); toast('Viesti kopioitu'); } catch (e) { toast('Kopiointi ei onnistunut'); }
      };
    });
}
function salasanaLomake() {
  openSheet(`<h3>Vaihda salasana</h3>
    <label for="s1">Uusi salasana (vähintään 8 merkkiä)</label><input id="s1" type="password" autocomplete="new-password">
    <label for="s2">Uusi salasana uudelleen</label><input id="s2" type="password" autocomplete="new-password">
    <div class="err" id="sErr"></div><div class="row"><button data-x="peru">Peruuta</button><button class="pri" data-x="ok">Tallenna</button></div>`,
    sh => {
      sh.querySelector('[data-x=peru]').onclick = closeSheet;
      sh.querySelector('[data-x=ok]').onclick = async e => {
        const a = sh.querySelector('#s1').value, b = sh.querySelector('#s2').value, er = sh.querySelector('#sErr');
        if (a.length < 8) { er.textContent = 'Vähintään 8 merkkiä'; return; }
        if (a !== b) { er.textContent = 'Salasanat eivät täsmää'; return; }
        e.target.disabled = true;
        const {error} = await sb.auth.updateUser({password:a});
        if (error) { e.target.disabled = false; er.textContent = /different|same/i.test(error.message) ? 'Valitse eri salasana kuin aiemmin' : 'Vaihto epäonnistui'; return; }
        closeSheet(); toast('Salasana vaihdettu');
      };
    });
}

/* ---------- siivoojan kuittaukset ---------- */
async function varmistaKaynti() {
  const b = S.b;
  if (b.kayntiId) return b.kayntiId;
  const r = tarkista(await sb.from('kaynnit').insert({kohde_id:b.k.id, yritys_id:b.k.yritys_id, siivooja_id:me(), siivooja_nimi:S.prof.nimi || S.user.email}).select().single());
  b.kaynnit.unshift(r); b.kayntiId = r.id; b.kuitt = {};
  return r.id;
}
async function kirjaaKuittaus(pid, tila, kommentti) {
  const b = S.b, kid = await varmistaKaynti();
  if (!tila && !kommentti) {
    tarkista(await sb.from('kuittaukset').delete().eq('kaynti_id', kid).eq('piste_id', pid));
    delete b.kuitt[pid]; return;
  }
  const rivi = {kaynti_id:kid, piste_id:pid, kohde_id:b.k.id, yritys_id:b.k.yritys_id, tila, kommentti:kommentti || '', aika:nyt()};
  b.kuitt[pid] = tarkista(await sb.from('kuittaukset').upsert(rivi, {onConflict:'kaynti_id,piste_id'}).select().single());
}

/* ---------- A4-raportti ---------- */
async function kuvaRaporttiin(t, num, vesileima) {
  const res = await fetch(url(t.kuva_polku)); if (!res.ok) throw new Error('kuva');
  const blob = await res.blob(), u = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'), w = c.width, h = c.height; g.drawImage(img, 0, 0);
    // vesileima
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.atan2(h, w) * .8);
    g.font = `bold ${Math.round(w * .034)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.30)'; g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = Math.max(1, w * .0015);
    for (let i = -4; i <= 4; i++) { g.strokeText(vesileima, 0, i * h * .2); g.fillText(vesileima, 0, i * h * .2); }
    g.restore();
    const bh = Math.round(h * .055); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, h - bh, w, bh);
    g.fillStyle = '#fff'; g.font = `${Math.round(bh * .48)}px Helvetica, Arial, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(vesileima, bh * .4, h - bh / 2);
    // pallot
    const r = Math.max(14, Math.round(w * .024));
    t.pisteet.forEach(p => {
      const x = p.x * w, y = p.y * h;
      g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = r * .5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = PIN.oletus; g.fill(); g.restore();
      g.lineWidth = r * .2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = `bold ${Math.round(r * 1.05)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(num[p.id]), x, y + r * .06);
    });
    return c.toDataURL('image/jpeg', .85);
  } finally { URL.revokeObjectURL(u); }
}
async function teeRaportti() {
  const b = S.b, k = b.k, y = S.yritys || {}, num = numerot(), s = tilasto();
  const kuvat = k.kuvakaytanto === 'sallittu';
  busy(true, 'Luodaan raporttia…');
  try {
    if (kuvat) await urlit(b.tilat.map(t => t.kuva_polku));
    const {jsPDF} = window.jspdf, doc = new jsPDF({unit:'mm', format:'a4'});
    const W = 210, H = 297, M = 16, CW = W - 2 * M, laatija = S.prof.nimi;
    const vesileima = `LUOTTAMUKSELLINEN · ${k.asiakas} · ${pvmFi(tanaan())}`;
    let yy = 0;
    const ensure = h => { if (yy + h > H - 18) { doc.addPage(); yy = M + 2; } };
    const ink = () => doc.setTextColor(28, 35, 33), mut = () => doc.setTextColor(107, 115, 112);

    doc.setFillColor(15, 118, 110); doc.rect(0, 0, W, 34, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Siivouskartoitus', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text(y.nimi || '', M, 24);
    doc.text('LUOTTAMUKSELLINEN', W - M, 16, {align:'right'}); doc.text(pvmFi(k.pvm || tanaan()), W - M, 24, {align:'right'});
    yy = 46;
    [['Asiakas', k.asiakas], ['Osoite', k.osoite], ['Yhteyshenkilö', [k.yhteyshenkilo, k.puhelin].filter(Boolean).join(', ')], ['Kartoituspäivä', pvmFi(k.pvm)],
      ['Kartoituksen tekijä', laatija], ['Yhteystiedot', [y.puhelin, y.email].filter(Boolean).join(' · ')]].filter(r => r[1]).forEach(([l, v]) => {
      doc.setFontSize(9); mut(); doc.setFont('helvetica', 'bold'); doc.text(l.toUpperCase(), M, yy);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); ink();
      const ln = doc.splitTextToSize(String(v), CW - 48); doc.text(ln, M + 48, yy); yy += Math.max(7, ln.length * 5 + 2);
    });
    if (k.lisatiedot) {
      yy += 3; doc.setFontSize(9); mut(); doc.setFont('helvetica', 'bold'); doc.text('LISÄTIEDOT', M, yy); yy += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); ink();
      doc.splitTextToSize(k.lisatiedot, CW).forEach(l => { ensure(5); doc.text(l, M, yy); yy += 5; });
    }
    yy += 4; doc.setDrawColor(228, 226, 220); doc.line(M, yy, W - M, yy); yy += 8;
    doc.setFontSize(10.5); ink();
    const intro = kuvat
      ? `Kartoituksessa merkittiin ${s.yht} siivousvastuulla olevaa kohtaa ${b.tilat.length} tilassa. Kohdat on merkitty kuviin numeroiduilla palloilla, ja numerot vastaavat kunkin kuvan alla olevaa luetteloa.`
      : `Kartoituksessa merkittiin ${s.yht} siivousvastuulla olevaa kohtaa ${b.tilat.length} tilassa. Kuvat on jätetty raportista pois asiakkaan toiveesta.`;
    doc.splitTextToSize(intro, CW).forEach(l => { doc.text(l, M, yy); yy += 5.2; });
    yy += 6;

    for (const [i, t] of b.tilat.entries()) {
      let src = null;
      if (kuvat && t.kuva_polku && url(t.kuva_polku)) { try { src = await kuvaRaporttiin(t, num, vesileima); } catch (e) { console.error(e); } }
      const ratio = (t.h || 3) / (t.w || 4); let iw = CW, ih = iw * ratio; if (ih > 118) { ih = 118; iw = ih / ratio; }
      if (src) { if (yy > 60) ensure(12 + ih + 4); } else ensure(20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); ink(); doc.text(`${i + 1}. ${t.nimi}`, M, yy); yy += src ? 5 : 8;
      if (src) { const ix = M + (CW - iw) / 2; doc.addImage(src, 'JPEG', ix, yy, iw, ih); doc.setDrawColor(228, 226, 220); doc.rect(ix, yy, iw, ih); yy += ih + 7; }
      t.pisteet.forEach(p => {
        const desc = p.teksti ? doc.splitTextToSize(p.teksti, CW - 10) : [];
        ensure(7 + Math.min(desc.length, 3) * 4.8);
        doc.setFillColor(15, 118, 110); doc.circle(M + 3.4, yy - 1.4, 3.4, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(String(num[p.id]), M + 3.4, yy - .1, {align:'center'});
        ink(); doc.setFontSize(11); doc.text(p.otsikko || 'Kohta', M + 10, yy); yy += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); mut();
        desc.forEach(l => { ensure(5); doc.text(l, M + 10, yy); yy += 4.8; });
        yy += 3;
      });
      yy += 6;
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Luottamuksellinen · ${[y.nimi, k.asiakas].filter(Boolean).join(' · ')}`, M, H - 9);
      doc.text(`Sivu ${i} / ${n}`, W - M, H - 9, {align:'right'});
    }
    const blob = doc.output('blob');
    busy(false);
    await tallennaTiedosto(`Siivouskartoitus_${tiedostoNimi(k.asiakas)}.pdf`, blob);
  } catch (e) { busy(false); virhe(e, 'Raportin luonti epäonnistui'); }
}

/* ---------- toiminnot ---------- */
const A = {
  back,
  asetukset:() => go({v:'asetukset'}),
  kayttajat:() => go({v:'kayttajat'}),
  rekisteroiNakyma:() => { S.stack = [{v:'rekisteroi'}]; render(); },
  kirjauduNakyma:() => { S.stack = [{v:'kirjaudu'}]; render(); },
  async ulos() { if (kanava) { sb.removeChannel(kanava); kanava = null; } await sb.auth.signOut(); },
  omaSalasana:salasanaLomake,
  uusiKohde:() => kohdeLomake(null),
  muokkaaKohde:() => kohdeLomake(S.b.k),
  avaa:d => go({v:'kohde', id:d.id}),
  avaaTila:d => go({v:'tila', id:S.b.k.id, tid:d.tid}),
  lisaaKayttaja:kayttajaLomake,
  async nollaa(d) {
    const u = S.kayttajat.find(x => x.id === d.id);
    if (!await vahvista(`Nollataanko käyttäjän ${u.nimi || u.email} salasana?`, 'Nollaa', false, 'Vanha salasana lakkaa toimimasta heti.')) return;
    busy(true);
    try { const r = await kutsuFunktio('kayttajat', {toiminto:'nollaa', id:d.id}); busy(false); await lataaKayttajat(); render(); naytaSalasana(u.nimi, u.email, r.salasana, 'Salasana nollattu'); }
    catch (e) { busy(false); virhe(e); }
  },
  async poistaKayttaja(d) {
    const u = S.kayttajat.find(x => x.id === d.id);
    if (!await vahvista(`Poistetaanko käyttäjä ${u.nimi || u.email}?`, 'Poista', true, 'Käyttäjä ei pääse enää sovellukseen. Hänen kuittauksensa säilyvät.')) return;
    busy(true);
    try { await kutsuFunktio('kayttajat', {toiminto:'poista', id:d.id}); await lataaKayttajat(); busy(false); render(); toast('Käyttäjä poistettu'); }
    catch (e) { busy(false); virhe(e); }
  },
  async lisaaTila() {
    const k = S.b.k, nimi = 'Tila ' + (S.b.tilat.length + 1);
    if (k.kuvakaytanto === 'ei') {
      try { const t = tarkista(await sb.from('tilat').insert({kohde_id:k.id, yritys_id:k.yritys_id, nimi, jarjestys:S.b.tilat.length, w:1200, h:900}).select().single()); t.pisteet = []; S.b.tilat.push(t); await go({v:'tila', id:k.id, tid:t.id}); valitseNimi(); }
      catch (e) { virhe(e, 'Tilan lisäys epäonnistui'); }
      return;
    }
    const f = await pickFile('image/*'); if (!f) return;
    busy(true, 'Tallennetaan kuvaa…');
    let t = null;
    try {
      const im = await lueKuva(f);
      t = tarkista(await sb.from('tilat').insert({kohde_id:k.id, yritys_id:k.yritys_id, nimi, jarjestys:S.b.tilat.length, w:im.w, h:im.h}).select().single());
      const polku = await lataaKuva(k, t.id, im.blob);
      tarkista(await sb.from('tilat').update({kuva_polku:polku}).eq('id', t.id));
      t.kuva_polku = polku; t.pisteet = []; S.b.tilat.push(t);
      busy(false); await go({v:'tila', id:k.id, tid:t.id}); valitseNimi();
    } catch (e) {
      busy(false); if (t) await sb.from('tilat').delete().eq('id', t.id);
      virhe(e, 'Kuvan tallennus epäonnistui');
    }
  },
  async vaihdaKuva() {
    const v = view(), k = S.b.k, t = S.b.tilat.find(x => x.id === v.tid), f = await pickFile('image/*'); if (!f) return;
    busy(true, 'Tallennetaan kuvaa…');
    try {
      const im = await lueKuva(f), vanha = t.kuva_polku, polku = await lataaKuva(k, t.id, im.blob);
      tarkista(await sb.from('tilat').update({kuva_polku:polku, w:im.w, h:im.h}).eq('id', t.id));
      Object.assign(t, {kuva_polku:polku, w:im.w, h:im.h}); await poistaKuvat([vanha]); await urlit([polku]);
      busy(false); render(); toast('Kuva tallennettu. Tarkista pallojen paikat.');
    } catch (e) { busy(false); virhe(e, 'Kuvan tallennus epäonnistui'); }
  },
  async poistaTila() {
    const v = view(), t = S.b.tilat.find(x => x.id === v.tid);
    if (!await vahvista('Poistetaanko tila, sen kuva ja merkinnät?', 'Poista', true)) return;
    try { await poistaKuvat([t.kuva_polku]); tarkista(await sb.from('tilat').delete().eq('id', t.id)); S.b.tilat = S.b.tilat.filter(x => x !== t); await back(); }
    catch (e) { virhe(e, 'Poisto epäonnistui'); }
  },
  async poistaKohde() {
    const k = S.b.k;
    if (!await vahvista(`Poistetaanko kohde ${k.asiakas}?`, 'Poista', true, 'Kohde, sen kuvat, merkinnät ja kuittaukset poistetaan pysyvästi.')) return;
    busy(true, 'Poistetaan…');
    try { await poistaKuvat(S.b.tilat.map(t => t.kuva_polku)); tarkista(await sb.from('kohteet').delete().eq('id', k.id)); S.b = null; busy(false); await home(); toast('Kohde poistettu'); }
    catch (e) { busy(false); virhe(e, 'Poisto epäonnistui'); }
  },
  muokkaaPiste(d) { const t = S.b.tilat.find(x => x.id === view().tid); pisteLomake(t, t.pisteet.find(p => p.id === d.pid)); },
  raportti:teeRaportti,
  async kuittaa(d, el) {
    const q = kuittaus(d.pid), uusi = q && q.tila === d.t ? null : d.t;
    el.disabled = true;
    try { await kirjaaKuittaus(d.pid, uusi, q ? q.kommentti : ''); const y = scrollY; render(); scrollTo(0, y); if (uusi === 'ei') kommenttiLomake(d.pid); }
    catch (e) { el.disabled = false; virhe(e, 'Kuittaus epäonnistui'); }
  },
  kommentoi:d => kommenttiLomake(d.pid),
  async kaikkiOk() {
    const t = S.b.tilat.find(x => x.id === view().tid);
    try {
      const kid = await varmistaKaynti();
      const rivit = t.pisteet.filter(p => !(kuittaus(p.id) || {}).tila).map(p => ({kaynti_id:kid, piste_id:p.id, kohde_id:S.b.k.id, yritys_id:S.b.k.yritys_id, tila:'ok', kommentti:(kuittaus(p.id) || {}).kommentti || '', aika:nyt()}));
      if (rivit.length) tarkista(await sb.from('kuittaukset').upsert(rivit, {onConflict:'kaynti_id,piste_id'}).select()).forEach(r => { S.b.kuitt[r.piste_id] = r; });
      render(); toast('Merkitty siivotuiksi');
    } catch (e) { virhe(e, 'Kuittaus epäonnistui'); }
  },
  async kayntiValmis() {
    if (!await vahvista('Merkitäänkö käynti valmiiksi?', 'Valmis', false, 'Esimies näkee käynnin valmiina. Seuraava kuittaus aloittaa uuden käynnin.')) return;
    try { tarkista(await sb.from('kaynnit').update({valmis:true}).eq('id', S.b.kayntiId)); S.b.kayntiId = null; S.b.kuitt = {}; await nayta(); toast('Käynti valmis'); }
    catch (e) { virhe(e); }
  }
};
function valitseNimi() { setTimeout(() => { const i = $('#tilaNimi'); if (i) { i.focus(); i.select(); } }, 100); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || !$('#app').contains(b)) return;
  const f = A[b.dataset.act]; if (f) f(b.dataset, b);
});
const tallennaTilanNimi = debounce(async (t, nimi) => { try { tarkista(await sb.from('tilat').update({nimi}).eq('id', t.id)); } catch (e) { virhe(e, 'Nimen tallennus epäonnistui'); } }, 600);
document.addEventListener('input', e => {
  if (e.target.id === 'tilaNimi') {
    const t = S.b.tilat.find(x => x.id === view().tid); t.nimi = e.target.value;
    const h = $('.top h1'); if (h) h.textContent = t.nimi || 'Tila';
    tallennaTilanNimi(t, t.nimi.trim() || 'Tila');
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.id === 'kTila') {
      tarkista(await sb.from('kohteet').update({tila:el.value}).eq('id', S.b.k.id));
      S.b.k.tila = el.value; S.b.k.tila_muutettu = nyt(); render();
    } else if (el.id === 'kKuvat') {
      const k = S.b.k, uusi = el.value, kuvia = S.b.tilat.filter(t => t.kuva_polku);
      if (uusi === 'ei' && kuvia.length) {
        if (!await vahvista('Poistetaanko kohteen kuvat?', 'Poista kuvat', true, `Kohteessa on ${kuvia.length} kuvaa. Ne poistetaan pysyvästi, ja merkinnät jäävät tyhjälle pohjalle.`)) { el.value = k.kuvakaytanto; return; }
        busy(true, 'Poistetaan kuvia…');
        await poistaKuvat(kuvia.map(t => t.kuva_polku));
        tarkista(await sb.from('tilat').update({kuva_polku:null}).eq('kohde_id', k.id));
        kuvia.forEach(t => { t.kuva_polku = null; }); busy(false);
      }
      tarkista(await sb.from('kohteet').update({kuvakaytanto:uusi}).eq('id', k.id));
      k.kuvakaytanto = uusi; render(); toast('Tallennettu');
    } else if (el.id === 'kKaynti') {
      S.b.kayntiId = el.value; S.b.valittuKasin = el.value !== (S.b.kaynnit[0] || {}).id;
      await lataaKuittaukset(S.b); render();
    } else if (el.dataset.siivooja) {
      const uid = el.dataset.siivooja;
      if (el.checked) tarkista(await sb.from('kohde_siivoojat').insert({kohde_id:S.b.k.id, kayttaja_id:uid, yritys_id:S.b.k.yritys_id}));
      else tarkista(await sb.from('kohde_siivoojat').delete().eq('kohde_id', S.b.k.id).eq('kayttaja_id', uid));
      S.b.siivoojat = el.checked ? [...S.b.siivoojat, uid] : S.b.siivoojat.filter(x => x !== uid);
      toast(el.checked ? 'Siivooja lisätty kohteeseen' : 'Siivooja poistettu kohteesta');
    }
  } catch (er) { busy(false); virhe(er, 'Tallennus epäonnistui'); render(); }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button[type=submit]');
  const g = id => f.querySelector(id).value.trim();
  if (f.id === 'fLogin') {
    const err = $('#lErr'); err.textContent = ''; btn.disabled = true;
    const {data, error} = await sb.auth.signInWithPassword({email:g('#lEmail'), password:f.querySelector('#lPw').value});
    btn.disabled = false;
    if (error) { err.textContent = /invalid/i.test(error.message) ? 'Väärä sähköposti tai salasana' : /fetch/i.test(error.message) ? 'Ei yhteyttä palvelimeen' : error.message; return; }
    await kirjautunut(data.user);
  } else if (f.id === 'fReg') {
    const err = $('#rErr'); err.textContent = ''; btn.disabled = true;
    try {
      await kutsuFunktio('rekisteroi', {yritys:g('#rY'), nimi:g('#rN'), email:g('#rE'), salasana:f.querySelector('#rP').value});
      const {data, error} = await sb.auth.signInWithPassword({email:g('#rE'), password:f.querySelector('#rP').value});
      if (error) throw error;
      await kirjautunut(data.user); toast('Tervetuloa Rikkaan!');
    } catch (er) { btn.disabled = false; err.textContent = er.message; }
  } else if (f.id === 'fPw') {
    const a = f.querySelector('#p1').value, b = f.querySelector('#p2').value, err = $('#pErr');
    if (a.length < 8) { err.textContent = 'Vähintään 8 merkkiä'; return; }
    if (a !== b) { err.textContent = 'Salasanat eivät täsmää'; return; }
    btn.disabled = true;
    const {error} = await sb.auth.updateUser({password:a});
    if (error) { btn.disabled = false; err.textContent = /different|same/i.test(error.message) ? 'Valitse eri salasana kuin tilapäinen' : 'Vaihto epäonnistui'; return; }
    await sb.from('profiilit').update({vaihda_salasana:false}).eq('id', me());
    S.prof.vaihda_salasana = false; toast('Salasana vaihdettu'); await home();
  } else if (f.id === 'fYritys') {
    btn.disabled = true;
    try {
      const d = {nimi:g('#yN'), puhelin:g('#yP'), email:g('#yE'), kuvien_sailytys_pv:Math.min(3650, Math.max(7, parseInt(g('#yS'), 10) || 60))};
      tarkista(await sb.from('yritykset').update(d).eq('id', S.yritys.id)); Object.assign(S.yritys, d); toast('Tallennettu');
    } catch (er) { virhe(er, 'Tallennus epäonnistui'); }
    btn.disabled = false;
  } else if (f.id === 'fOma') {
    btn.disabled = true;
    try { const nimi = g('#oN'); tarkista(await sb.from('profiilit').update({nimi}).eq('id', me())); S.prof.nimi = nimi; toast('Tallennettu'); }
    catch (er) { virhe(er, 'Tallennus epäonnistui'); }
    btn.disabled = false;
  }
});

/* ---------- kirjautuminen ja käynnistys ---------- */
async function kirjautunut(user) {
  S.user = user;
  try {
    const prof = tarkista(await sb.from('profiilit').select('*').eq('id', user.id).maybeSingle());
    if (!prof) { toast('Tunnustasi ei löydy. Se on ehkä poistettu.'); await sb.auth.signOut(); return; }
    S.prof = prof; await lataaYritys();
  } catch (e) { virhe(e, 'Kirjautuminen epäonnistui'); S.stack = [{v:'kirjaudu'}]; render(); return; }
  S.stack = [{v:S.prof.vaihda_salasana ? 'vaihdaSalasana' : 'koti'}];
  await nayta();
}
sb.auth.onAuthStateChange(ev => {
  if (ev === 'SIGNED_OUT') { Object.assign(S, {user:null, prof:null, yritys:null, kohteet:[], b:null, kayttajat:[], urls:{}, stack:[{v:'kirjaudu'}]}); render(); }
});
(async () => {
  const {data:{session}} = await sb.auth.getSession();
  if (session) await kirjautunut(session.user); else { S.stack = [{v:'kirjaudu'}]; render(); }
})();
