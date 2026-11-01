/* Youth Madeline – Suivi
   App de suivi des jeunes · Youth Ministry TG Madeline (Cap-Haïtien)
   Front statique + Supabase (auth, base de données, règles d'accès RLS). */
'use strict';

const SB_URL = 'https://sjwjhglremounuuwrreq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqd2poZ2xyZW1vdW51dXdycmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NDM2NzIsImV4cCI6MjEwOTExOTY3Mn0.72E5OuJlSrBWWf_OYlLdLiG6JLHRdd3N8_4fl8OfA78';
const sb = window.__MOCK_SB__ || window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- constantes ---------- */
const KINDS = { culte: 'Culte du dimanche', youth_service: 'Youth Service', youth_meeting: 'Youth Meeting' };
const KIND_SHORT = { culte: 'Culte', youth_service: 'Y. Service', youth_meeting: 'Y. Meeting' };
const ROLES = { superadmin: 'Super Admin', pasteur: 'Pasteur', assistant: 'Assistant', care: 'Volunteer Care', coreteam: 'Core Team', inactif: 'Inactif (aucun accès)' };
const STATUS = { actif: 'Actif', nouveau: 'Nouveau', inactif: 'Inactif' };

/* ---------- état ---------- */
const S = { user: null, me: null, youth: [], profiles: [], sessions: [], attendance: [], followups: [], reports: [], loaded: false };
const app = () => document.getElementById('app');

/* ---------- utilitaires ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return iso(x); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtD = (s, opt = { weekday: 'short', day: 'numeric', month: 'short' }) => s ? parseD(s).toLocaleDateString('fr-FR', opt) : '';
const fmtLong = (s) => fmtD(s, { day: 'numeric', month: 'long', year: 'numeric' });
const weekLabel = (ws) => `du ${fmtD(ws, { day: 'numeric', month: 'short' })} au ${fmtD(addDays(ws, 6), { day: 'numeric', month: 'short' })}`;
const fullName = (y) => y ? [y.first_name, y.last_name].filter(Boolean).join(' ') : '—';
const initials = (y) => (fullName(y).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
const digits = (p) => String(p || '').replace(/\D/g, '');
const intlPhone = (p) => { const d = digits(p); if (!d) return ''; return d.length === 8 ? '509' + d : d; };
const fmtPhone = (p) => { const d = digits(p); if (d.length === 8) return `+509 ${d.slice(0, 4)}-${d.slice(4)}`; return p || ''; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const age = (bd) => { if (!bd) return null; const b = parseD(bd), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; };
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
function genPassword() { const c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const arr = new Uint32Array(6); crypto.getRandomValues(arr); arr.forEach((v) => (s += c[v % c.length])); return 'Youth-' + s; }
function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erreur');
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet. Réessaie.';
  if (/row-level security|permission denied/i.test(m)) return "Tu n'as pas l'autorisation de faire ça.";
  if (/duplicate key/i.test(m)) return 'Cet élément existe déjà.';
  if (/should be different/i.test(m)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  return m;
}
let toastT;
function toast(msg, err = false) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), err ? 4200 : 2200); }
function q(sel, root = document) { return root.querySelector(sel); }
function qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function on(root, sel, ev, fn) { qa(sel, root).forEach((el) => el.addEventListener(ev, (e) => fn(e, el))); }
async function must(p) { const r = await p; if (r.error) throw r.error; return r.data; }

/* ---------- rôles ---------- */
const role = () => S.me?.role || 'inactif';
const canReadAll = () => ['superadmin', 'pasteur', 'assistant', 'care'].includes(role());
const canEditAll = () => ['superadmin', 'assistant', 'care'].includes(role());
const isAdmin = () => ['superadmin', 'assistant'].includes(role());
const isSuper = () => role() === 'superadmin';
const readOnly = () => role() === 'pasteur';
const myYouthId = () => S.me?.youth_id || null;
const myTeam = () => (myYouthId() ? S.youth.filter((y) => y.leader_youth_id === myYouthId()) : []);
const hasTeam = () => myTeam().length > 0;
const canReport = () => ['superadmin', 'assistant', 'care', 'coreteam'].includes(role()) && hasTeam();
const youthById = (id) => S.youth.find((y) => y.id === id);
const profileById = (id) => S.profiles.find((p) => p.id === id);
const leaders = () => S.youth.filter((y) => y.is_core_team).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));
const teamOf = (leaderYid) => S.youth.filter((y) => y.leader_youth_id === leaderYid && y.status !== 'inactif');
const accountOfYouth = (yid) => S.profiles.find((p) => p.youth_id === yid && p.role !== 'inactif');
const visibleProfiles = () => S.profiles.filter((p) => !/@example\.test$/i.test(p.email || ''));
const activeYouth = () => S.youth.filter((y) => y.status !== 'inactif');

/* ---------- chargement ---------- */
async function fetchAll(table, order) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    let qb = sb.from(table).select('*');
    if (order) qb = qb.order(order[0], { ascending: order[1] !== false });
    const data = await must(qb.range(from, from + size - 1));
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
async function loadAll() {
  const [me] = await must(sb.from('profiles').select('*').eq('id', S.user.id));
  S.me = me || { id: S.user.id, role: 'inactif', email: S.user.email };
  if (role() === 'inactif') { S.loaded = true; return; }
  const [youth, profiles, sessions, attendance, followups, reports] = await Promise.all([
    fetchAll('youth', ['first_name']), fetchAll('profiles', ['full_name']), fetchAll('sessions', ['date', false]),
    fetchAll('attendance'), fetchAll('followups'), fetchAll('reports', ['week_start', false]),
  ]);
  Object.assign(S, { youth: youth.sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr')), profiles, sessions, attendance, followups, reports, loaded: true });
}

/* ---------- calculs ---------- */
const attOf = (sid, yid) => S.attendance.find((a) => a.session_id === sid && a.youth_id === yid);
const sessionsSorted = () => [...S.sessions].sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)));
function eligibleSessions(y) { const c = (y.created_at || '').slice(0, 10); return sessionsSorted().filter((s) => !c || s.date >= c || attOf(s.id, y.id)); }
function presenceStats(y) {
  const ss = eligibleSessions(y); let p = 0, n = 0;
  ss.forEach((s) => { const a = attOf(s.id, y.id); if (a) { n++; if (a.present) p++; } });
  return { present: p, marked: n, rate: n ? pct(p, n) : null, total: ss.length };
}
function atRisk(y) {
  if (y.status === 'inactif') return false;
  const ss = eligibleSessions(y).slice(0, 3);
  if (ss.length < 3) return false;
  return ss.every((s) => !attOf(s.id, y.id)?.present);
}
const neverPresent = (y) => y.status !== 'inactif' && eligibleSessions(y).length > 0 && !S.attendance.some((a) => a.youth_id === y.id && a.present);
function missingFields(y) { const m = []; if (!y.last_name) m.push('nom'); if (!digits(y.phone)) m.push('téléphone'); if (!y.birth_date) m.push('date de naissance'); return m; }
function duplicatePairs() {
  const ys = S.youth, pairs = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) {
    const a = ys[i], b = ys[j];
    const pa = digits(a.phone), pb = digits(b.phone);
    const na = norm(fullName(a)), nb = norm(fullName(b));
    let why = null;
    if (pa && pa === pb) why = 'même téléphone';
    else if (na.length > 6 && nb.length > 6 && lev(na, nb) <= 2) why = 'noms très proches';
    if (why) pairs.push({ a, b, why });
  }
  return pairs;
}
const dupIds = () => new Set(duplicatePairs().flatMap((p) => [p.a.id, p.b.id]));
function upcomingBirthdays(list, days = 30) {
  const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return list.filter((y) => y.birth_date).map((y) => {
    const b = parseD(y.birth_date); let nx = new Date(t0.getFullYear(), b.getMonth(), b.getDate());
    if (nx < t0) nx = new Date(t0.getFullYear() + 1, b.getMonth(), b.getDate());
    return { y, nx, d: Math.round((nx - t0) / 864e5) };
  }).filter((x) => x.d <= days).sort((a, b) => a.d - b.d);
}
const fuOf = (yid, ws) => S.followups.find((f) => f.youth_id === yid && f.week_start === ws);
function teamFollowStats(team, ws) { const sent = team.filter((y) => fuOf(y.id, ws)?.sent).length; return { sent, n: team.length, p: pct(sent, team.length) }; }
const reportOf = (pid, ws) => S.reports.find((r) => r.author_id === pid && r.week_start === ws);
function expectedLeaders() {
  // leaders = fiches Core Team qui ont au moins un jeune assigné
  return leaders().map((l) => ({ l, team: teamOf(l.id), acc: accountOfYouth(l.id) })).filter((x) => x.team.length > 0);
}
function teamPresenceRate(team, nSessions = 4) {
  const ss = sessionsSorted().slice(0, nSessions); let p = 0, n = 0;
  ss.forEach((s) => team.forEach((y) => { const a = attOf(s.id, y.id); if (a) { n++; if (a.present) p++; } }));
  return n ? pct(p, n) : null;
}

/* ---------- icônes ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.4 3.4-5.5 6.5-5.5s5.8 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 13.5l2.5 2.5L16 11"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.8A8 8 0 1 1 21 12z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></svg>',
};

/* ---------- routeur ---------- */
let menuOpen = false;
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { parts, params, name: parts[0] || '' };
}
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { menuOpen = false; render(); window.scrollTo(0, 0); });

function shell(title, body, opts = {}) {
  const r = route().name;
  const tab = (href, key, icon, label) => `<a href="${href}" class="${key.includes(r) ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return `
  <header class="top">
    ${opts.back ? `<button data-back aria-label="Retour">${I.back}</button>` : ''}
    <div class="ttl"><small>Youth Madeline</small><b>${esc(title)}</b></div>
    <button data-refresh aria-label="Actualiser">${I.refresh}</button>
    <button data-menu aria-label="Menu">${I.menu}</button>
  </header>
  <main class="main">${body}</main>
  <nav class="nav">
    ${tab('#/', ['', 'accueil'], I.home, 'Accueil')}
    ${tab('#/jeunes', ['jeunes', 'jeune'], I.users, 'Jeunes')}
    ${tab('#/presences', ['presences', 'presence'], I.check, 'Présences')}
    ${tab('#/suivi', ['suivi'], I.msg, 'Suivi')}
    ${tab('#/rapports', ['rapports', 'rapport'], I.doc, 'Rapports')}
  </nav>
  ${menuOpen ? menuHtml() : ''}`;
}
function menuHtml() {
  const y = youthById(myYouthId());
  return `<div class="menu" data-close-menu><div class="sheet" onclick="event.stopPropagation()">
    <div class="who"><b>${esc(S.me.full_name || S.me.email)}</b><div class="small muted">${esc(ROLES[role()])}${y ? ' · fiche : ' + esc(fullName(y)) : ''}</div></div>
    <a href="#/compte">Mon compte</a>
    ${canEditAll() || isAdmin() ? '<a href="#/equipes">Équipes Core Team</a>' : ''}
    ${isAdmin() ? '<a href="#/comptes">Comptes et rôles</a>' : ''}
    ${canReadAll() ? '<a href="#/export">Exporter (CSV)</a>' : ''}
    <a href="#/aide">Aide</a>
    <div class="grow"></div>
    <button class="item" data-logout style="color:var(--bad)">Se déconnecter</button>
  </div></div>`;
}
function bindShell(root) {
  on(root, '[data-menu]', 'click', () => { menuOpen = true; render(); });
  on(root, '[data-close-menu]', 'click', () => { menuOpen = false; render(); });
  on(root, '[data-back]', 'click', () => history.length > 1 ? history.back() : go('#/'));
  on(root, '[data-refresh]', 'click', async () => { try { await loadAll(); render(); toast('Données à jour'); } catch (e) { toast(errMsg(e), true); } });
  on(root, '[data-logout]', 'click', async () => { await sb.auth.signOut(); S.user = null; S.me = null; location.hash = '#/'; render(); });
}

/* ---------- rendu principal ---------- */
async function render() {
  const root = app();
  if (!S.user) return renderLogin(root);
  if (!S.loaded) { root.innerHTML = '<div class="splash"><div class="logo">YM</div><p>Chargement des données…</p></div>'; return; }
  if (role() === 'inactif') return renderInactive(root);
  if (S.me.must_change_password) return renderForcePassword(root);
  const r = route(); const p = r.parts;
  let v;
  try {
    switch (r.name) {
      case '': case 'accueil': v = viewHome(); break;
      case 'jeunes': v = viewYouthList(r.params); break;
      case 'jeune': v = p[1] === 'nouveau' ? viewYouthForm(null) : p[2] === 'modifier' ? viewYouthForm(p[1]) : viewYouthDetail(p[1]); break;
      case 'presences': v = viewSessions(); break;
      case 'presence': v = viewSession(p[1], r.params); break;
      case 'suivi': v = viewFollow(r.params); break;
      case 'rapports': v = viewReports(r.params); break;
      case 'rapport': v = p[1] === 'nouveau' ? viewReportForm(r.params) : viewReportDetail(p[1]); break;
      case 'equipes': v = viewTeams(r.params); break;
      case 'comptes': v = viewAccounts(r.params); break;
      case 'compte': v = viewMyAccount(); break;
      case 'export': v = viewExport(); break;
      case 'aide': v = viewHelp(); break;
      default: v = { title: 'Introuvable', html: '<div class="empty">Page introuvable.</div>' };
    }
  } catch (e) { console.error(e); v = { title: 'Erreur', html: `<div class="alert bad">${esc(errMsg(e))}</div>` }; }
  root.innerHTML = shell(v.title, v.html, { back: v.back });
  bindShell(root);
  if (v.bind) v.bind(root);
}

/* ---------- connexion ---------- */
function renderLogin(root) {
  root.innerHTML = `<div class="login"><form class="box" id="lf">
    <div class="logo">YM</div><h1>Youth Madeline</h1><p class="c">Suivi des jeunes · TG Madeline</p>
    <label class="f"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
    <label class="f"><span>Mot de passe</span><input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn full" type="submit">Se connecter</button>
    <p class="small muted" style="text-align:center;margin:14px 0 0">Pas de compte ou mot de passe oublié ?<br>Demande à l'admin du Youth Ministry.</p>
  </form></div>`;
  q('#lf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const b = q('button', f); b.disabled = true; b.textContent = 'Connexion…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.password.value });
      if (error) throw error;
      await startSession(data.user);
    } catch (err) { toast(errMsg(err), true); b.disabled = false; b.textContent = 'Se connecter'; }
  });
}
function renderInactive(root) {
  root.innerHTML = `<div class="login"><div class="box"><div class="logo">YM</div><h1>Accès en attente</h1>
  <p class="c">Ton compte (${esc(S.user.email)}) n'a pas encore de rôle. Demande à l'admin du Youth Ministry de l'activer.</p>
  <button class="btn full light" data-logout>Se déconnecter</button></div></div>`;
  on(root, '[data-logout]', 'click', async () => { await sb.auth.signOut(); S.user = null; render(); });
}
function passwordForm(id) {
  return `<form id="${id}">
    <label class="f"><span>Nouveau mot de passe (8 caractères minimum)</span><input type="password" name="p1" minlength="8" autocomplete="new-password" required></label>
    <label class="f"><span>Confirme le mot de passe</span><input type="password" name="p2" minlength="8" autocomplete="new-password" required></label>
    <button class="btn full" type="submit">Enregistrer le mot de passe</button></form>`;
}
async function submitPassword(f) {
  if (f.p1.value.length < 8) throw new Error('8 caractères minimum.');
  if (f.p1.value !== f.p2.value) throw new Error('Les deux mots de passe ne sont pas identiques.');
  await must(sb.auth.updateUser({ password: f.p1.value }));
  await must(sb.rpc('password_changed'));
  S.me.must_change_password = false;
}
function renderForcePassword(root) {
  root.innerHTML = `<div class="login"><div class="box"><div class="logo">YM</div><h1>Bienvenue ${esc((S.me.full_name || '').split(' ')[0])}</h1>
  <p class="c">Choisis ton propre mot de passe avant de continuer.</p>${passwordForm('pf')}</div></div>`;
  q('#pf').addEventListener('submit', async (e) => { e.preventDefault(); try { await submitPassword(e.target); toast('Mot de passe enregistré'); render(); } catch (err) { toast(errMsg(err), true); } });
}

/* ---------- ACCUEIL ---------- */
function viewHome() {
  const ws = weekStart();
  const first = (S.me.full_name || '').split(' ')[0];
  let html = `<div class="row" style="margin:2px 4px 12px"><div class="grow"><h1>Bonjour ${esc(first)} 👋</h1><div class="small muted">${esc(ROLES[role()])} · semaine ${esc(weekLabel(ws))}</div></div></div>`;

  if (hasTeam()) html += homeTeamBlock(ws);
  else if (role() === 'coreteam') html += `<div class="alert warn">Ton compte n'est pas encore lié à une équipe. Demande à l'admin de lier ton compte à ta fiche et de t'assigner des jeunes.</div>`;

  if (canReadAll()) html += homeGlobal(ws);
  return { title: 'Accueil', html };
}
function homeTeamBlock(ws) {
  const team = myTeam().filter((y) => y.status !== 'inactif');
  const fs = teamFollowStats(team, ws);
  const rep = reportOf(S.me.id, ws);
  const risk = team.filter(atRisk);
  const bd = upcomingBirthdays(team, 30);
  return `<div class="sec">Mon équipe</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${team.length}</div><div class="l">jeunes dans mon équipe</div></div>
    <div class="kpi"><div class="v">${fs.sent}/${fs.n}</div><div class="l">contactés cette semaine</div><div class="prog" style="margin-top:6px"><i style="width:${fs.p}%"></i></div></div>
    <div class="kpi"><div class="v">${teamPresenceRate(team) ?? '—'}${teamPresenceRate(team) != null ? '%' : ''}</div><div class="l">présence (4 dernières séances)</div></div>
    <div class="kpi"><div class="v">${rep ? '✅' : '⏳'}</div><div class="l">${rep ? 'rapport soumis' : 'rapport à faire'}</div></div>
  </div>
  <div class="btns" style="margin-bottom:12px"><a class="btn" href="#/suivi">Faire le suivi</a>${rep ? '' : '<a class="btn ghost" href="#/rapport/nouveau">Écrire mon rapport</a>'}</div>
  ${risk.length ? `<div class="card"><h2>À relancer <span class="b bad">${risk.length}</span></h2><div class="small muted" style="margin:-4px 0 8px">Absents aux 3 dernières séances</div>${risk.map(yLine).join('')}</div>` : ''}
  ${bd.length ? `<div class="card"><h2>Anniversaires à venir</h2>${bd.map((x) => `<div class="row small" style="margin:6px 0"><span class="grow">🎂 ${esc(fullName(x.y))}</span><span class="muted">${x.d === 0 ? "aujourd'hui" : fmtD(iso(x.nx), { day: 'numeric', month: 'short' })}</span></div>`).join('')}</div>` : ''}`;
}
const yLine = (y) => `<a class="row small" style="margin:7px 0;color:inherit" href="#/jeune/${y.id}"><span class="av" style="width:30px;height:30px;font-size:.72rem">${esc(initials(y))}</span><span class="grow">${esc(fullName(y))}</span><span class="muted">${esc(fmtPhone(y.phone))}</span></a>`;
function homeGlobal(ws) {
  const act = activeYouth();
  const ss = sessionsSorted();
  const last = ss[0];
  const lastP = last ? S.attendance.filter((a) => a.session_id === last.id && a.present).length : 0;
  const exp = expectedLeaders();
  const allTeam = exp.flatMap((x) => x.team);
  const fsAll = teamFollowStats(allTeam, ws);
  const repDone = exp.filter((x) => x.acc && reportOf(x.acc.id, ws)).length;
  const risk = act.filter(atRisk);
  const never = act.filter(neverPresent);
  const noLeader = act.filter((y) => !y.leader_youth_id && !y.is_core_team);
  const bd = upcomingBirthdays(act, 30);
  const dups = isAdmin() || canEditAll() ? duplicatePairs() : [];
  const incomplete = act.filter((y) => missingFields(y).length).length;

  // évolution par type
  const byKind = Object.keys(KINDS).map((k) => ({ k, list: ss.filter((s) => s.kind === k).slice(0, 6).reverse() })).filter((x) => x.list.length);
  const maxP = Math.max(1, ...S.sessions.map((s) => S.attendance.filter((a) => a.session_id === s.id && a.present).length));

  return `<div class="sec">Vue d'ensemble</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${act.length}</div><div class="l">jeunes actifs</div><div class="s">${S.youth.filter((y) => y.status === 'nouveau').length} nouveaux</div></div>
    <div class="kpi"><div class="v">${last ? lastP : '—'}</div><div class="l">${last ? esc(KIND_SHORT[last.kind]) + ' du ' + esc(fmtD(last.date, { day: 'numeric', month: 'short' })) : 'aucune séance'}</div></div>
    <div class="kpi"><div class="v">${fsAll.p}%</div><div class="l">jeunes suivis cette semaine</div><div class="s">${fsAll.sent}/${fsAll.n} dans les équipes</div></div>
    <div class="kpi"><div class="v">${repDone}/${exp.length}</div><div class="l">rapports de la semaine</div></div>
  </div>

  <div class="card"><h2>Présences par séance</h2>
    ${byKind.length ? byKind.map((x) => `<div class="small" style="font-weight:700;margin-top:8px">${esc(KINDS[x.k])}</div><div class="bars">${x.list.map((s) => { const n = S.attendance.filter((a) => a.session_id === s.id && a.present).length; return `<a class="bar" href="#/presence/${s.id}" style="color:inherit"><span class="lb">${esc(fmtD(s.date))}</span><span class="tr"><i style="width:${pct(n, maxP)}%"></i></span><span class="n">${n}</span></a>`; }).join('')}</div>`).join('') : '<div class="empty">Aucune séance.</div>'}
  </div>

  <div class="card"><h2>Leaders Core Team</h2>
    ${exp.length ? `<table class="t"><tr><th>Leader</th><th>Équipe</th><th>Suivi</th><th>Prés.</th><th>Rapport</th></tr>
    ${exp.map((x) => { const f = teamFollowStats(x.team, ws); const tp = teamPresenceRate(x.team); const r = x.acc && reportOf(x.acc.id, ws);
      return `<tr><td><a href="#/jeunes?leader=${x.l.id}">${esc(x.l.first_name)}</a>${x.acc ? '' : ' <span class="b warn" title="Pas de compte">sans compte</span>'}</td><td>${x.team.length}</td><td><span class="b ${f.p >= 80 ? 'ok' : f.p >= 40 ? 'warn' : 'bad'}">${f.sent}/${f.n}</span></td><td>${tp ?? '—'}${tp != null ? '%' : ''}</td><td>${r ? '<span class="b ok">✓</span>' : '<span class="b bad">✗</span>'}</td></tr>`; }).join('')}</table>`
    : '<div class="empty">Aucun leader avec une équipe. Assigne des jeunes dans « Équipes ».</div>'}
    ${noLeader.length ? `<div class="alert warn" style="margin:10px 0 0"><a href="#/jeunes?f=sansleader" style="color:inherit"><b>${noLeader.length} jeunes sans leader</b> → les répartir</a></div>` : ''}
  </div>

  ${risk.length ? `<div class="card"><h2>À risque <span class="b bad">${risk.length}</span></h2><div class="small muted" style="margin:-4px 0 6px">Absents aux 3 dernières séances</div>${risk.map(yLine).join('')}</div>` : ''}
  ${never.length ? `<div class="card"><h2>Jamais présents <span class="b warn">${never.length}</span></h2>${never.map(yLine).join('')}</div>` : ''}
  ${bd.length ? `<div class="card"><h2>Anniversaires (30 jours)</h2>${bd.map((x) => `<div class="row small" style="margin:6px 0"><span class="grow">🎂 ${esc(fullName(x.y))}</span><span class="muted">${x.d === 0 ? "aujourd'hui" : fmtD(iso(x.nx), { day: 'numeric', month: 'short' })}</span></div>`).join('')}</div>`
    : `<div class="card small muted">🎂 Aucun anniversaire connu : ${S.youth.filter((y) => !y.birth_date).length} fiches sans date de naissance.</div>`}
  ${dups.length ? `<div class="card"><h2>Doublons possibles <span class="b warn">${dups.length}</span></h2>${dups.map((d) => `<div class="small" style="margin:7px 0"><a href="#/jeune/${d.a.id}">${esc(fullName(d.a))}</a> ↔ <a href="#/jeune/${d.b.id}">${esc(fullName(d.b))}</a> <span class="muted">(${esc(d.why)})</span></div>`).join('')}</div>` : ''}
  ${incomplete ? `<div class="alert info"><a href="#/jeunes?f=incomplet" style="color:inherit"><b>${incomplete} fiches incomplètes</b> (nom, téléphone ou date de naissance manquant) → compléter</a></div>` : ''}`;
}

/* ---------- JEUNES : liste ---------- */
function viewYouthList(params) {
  const f = params.f || (canReadAll() ? 'tous' : 'equipe');
  const leader = params.leader || '';
  const qv = params.q || '';
  const dups = canEditAll() ? dupIds() : new Set();
  let list = [...S.youth];
  if (f === 'equipe') list = myTeam();
  if (f === 'sansleader') list = list.filter((y) => !y.leader_youth_id && !y.is_core_team && y.status !== 'inactif');
  if (f === 'incomplet') list = list.filter((y) => missingFields(y).length);
  if (f === 'risque') list = list.filter(atRisk);
  if (f === 'core') list = list.filter((y) => y.is_core_team);
  if (f === 'inactifs') list = list.filter((y) => y.status === 'inactif');
  else if (f !== 'inactifs') list = list.filter((y) => y.status !== 'inactif');
  if (leader) list = list.filter((y) => y.leader_youth_id === leader);
  if (qv) { const n = norm(qv), d = digits(qv); list = list.filter((y) => norm(fullName(y)).includes(n) || (d && digits(y.phone).includes(d))); }

  const chip = (k, l) => `<button class="chip ${f === k ? 'on' : ''}" data-f="${k}">${l}</button>`;
  const html = `
  <input type="search" class="search" id="qs" placeholder="Rechercher un nom ou un numéro…" value="${esc(qv)}">
  <div class="chips">
    ${canReadAll() ? chip('tous', 'Tous') : ''}${hasTeam() ? chip('equipe', 'Mon équipe') : ''}
    ${canReadAll() ? chip('risque', 'À risque') + chip('sansleader', 'Sans leader') + chip('incomplet', 'Incomplètes') + chip('core', 'Core Team') + chip('inactifs', 'Inactifs') : ''}
  </div>
  ${canReadAll() ? `<select id="ldr" style="margin-bottom:10px"><option value="">Tous les leaders</option>${leaders().map((l) => `<option value="${l.id}" ${leader === l.id ? 'selected' : ''}>Équipe de ${esc(fullName(l))} (${teamOf(l.id).length})</option>`).join('')}</select>` : ''}
  <div class="row" style="margin:0 4px 8px"><span class="small muted grow">${list.length} jeune${list.length > 1 ? 's' : ''}</span>${canEditAll() ? '<a class="btn sm" href="#/jeune/nouveau">+ Ajouter</a>' : ''}</div>
  <div class="list">${list.length ? list.map((y) => {
    const st = presenceStats(y); const ld = youthById(y.leader_youth_id); const miss = missingFields(y);
    return `<a class="li" href="#/jeune/${y.id}"><span class="av ${y.is_core_team ? 'core' : ''}">${esc(initials(y))}</span>
      <span class="grow"><div class="nm">${esc(fullName(y))} ${y.status === 'nouveau' ? '<span class="b pri">nouveau</span>' : ''}${y.is_core_team ? ' <span class="b acc">Core</span>' : ''}</div>
      <div class="sub">${ld ? 'Leader : ' + esc(ld.first_name) : y.is_core_team ? 'Core Team' : 'Sans leader'}${miss.length ? ' · <span style="color:var(--warn)">incomplète</span>' : ''}${dups.has(y.id) ? ' · <span style="color:var(--bad)">doublon ?</span>' : ''}</div></span>
      <span class="b ${st.rate == null ? '' : st.rate >= 60 ? 'ok' : st.rate >= 30 ? 'warn' : 'bad'}">${st.rate == null ? '—' : st.rate + '%'}</span></a>`;
  }).join('') : '<div class="empty">Aucun jeune ici.</div>'}</div>`;
  return {
    title: f === 'equipe' ? 'Mon équipe' : 'Jeunes', html,
    bind(root) {
      const set = (k, v) => { const p = { f, leader, q: qv, [k]: v }; Object.keys(p).forEach((x) => !p[x] && delete p[x]); location.hash = '#/jeunes?' + new URLSearchParams(p).toString(); };
      on(root, '[data-f]', 'click', (e, el) => set('f', el.dataset.f));
      const ld = q('#ldr', root); if (ld) ld.addEventListener('change', () => set('leader', ld.value));
      const qs = q('#qs', root); let t;
      qs.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', '#/jeunes?' + new URLSearchParams({ ...(f ? { f } : {}), ...(leader ? { leader } : {}), ...(qs.value ? { q: qs.value } : {}) })); const pos = qs.selectionStart; render(); const n = q('#qs'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
    },
  };
}

/* ---------- JEUNE : fiche ---------- */
function viewYouthDetail(id) {
  const y = youthById(id);
  if (!y) return { title: 'Jeune', back: true, html: '<div class="empty">Fiche introuvable ou non accessible.</div>' };
  const st = presenceStats(y); const ld = youthById(y.leader_youth_id); const miss = missingFields(y);
  const canNote = canEditAll() || y.leader_youth_id === myYouthId();
  const ss = eligibleSessions(y);
  const fus = S.followups.filter((f) => f.youth_id === y.id).sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 8);
  const team = y.is_core_team ? teamOf(y.id) : [];
  const acc = accountOfYouth(y.id);
  const html = `
  <div class="card"><div class="hero"><span class="av ${y.is_core_team ? 'core' : ''}">${esc(initials(y))}</span>
    <div class="grow"><h1>${esc(fullName(y))}</h1><div class="small muted">${esc(STATUS[y.status])}${y.is_core_team ? ' · Core Team' : ''}${age(y.birth_date) != null ? ' · ' + age(y.birth_date) + ' ans' : ''}</div></div></div>
    ${digits(y.phone) ? `<div class="btns"><a class="btn ok sm" href="https://wa.me/${intlPhone(y.phone)}" target="_blank" rel="noopener">${I.wa} WhatsApp</a><a class="btn ghost sm" href="tel:+${intlPhone(y.phone)}">${I.phone} Appeler</a></div>` : ''}
  </div>
  ${miss.length ? `<div class="alert warn">Fiche incomplète : ${esc(miss.join(', '))}.</div>` : ''}
  <div class="card"><h2>Informations ${canEditAll() ? `<a class="btn sm ghost" href="#/jeune/${y.id}/modifier">Modifier</a>` : ''}</h2>
  <dl class="kv">
    <dt>Téléphone</dt><dd>${esc(fmtPhone(y.phone)) || '—'}</dd>
    <dt>Email</dt><dd>${esc(y.email) || '—'}</dd>
    <dt>Adresse</dt><dd>${esc(y.address) || '—'}</dd>
    <dt>Naissance</dt><dd>${y.birth_date ? esc(fmtLong(y.birth_date)) : '—'}</dd>
    <dt>Ministère(s) TG</dt><dd>${esc(y.ministry) || '—'}</dd>
    <dt>Bethel</dt><dd>${y.bethel == null ? '—' : y.bethel ? 'Oui' : 'Non'}</dd>
    <dt>Leader</dt><dd>${ld ? `<a href="#/jeune/${ld.id}">${esc(fullName(ld))}</a>` : y.is_core_team ? '— (Core Team)' : '<span style="color:var(--warn)">Sans leader</span>'}</dd>
    ${y.is_core_team ? `<dt>Son équipe</dt><dd>${team.length} jeune(s)${acc ? '' : ' · <span style="color:var(--warn)">pas encore de compte</span>'}</dd>` : ''}
    <dt>Ajouté le</dt><dd>${esc(fmtLong((y.created_at || '').slice(0, 10)))}</dd>
  </dl></div>
  <div class="card"><h2>Présences <span class="b ${st.rate == null ? '' : st.rate >= 60 ? 'ok' : st.rate >= 30 ? 'warn' : 'bad'}">${st.present}/${st.marked}${st.rate != null ? ' · ' + st.rate + '%' : ''}</span></h2>
    ${ss.length ? `<div class="hist">${ss.map((s) => { const a = attOf(s.id, y.id); return `<a class="dot ${a ? (a.present ? 'p' : 'a') : ''}" href="#/presence/${s.id}">${a ? (a.present ? '✓' : '✗') : '·'} ${esc(KIND_SHORT[s.kind])} ${esc(fmtD(s.date, { day: 'numeric', month: 'short' }))}</a>`; }).join('')}</div>` : '<div class="muted small">Aucune séance.</div>'}
  </div>
  <div class="card"><h2>Suivi hebdomadaire</h2>
    ${fus.length ? fus.map((f) => `<div class="row small" style="margin:6px 0"><span class="grow">Semaine ${esc(weekLabel(f.week_start))}</span>${f.sent ? '<span class="b ok">contacté</span>' : '<span class="b">non</span>'}${f.replied === true ? ' <span class="b ok">a répondu</span>' : f.replied === false ? ' <span class="b bad">pas de réponse</span>' : ''}</div>${f.note ? `<div class="small muted" style="margin:-2px 0 6px">${esc(f.note)}</div>` : ''}`).join('') : '<div class="muted small">Aucun suivi enregistré.</div>'}
  </div>
  <div class="card"><h2>Notes de suivi</h2><div id="notes"><div class="muted small">Chargement…</div></div>
    ${canNote ? `<form id="nf" style="margin-top:10px"><textarea name="body" placeholder="Ajouter une note (visite, besoin, prière, situation…)" required></textarea><button class="btn sm" style="margin-top:8px">Ajouter la note</button></form>` : ''}
  </div>`;
  return {
    title: y.first_name, back: true, html,
    async bind(root) {
      const box = q('#notes', root);
      const load = async () => {
        try {
          const notes = await must(sb.from('youth_notes').select('*').eq('youth_id', y.id).order('created_at', { ascending: false }));
          box.innerHTML = notes.length ? notes.map((n) => `<div class="note"><div class="small">${esc(n.body).replace(/\n/g, '<br>')}</div><div class="tiny muted">${esc(profileById(n.author_id)?.full_name || '—')} · ${new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div></div>`).join('') : '<div class="muted small">Aucune note.</div>';
        } catch (e) { box.innerHTML = `<div class="small" style="color:var(--bad)">${esc(errMsg(e))}</div>`; }
      };
      load();
      const nf = q('#nf', root);
      if (nf) nf.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button', nf); b.disabled = true;
        try { await must(sb.from('youth_notes').insert({ youth_id: y.id, author_id: S.me.id, body: nf.body.value.trim() })); nf.reset(); toast('Note ajoutée'); load(); }
        catch (err) { toast(errMsg(err), true); } b.disabled = false;
      });
    },
  };
}

/* ---------- JEUNE : formulaire ---------- */
function viewYouthForm(id) {
  if (!canEditAll()) return { title: 'Modifier', back: true, html: `<div class="alert warn">Tu n'as pas l'autorisation de modifier les fiches.</div>` };
  const y = id ? youthById(id) : { status: 'nouveau', is_core_team: false };
  if (!y) return { title: 'Modifier', back: true, html: '<div class="empty">Fiche introuvable.</div>' };
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
  const html = `<form class="card" id="yf">
    <label class="f"><span>Prénom *</span><input type="text" name="first_name" value="${esc(y.first_name)}" required></label>
    <label class="f"><span>Nom</span><input type="text" name="last_name" value="${esc(y.last_name)}"></label>
    <label class="f"><span>Téléphone (8 chiffres)</span><input type="tel" name="phone" inputmode="numeric" value="${esc(y.phone)}" placeholder="ex. 31324336"></label>
    <label class="f"><span>Email</span><input type="email" name="email" value="${esc(y.email)}"></label>
    <label class="f"><span>Adresse</span><input type="text" name="address" value="${esc(y.address)}"></label>
    <label class="f"><span>Date de naissance</span><input type="date" name="birth_date" value="${esc(y.birth_date)}"></label>
    <label class="f"><span>Ministère(s) à TG</span><input type="text" name="ministry" value="${esc(y.ministry)}" placeholder="ex. Media, Autel"></label>
    <label class="f"><span>Bethel</span><select name="bethel">${opt('', '—', y.bethel == null ? '' : null)}${opt('true', 'Oui', y.bethel === true ? 'true' : null)}${opt('false', 'Non', y.bethel === false ? 'false' : null)}</select></label>
    <label class="f"><span>Statut</span><select name="status">${Object.entries(STATUS).map(([k, l]) => opt(k, l, y.status)).join('')}</select></label>
    <label class="f"><span>Leader Core Team</span><select name="leader_youth_id"><option value="">— Sans leader —</option>${leaders().filter((l) => l.id !== y.id).map((l) => opt(l.id, fullName(l), y.leader_youth_id)).join('')}</select></label>
    <label class="chk"><input type="checkbox" name="is_core_team" ${y.is_core_team ? 'checked' : ''}> Membre de la Core Team (peut avoir une équipe)</label>
    <div class="btns" style="margin-top:8px"><button class="btn" type="submit">${id ? 'Enregistrer' : 'Ajouter le jeune'}</button><button type="button" class="btn light" data-back>Annuler</button></div>
    ${id && isSuper() ? '<hr><button type="button" class="btn danger sm" id="del">Supprimer cette fiche</button>' : ''}
  </form>`;
  return {
    title: id ? 'Modifier la fiche' : 'Nouveau jeune', back: true, html,
    bind(root) {
      const f = q('#yf', root);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', f); b.disabled = true;
        const rec = {
          first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim() || null,
          phone: digits(f.phone.value) || null, email: f.email.value.trim() || null, address: f.address.value.trim() || null,
          birth_date: f.birth_date.value || null, ministry: f.ministry.value.trim() || null,
          bethel: f.bethel.value === '' ? null : f.bethel.value === 'true', status: f.status.value,
          leader_youth_id: f.leader_youth_id.value || null, is_core_team: f.is_core_team.checked,
        };
        try {
          if (rec.phone) { const dup = S.youth.find((x) => x.id !== id && digits(x.phone) === rec.phone); if (dup && !confirmInline(b, `Ce numéro est déjà utilisé par ${fullName(dup)}. Appuie encore pour enregistrer quand même.`)) { b.disabled = false; return; } }
          let saved;
          if (id) { saved = await must(sb.from('youth').update(rec).eq('id', id).select()); saved = saved[0]; Object.assign(youthById(id), saved || rec); }
          else { rec.created_by = S.me.id; saved = (await must(sb.from('youth').insert(rec).select()))[0]; S.youth.push(saved); S.youth.sort((a, c) => fullName(a).localeCompare(fullName(c), 'fr')); }
          toast(id ? 'Fiche enregistrée' : 'Jeune ajouté'); go('#/jeune/' + (id || saved.id));
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const del = q('#del', root);
      if (del) del.addEventListener('click', async () => {
        if (!confirmInline(del, 'Confirmer la suppression définitive (présences et suivis inclus)')) return;
        try { await must(sb.from('youth').delete().eq('id', id)); S.youth = S.youth.filter((x) => x.id !== id); S.attendance = S.attendance.filter((a) => a.youth_id !== id); toast('Fiche supprimée'); go('#/jeunes'); } catch (err) { toast(errMsg(err), true); }
      });
    },
  };
}
// Confirmation en deux appuis (pas de boîte de dialogue native)
function confirmInline(btn, label) {
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; return true; }
  btn.dataset.armed = '1'; const old = btn.textContent; btn.dataset.old = old; btn.textContent = label; btn.disabled = false;
  setTimeout(() => { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = btn.dataset.old; } }, 5000);
  return false;
}

/* ---------- PRÉSENCES : séances ---------- */
function viewSessions() {
  const ss = sessionsSorted();
  const canCreate = !readOnly();
  const visibleIds = new Set(S.youth.map((y) => y.id));
  const html = `
  ${canCreate ? `<form class="card" id="sf"><h2>Nouvelle séance</h2>
    <div class="row wrap"><select name="kind" class="grow" style="min-width:170px">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${new Date().getDay() === 0 && k === 'culte' ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input type="date" name="date" value="${today()}" style="width:auto;flex:1;min-width:150px"></div>
    <button class="btn full" style="margin-top:10px">Ouvrir la feuille de présence</button></form>` : ''}
  <div class="sec">Séances</div>
  <div class="list">${ss.length ? ss.map((s) => {
    const rows = S.attendance.filter((a) => a.session_id === s.id && visibleIds.has(a.youth_id));
    const p = rows.filter((a) => a.present).length;
    return `<a class="li" href="#/presence/${s.id}"><span class="av">${esc(fmtD(s.date, { day: 'numeric' }))}</span><span class="grow"><div class="nm">${esc(KINDS[s.kind])}</div><div class="sub">${esc(fmtD(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></span><span class="b ok">${p} présents</span></a>`;
  }).join('') : '<div class="empty">Aucune séance pour le moment.</div>'}</div>`;
  return {
    title: 'Présences', html,
    bind(root) {
      const f = q('#sf', root); if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const kind = f.kind.value, date = f.date.value; if (!date) return;
        let s = S.sessions.find((x) => x.kind === kind && x.date === date);
        try {
          if (!s) {
            const r = await sb.from('sessions').insert({ kind, date, created_by: S.me.id }).select();
            if (r.error && /duplicate/i.test(r.error.message)) { await loadAll(); s = S.sessions.find((x) => x.kind === kind && x.date === date); }
            else if (r.error) throw r.error; else { s = r.data[0]; S.sessions.push(s); }
          }
          go('#/presence/' + s.id);
        } catch (err) { toast(errMsg(err), true); }
      });
    },
  };
}

/* ---------- PRÉSENCES : feuille d'appel ---------- */
function viewSession(id, params) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return { title: 'Séance', back: true, html: '<div class="empty">Séance introuvable.</div>' };
  const editable = !readOnly();
  const scope = params.v || (canEditAll() ? 'tous' : 'equipe');
  const qv = params.q || '';
  let list = S.youth.filter((y) => y.status !== 'inactif' || attOf(s.id, y.id));
  if (scope === 'equipe' && hasTeam()) list = list.filter((y) => y.leader_youth_id === myYouthId());
  if (scope === 'nonmarques') list = list.filter((y) => !attOf(s.id, y.id));
  if (!canEditAll()) list = list.filter((y) => y.leader_youth_id === myYouthId());
  if (qv) { const n = norm(qv); list = list.filter((y) => norm(fullName(y)).includes(n)); }
  const canMark = (y) => editable && (canEditAll() || (role() === 'coreteam' && y.leader_youth_id === myYouthId()));
  const counts = () => { const rows = S.attendance.filter((a) => a.session_id === s.id); return { p: rows.filter((a) => a.present).length, a: rows.filter((a) => !a.present).length }; };
  const c = counts();
  const chip = (k, l) => `<button class="chip ${scope === k ? 'on' : ''}" data-v="${k}">${l}</button>`;
  const html = `
  <div class="card"><div class="row"><div class="grow"><h2>${esc(KINDS[s.kind])}</h2><div class="small muted">${esc(fmtD(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
  <div style="text-align:right"><div><span class="b ok" id="cp">${c.p} présents</span></div><div style="margin-top:4px"><span class="b bad" id="ca">${c.a} absents</span></div></div></div>
  ${readOnly() ? '<div class="small muted" style="margin-top:8px">Lecture seule.</div>' : ''}</div>
  <div class="sticky-head">
    <input type="search" class="search" id="qs" placeholder="Rechercher…" value="${esc(qv)}" style="margin-bottom:8px">
    <div class="chips">${canEditAll() ? chip('tous', 'Tout le monde') : ''}${hasTeam() ? chip('equipe', 'Mon équipe') : ''}${chip('nonmarques', 'Non marqués')}</div>
  </div>
  <div class="list" id="al">${list.length ? list.map((y) => { const a = attOf(s.id, y.id); const dis = canMark(y) ? '' : 'disabled';
    return `<div class="li" data-y="${y.id}"><span class="av ${y.is_core_team ? 'core' : ''}">${esc(initials(y))}</span><span class="grow"><div class="nm">${esc(fullName(y))}</div><div class="sub">${y.status === 'nouveau' ? 'Nouveau · ' : ''}${esc(youthById(y.leader_youth_id)?.first_name ? 'Équipe ' + youthById(y.leader_youth_id).first_name : '')}</div></span>
    <span class="pa"><button class="p ${a?.present ? 'on' : ''}" data-mark="1" ${dis} aria-label="Présent">P</button><button class="a ${a && !a.present ? 'on' : ''}" data-mark="0" ${dis} aria-label="Absent">A</button></span></div>`; }).join('') : '<div class="empty">Personne dans cette liste.</div>'}</div>
  ${editable && list.some((y) => canMark(y) && !attOf(s.id, y.id)) ? '<button class="btn light full" id="allabs" style="margin-bottom:12px">Marquer absents tous les non marqués de cette liste</button>' : ''}
  ${canEditAll() ? `<form class="card" id="vf"><h2>Ajouter un visiteur / nouveau</h2>
    <div class="row wrap"><input type="text" name="fn" placeholder="Prénom *" required style="flex:1;min-width:130px"><input type="text" name="ln" placeholder="Nom" style="flex:1;min-width:130px"></div>
    <input type="tel" name="ph" inputmode="numeric" placeholder="Téléphone" style="margin-top:8px">
    <button class="btn full" style="margin-top:8px">Ajouter et marquer présent</button></form>` : ''}
  ${isAdmin() ? '<button class="btn danger sm" id="dels">Supprimer cette séance</button>' : ''}`;
  return {
    title: KIND_SHORT[s.kind] + ' · ' + fmtD(s.date, { day: 'numeric', month: 'short' }), back: true, html,
    bind(root) {
      const setP = (k, v) => { const p = { v: scope, q: qv, [k]: v }; Object.keys(p).forEach((x) => !p[x] && delete p[x]); history.replaceState(null, '', `#/presence/${id}?` + new URLSearchParams(p)); render(); };
      on(root, '[data-v]', 'click', (e, el) => setP('v', el.dataset.v));
      const qs = q('#qs', root); let t;
      qs.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const pos = qs.selectionStart; setP('q', qs.value); const n = q('#qs'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
      const refreshCounts = () => { const cc = counts(); q('#cp', root).textContent = cc.p + ' présents'; q('#ca', root).textContent = cc.a + ' absents'; };
      const mark = async (yid, present, row) => {
        const prev = attOf(s.id, yid);
        const now = prev && prev.present === present ? null : present; // ré-appui = effacer
        const btns = qa('button', row); btns.forEach((b) => b.classList.remove('on'));
        if (now !== null) q(now ? '.p' : '.a', row).classList.add('on');
        try {
          if (now === null) { await must(sb.from('attendance').delete().eq('session_id', s.id).eq('youth_id', yid)); S.attendance = S.attendance.filter((a) => !(a.session_id === s.id && a.youth_id === yid)); }
          else {
            const rec = { session_id: s.id, youth_id: yid, present: now, marked_by: S.me.id, marked_at: new Date().toISOString() };
            await must(sb.from('attendance').upsert(rec));
            if (prev) Object.assign(prev, rec); else S.attendance.push(rec);
          }
          refreshCounts();
        } catch (err) { toast(errMsg(err), true); btns.forEach((b) => b.classList.remove('on')); if (prev) q(prev.present ? '.p' : '.a', row).classList.add('on'); }
      };
      on(root, '[data-mark]', 'click', (e, el) => { const row = el.closest('[data-y]'); mark(row.dataset.y, el.dataset.mark === '1', row); });
      const ab = q('#allabs', root);
      if (ab) ab.addEventListener('click', async () => {
        const recs = list.filter((y) => canMark(y) && !attOf(s.id, y.id)).map((y) => ({ session_id: s.id, youth_id: y.id, present: false, marked_by: S.me.id, marked_at: new Date().toISOString() }));
        if (!recs.length) return; ab.disabled = true;
        try { await must(sb.from('attendance').upsert(recs)); S.attendance.push(...recs); toast(recs.length + ' absents marqués'); render(); } catch (err) { toast(errMsg(err), true); ab.disabled = false; }
      });
      const vf = q('#vf', root);
      if (vf) vf.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button', vf); b.disabled = true;
        try {
          const ph = digits(vf.ph.value) || null;
          const ex = ph && S.youth.find((x) => digits(x.phone) === ph);
          let y = ex;
          if (!y) { y = (await must(sb.from('youth').insert({ first_name: vf.fn.value.trim(), last_name: vf.ln.value.trim() || null, phone: ph, status: 'nouveau', created_by: S.me.id }).select()))[0]; S.youth.push(y); S.youth.sort((a, c2) => fullName(a).localeCompare(fullName(c2), 'fr')); }
          const rec = { session_id: s.id, youth_id: y.id, present: true, marked_by: S.me.id, marked_at: new Date().toISOString() };
          await must(sb.from('attendance').upsert(rec));
          S.attendance = S.attendance.filter((a) => !(a.session_id === s.id && a.youth_id === y.id)); S.attendance.push(rec);
          toast(ex ? `${fullName(y)} existait déjà : marqué présent` : `${fullName(y)} ajouté et marqué présent`); render();
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const ds = q('#dels', root);
      if (ds) ds.addEventListener('click', async () => {
        if (!confirmInline(ds, 'Appuie encore : supprimer la séance et toutes ses présences')) return;
        try { await must(sb.from('sessions').delete().eq('id', s.id)); S.sessions = S.sessions.filter((x) => x.id !== s.id); S.attendance = S.attendance.filter((a) => a.session_id !== s.id); toast('Séance supprimée'); go('#/presences'); } catch (err) { toast(errMsg(err), true); }
      });
    },
  };
}

/* ---------- SUIVI HEBDO ---------- */
function viewFollow(params) {
  const ws = params.w || weekStart();
  const lead = params.leader || (hasTeam() ? myYouthId() : canReadAll() ? 'all' : '');
  let list;
  if (lead === 'all') list = expectedLeaders().flatMap((x) => x.team);
  else if (lead === 'none') list = activeYouth().filter((y) => !y.leader_youth_id && !y.is_core_team);
  else list = lead ? teamOf(lead) : [];
  if (!canReadAll()) list = myTeam().filter((y) => y.status !== 'inactif');
  const canTick = (y) => !readOnly() && (canEditAll() || y.leader_youth_id === myYouthId());
  const st = teamFollowStats(list, ws);
  const isCur = ws === weekStart();
  const msgTpl = (y) => encodeURIComponent(`Bonjour ${y.first_name} ! 🙏 Comment vas-tu cette semaine ? On pense à toi au Youth Madeline. N'hésite pas si tu as un sujet de prière. À dimanche !`);
  const html = `
  <div class="card"><div class="row"><button class="btn light sm" data-w="${addDays(ws, -7)}">‹</button>
    <div class="grow" style="text-align:center"><b>Semaine ${esc(weekLabel(ws))}</b><div class="tiny muted">${isCur ? 'semaine en cours' : ''}</div></div>
    <button class="btn light sm" data-w="${addDays(ws, 7)}" ${isCur ? 'disabled' : ''}>›</button></div>
    ${canReadAll() ? `<select id="ldr" style="margin-top:10px">${hasTeam() ? `<option value="${myYouthId()}" ${lead === myYouthId() ? 'selected' : ''}>Mon équipe</option>` : ''}<option value="all" ${lead === 'all' ? 'selected' : ''}>Toutes les équipes</option>${leaders().filter((l) => teamOf(l.id).length && l.id !== myYouthId()).map((l) => `<option value="${l.id}" ${lead === l.id ? 'selected' : ''}>Équipe de ${esc(fullName(l))}</option>`).join('')}<option value="none" ${lead === 'none' ? 'selected' : ''}>Jeunes sans leader</option></select>` : ''}
    <div class="row" style="margin-top:12px"><div class="grow prog"><i style="width:${st.p}%"></i></div><b class="small">${st.sent}/${st.n}</b></div>
  </div>
  ${!list.length ? `<div class="empty">${role() === 'coreteam' && !hasTeam() ? "Aucun jeune ne t'est encore assigné." : 'Aucun jeune dans cette liste.'}</div>` : `
  <div class="small muted" style="margin:0 4px 8px">Envoie ton message (WhatsApp, appel…) puis coche « Contacté ».</div>
  <div class="list">${list.map((y) => { const f = fuOf(y.id, ws); const dis = canTick(y) ? '' : 'disabled';
    return `<div class="fu" data-y="${y.id}"><div class="row"><a class="grow" href="#/jeune/${y.id}" style="color:inherit;min-width:0"><div class="nm" style="font-weight:600">${esc(fullName(y))}</div><div class="tiny muted">${lead === 'all' ? 'Équipe ' + esc(youthById(y.leader_youth_id)?.first_name || '') + ' · ' : ''}${esc(fmtPhone(y.phone)) || 'pas de numéro'}</div></a>
      ${digits(y.phone) ? `<a class="btn ok sm" style="padding:0 10px" href="https://wa.me/${intlPhone(y.phone)}?text=${msgTpl(y)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ''}
      <button class="tog ${f?.sent ? 'on' : ''}" data-sent ${dis}>${f?.sent ? '✓ Contacté' : 'Contacté ?'}</button></div>
      ${f?.sent ? `<div class="extra"><div class="row"><span class="small muted grow">A répondu ?</span><span class="mini"><button class="y ${f.replied === true ? 'on' : ''}" data-rep="1" ${dis}>Oui</button><button class="n ${f.replied === false ? 'on' : ''}" data-rep="0" ${dis}>Non</button></span></div>
      <input type="text" data-note placeholder="Note (facultatif)" value="${esc(f.note)}" ${dis}></div>` : ''}</div>`; }).join('')}</div>`}`;
  return {
    title: 'Suivi hebdo', html,
    bind(root) {
      const nav = (k, v) => { const p = { w: ws, leader: lead, [k]: v }; if (p.w === weekStart()) delete p.w; location.hash = '#/suivi?' + new URLSearchParams(p); };
      on(root, '[data-w]', 'click', (e, el) => nav('w', el.dataset.w));
      const ld = q('#ldr', root); if (ld) ld.addEventListener('change', () => nav('leader', ld.value));
      const save = async (yid, patch) => {
        const prev = fuOf(yid, ws);
        const rec = { youth_id: yid, week_start: ws, sent: prev?.sent || false, replied: prev?.replied ?? null, note: prev?.note ?? null, ...patch, updated_by: S.me.id, updated_at: new Date().toISOString() };
        if (!rec.sent) { rec.replied = null; }
        await must(sb.from('followups').upsert(rec));
        if (prev) Object.assign(prev, rec); else S.followups.push(rec);
      };
      on(root, '[data-sent]', 'click', async (e, el) => { const yid = el.closest('[data-y]').dataset.y; el.disabled = true; try { await save(yid, { sent: !fuOf(yid, ws)?.sent }); render(); } catch (err) { toast(errMsg(err), true); el.disabled = false; } });
      on(root, '[data-rep]', 'click', async (e, el) => { const yid = el.closest('[data-y]').dataset.y; const v = el.dataset.rep === '1'; const cur = fuOf(yid, ws)?.replied; try { await save(yid, { replied: cur === v ? null : v }); render(); } catch (err) { toast(errMsg(err), true); } });
      on(root, '[data-note]', 'change', async (e, el) => { const yid = el.closest('[data-y]').dataset.y; try { await save(yid, { note: el.value.trim() || null }); toast('Note enregistrée'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}

/* ---------- RAPPORTS ---------- */
function viewReports(params) {
  const ws = params.w || weekStart();
  const isCur = ws === weekStart();
  let html = '';
  if (canReport()) {
    const cur = reportOf(S.me.id, weekStart()), prev = reportOf(S.me.id, addDays(weekStart(), -7));
    html += `<div class="sec">Mon rapport</div><div class="card">
      <div class="row" style="margin-bottom:8px"><span class="grow">Semaine en cours (${esc(weekLabel(weekStart()))})</span>${cur ? `<a class="b ok" href="#/rapport/${cur.id}">soumis ✓</a>` : `<a class="btn sm" href="#/rapport/nouveau">Rédiger</a>`}</div>
      <div class="row"><span class="grow small muted">Semaine dernière (${esc(weekLabel(addDays(weekStart(), -7)))})</span>${prev ? `<a class="b ok" href="#/rapport/${prev.id}">soumis ✓</a>` : `<a class="btn sm ghost" href="#/rapport/nouveau?w=${addDays(weekStart(), -7)}">Rédiger</a>`}</div>
    </div>`;
    const mine = S.reports.filter((r) => r.author_id === S.me.id);
    if (mine.length && !canReadAll()) html += `<div class="list">${mine.map((r) => `<a class="li" href="#/rapport/${r.id}"><span class="grow"><div class="nm">Semaine ${esc(weekLabel(r.week_start))}</div><div class="sub">${r.contacted ?? 0}/${r.team_size ?? '?'} contactés</div></span></a>`).join('')}</div>`;
  } else if (role() === 'coreteam') {
    html += `<div class="alert warn">Tu pourras soumettre un rapport dès que des jeunes te seront assignés.</div>`;
  }
  if (canReadAll()) {
    const exp = expectedLeaders();
    const wk = S.reports.filter((r) => r.week_start === ws);
    const missing = exp.filter((x) => !(x.acc && reportOf(x.acc.id, ws)));
    html += `<div class="sec">Tous les rapports</div>
    <div class="card"><div class="row"><button class="btn light sm" data-w="${addDays(ws, -7)}">‹</button><div class="grow" style="text-align:center"><b>Semaine ${esc(weekLabel(ws))}</b></div><button class="btn light sm" data-w="${addDays(ws, 7)}" ${isCur ? 'disabled' : ''}>›</button></div>
    <div class="small" style="margin-top:10px">${wk.length} rapport(s) reçu(s) sur ${exp.length} leader(s) attendu(s).</div>
    ${missing.length ? `<div class="alert warn" style="margin:10px 0 0"><b>Pas encore soumis :</b> ${missing.map((x) => esc(fullName(x.l)) + (x.acc ? '' : ' (sans compte)')).join(', ')}</div>` : exp.length ? '<div class="alert ok" style="margin:10px 0 0">Tous les leaders ont soumis leur rapport 🎉</div>' : ''}
    </div>
    <div class="list">${wk.length ? wk.map((r) => { const p = profileById(r.author_id); return `<a class="li" href="#/rapport/${r.id}"><span class="av core">${esc(initials({ first_name: p?.full_name || '?' }))}</span><span class="grow"><div class="nm">${esc(p?.full_name || '—')}</div><div class="sub">${r.contacted ?? 0}/${r.team_size ?? '?'} contactés · ${(r.attention_youth || []).length} à suivre de près</div></span></a>`; }).join('') : '<div class="empty">Aucun rapport cette semaine.</div>'}</div>`;
  }
  return {
    title: 'Rapports', html,
    bind(root) { on(root, '[data-w]', 'click', (e, el) => { location.hash = '#/rapports' + (el.dataset.w === weekStart() ? '' : '?w=' + el.dataset.w); }); },
  };
}
function viewReportForm(params) {
  if (!canReport()) return { title: 'Rapport', back: true, html: `<div class="alert warn">Seuls les leaders avec une équipe peuvent soumettre un rapport.</div>` };
  const ws = params.w || weekStart();
  const ex = reportOf(S.me.id, ws);
  if (ex) return { title: 'Rapport', back: true, html: `<div class="alert ok">Ton rapport de cette semaine est déjà soumis. <a href="#/rapport/${ex.id}">Le voir</a></div>` };
  const team = myTeam().filter((y) => y.status !== 'inactif');
  const fs = teamFollowStats(team, ws);
  const html = `<form class="card" id="rf">
    <h2>Semaine ${esc(weekLabel(ws))}</h2>
    <div class="alert info">Jeunes contactés : <b>${fs.sent}/${fs.n}</b> (calculé depuis ton suivi). ${fs.sent < fs.n ? `<a href="#/suivi${ws !== weekStart() ? '?w=' + ws : ''}">Compléter le suivi d'abord</a>` : ''}</div>
    <label class="f"><span>Résumé de la semaine *</span><textarea name="summary" required placeholder="Comment vont les jeunes de ton équipe ? Qui a répondu, nouvelles importantes…"></textarea></label>
    <div class="f" style="margin-bottom:12px"><span class="small muted" style="font-weight:600">Jeunes qui ont besoin d'une attention particulière</span>
      ${team.map((y) => `<label class="chk"><input type="checkbox" name="att" value="${y.id}"> ${esc(fullName(y))}</label>`).join('')}</div>
    <label class="f"><span>Besoins de prière</span><textarea name="prayer"></textarea></label>
    <label class="f"><span>Difficultés rencontrées</span><textarea name="difficulties"></textarea></label>
    <label class="f"><span>Suggestions</span><textarea name="suggestions"></textarea></label>
    <div class="small muted" style="margin-bottom:10px">Une fois soumis, le rapport ne peut plus être modifié.</div>
    <button class="btn full" type="submit">Soumettre le rapport</button>
  </form>`;
  return {
    title: 'Mon rapport', back: true, html,
    bind(root) {
      const f = q('#rf', root);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', f);
        if (!confirmInline(b, 'Appuie encore pour confirmer l’envoi')) return;
        b.disabled = true;
        const rec = { author_id: S.me.id, week_start: ws, contacted: fs.sent, team_size: fs.n, summary: f.summary.value.trim(), attention_youth: qa('input[name=att]:checked', f).map((x) => x.value), prayer: f.prayer.value.trim() || null, difficulties: f.difficulties.value.trim() || null, suggestions: f.suggestions.value.trim() || null };
        try { const r = (await must(sb.from('reports').insert(rec).select()))[0]; S.reports.push(r); toast('Rapport soumis. Merci !'); go('#/rapport/' + r.id); } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
    },
  };
}
function viewReportDetail(id) {
  const r = S.reports.find((x) => x.id === id);
  if (!r) return { title: 'Rapport', back: true, html: '<div class="empty">Rapport introuvable.</div>' };
  const p = profileById(r.author_id);
  const block = (t, v) => v ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:600">${t}</div><div>${esc(v).replace(/\n/g, '<br>')}</div></div>` : '';
  const att = (r.attention_youth || []).map(youthById).filter(Boolean);
  const html = `<div class="card"><h2>${esc(p?.full_name || '—')}</h2><div class="small muted">Semaine ${esc(weekLabel(r.week_start))} · soumis le ${new Date(r.submitted_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    <div class="alert info" style="margin-top:12px">Jeunes contactés : <b>${r.contacted ?? 0}/${r.team_size ?? '?'}</b></div>
    ${block('Résumé', r.summary)}
    ${att.length ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:600">Attention particulière</div>${att.map(yLine).join('')}</div>` : ''}
    ${block('Besoins de prière', r.prayer)}${block('Difficultés', r.difficulties)}${block('Suggestions', r.suggestions)}
    ${isSuper() ? '<hr><button class="btn danger sm" id="delr">Supprimer (permet de le refaire)</button>' : ''}</div>`;
  return {
    title: 'Rapport', back: true, html,
    bind(root) {
      const d = q('#delr', root);
      if (d) d.addEventListener('click', async () => { if (!confirmInline(d, 'Appuie encore pour supprimer')) return; try { await must(sb.from('reports').delete().eq('id', r.id)); S.reports = S.reports.filter((x) => x.id !== r.id); toast('Rapport supprimé'); go('#/rapports'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}

/* ---------- ÉQUIPES ---------- */
function viewTeams(params) {
  if (!canEditAll()) return { title: 'Équipes', html: `<div class="alert warn">Accès réservé.</div>` };
  const f = params.f || 'sansleader';
  const ls = leaders();
  let list = activeYouth().filter((y) => !y.is_core_team || y.leader_youth_id);
  if (f === 'sansleader') list = list.filter((y) => !y.leader_youth_id);
  else if (f !== 'tous') list = list.filter((y) => y.leader_youth_id === f);
  const html = `
  <div class="card"><h2>Membres Core Team</h2>
    ${ls.length ? ls.map((l) => { const acc = accountOfYouth(l.id); return `<div class="row small" style="margin:8px 0"><span class="av core" style="width:32px;height:32px;font-size:.72rem">${esc(initials(l))}</span><span class="grow"><b>${esc(fullName(l))}</b><div class="tiny muted">${teamOf(l.id).length} jeune(s) · ${acc ? 'compte : ' + esc(ROLES[acc.role]) : '<span style="color:var(--warn)">pas de compte</span>'}</div></span><button class="chip ${f === l.id ? 'on' : ''}" data-f="${l.id}">Voir</button></div>`; }).join('') : '<div class="muted small">Aucun membre Core Team. Coche « Membre de la Core Team » sur leur fiche.</div>'}
    <div class="small muted" style="margin-top:8px">Pour ajouter un membre : ouvre sa fiche → Modifier → coche « Membre de la Core Team ».${isAdmin() ? ' Pour lui donner accès : Menu → Comptes et rôles.' : ''}</div>
  </div>
  <div class="chips"><button class="chip ${f === 'sansleader' ? 'on' : ''}" data-f="sansleader">Sans leader (${activeYouth().filter((y) => !y.leader_youth_id && !y.is_core_team).length})</button><button class="chip ${f === 'tous' ? 'on' : ''}" data-f="tous">Tous</button></div>
  <div class="list">${list.length ? list.map((y) => `<div class="li"><span class="grow"><div class="nm">${esc(fullName(y))}</div><div class="sub">${presenceStats(y).rate ?? '—'}${presenceStats(y).rate != null ? '% présence' : ''}</div></span>
    <select data-assign="${y.id}" style="width:150px;min-height:38px;padding:6px 8px;font-size:.85rem"><option value="">Sans leader</option>${ls.filter((l) => l.id !== y.id).map((l) => `<option value="${l.id}" ${y.leader_youth_id === l.id ? 'selected' : ''}>${esc(l.first_name)}</option>`).join('')}</select></div>`).join('') : '<div class="empty">Tous les jeunes ont un leader 👍</div>'}</div>`;
  return {
    title: 'Équipes Core Team', back: true, html,
    bind(root) {
      on(root, '[data-f]', 'click', (e, el) => { location.hash = '#/equipes?f=' + el.dataset.f; });
      on(root, '[data-assign]', 'change', async (e, el) => {
        const y = youthById(el.dataset.assign); const v = el.value || null;
        try { await must(sb.from('youth').update({ leader_youth_id: v }).eq('id', y.id)); y.leader_youth_id = v; toast(v ? `${y.first_name} → équipe de ${youthById(v).first_name}` : `${y.first_name} sans leader`); }
        catch (err) { toast(errMsg(err), true); el.value = y.leader_youth_id || ''; }
      });
    },
  };
}

/* ---------- COMPTES ---------- */
let lastCred = null;
function credText(c) { return `Youth Madeline – Suivi\nLien : ${location.origin + location.pathname}\nEmail : ${c.email}\nMot de passe provisoire : ${c.password}\n(Tu devras choisir ton propre mot de passe à la première connexion.)`; }
function viewAccounts(params) {
  if (!isAdmin()) return { title: 'Comptes', html: `<div class="alert warn">Accès réservé au Super Admin et à l'Assistant.</div>` };
  const editId = params.edit;
  const ps = visibleProfiles().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'fr'));
  const linked = new Set(S.profiles.map((p) => p.youth_id).filter(Boolean));
  const youthOpts = (cur) => `<option value="">— Aucune fiche —</option>` + S.youth.filter((y) => !linked.has(y.id) || y.id === cur).map((y) => `<option value="${y.id}" ${y.id === cur ? 'selected' : ''}>${esc(fullName(y))}${y.is_core_team ? ' (Core)' : ''}</option>`).join('');
  const roleOpts = (cur) => Object.entries(ROLES).filter(([k]) => k !== 'superadmin' || isSuper()).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
  const ed = editId && profileById(editId);
  const html = `
  ${lastCred ? `<div class="card"><h2>Identifiants à transmettre</h2><div class="cred">${esc(credText(lastCred))}</div>
    <div class="btns" style="margin-top:10px"><a class="btn ok sm" target="_blank" rel="noopener" href="https://wa.me/${lastCred.phone ? intlPhone(lastCred.phone) : ''}?text=${encodeURIComponent(credText(lastCred))}">${I.wa} Envoyer par WhatsApp</a><button class="btn light sm" id="copy">Copier</button><button class="btn light sm" id="hide">Masquer</button></div>
    <div class="tiny muted" style="margin-top:6px">Ce mot de passe ne sera plus affiché après.</div></div>` : ''}
  ${ed ? `<form class="card" id="ef"><h2>Modifier : ${esc(ed.full_name || ed.email)}</h2><div class="small muted" style="margin-bottom:10px">${esc(ed.email)}</div>
    <label class="f"><span>Nom affiché</span><input type="text" name="full_name" value="${esc(ed.full_name)}"></label>
    <label class="f"><span>Rôle</span><select name="role">${ed.role === 'superadmin' && !isSuper() ? '<option>Super Admin</option>' : roleOpts(ed.role)}</select></label>
    <label class="f"><span>Fiche jeune liée (pour voir son équipe)</span><select name="youth_id">${youthOpts(ed.youth_id)}</select></label>
    <div class="btns"><button class="btn" type="submit">Enregistrer</button><a class="btn light" href="#/comptes">Annuler</a></div>
    <hr><button type="button" class="btn ghost sm" id="rp">Réinitialiser le mot de passe</button></form>` : `
  <form class="card" id="cf"><h2>Créer un compte</h2>
    <label class="f"><span>Fiche jeune liée (facultatif)</span><select name="youth_id" id="cyid">${youthOpts(null)}</select></label>
    <label class="f"><span>Nom affiché *</span><input type="text" name="full_name" required></label>
    <label class="f"><span>Email *</span><input type="email" name="email" required autocomplete="off"></label>
    <label class="f"><span>Rôle *</span><select name="role">${roleOpts('coreteam')}</select></label>
    <label class="f"><span>Mot de passe provisoire</span><div class="row"><input type="text" name="password" value="${genPassword()}" required minlength="8" class="grow"><button type="button" class="btn light sm" id="gen">↻</button></div></label>
    <button class="btn full" type="submit">Créer le compte</button>
    <div class="tiny muted" style="margin-top:8px">La personne choisira son propre mot de passe à la première connexion.</div></form>`}
  <div class="sec">Comptes (${ps.length})</div>
  <div class="list">${ps.map((p) => { const y = youthById(p.youth_id); return `<a class="li" href="#/comptes?edit=${p.id}"><span class="grow"><div class="nm">${esc(p.full_name || p.email)}</div><div class="sub">${esc(p.email)}${y ? ' · fiche ' + esc(fullName(y)) : ''}</div></span><span class="b ${p.role === 'inactif' ? 'bad' : p.role === 'superadmin' ? 'acc' : 'pri'}">${esc(ROLES[p.role].split(' (')[0])}</span></a>`; }).join('')}</div>
  <div class="card small muted"><b>Rôles</b><br>• <b>Super Admin</b> : tout voir, tout modifier, gérer les comptes.<br>• <b>Assistant</b> : comme Care + créer des comptes et répartir les jeunes.<br>• <b>Volunteer Care</b> : ajouter/modifier tous les jeunes, présences de tous.<br>• <b>Pasteur</b> : tout voir, sans rien modifier.<br>• <b>Core Team</b> : seulement son équipe (lier sa fiche jeune).<br>• <b>Inactif</b> : aucun accès.</div>`;
  return {
    title: 'Comptes et rôles', back: true, html,
    bind(root) {
      const cp = q('#copy', root); if (cp) cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(credText(lastCred)); toast('Copié'); } catch { toast('Copie impossible : sélectionne le texte', true); } });
      const hd = q('#hide', root); if (hd) hd.addEventListener('click', () => { lastCred = null; render(); });
      const cf = q('#cf', root);
      if (cf) {
        q('#gen', root).addEventListener('click', () => { cf.password.value = genPassword(); });
        q('#cyid', root).addEventListener('change', (e) => { const y = youthById(e.target.value); if (y) { if (!cf.full_name.value) cf.full_name.value = fullName(y); if (!cf.email.value && y.email) cf.email.value = y.email; } });
        cf.addEventListener('submit', async (e) => {
          e.preventDefault(); const b = q('button[type=submit]', cf); b.disabled = true;
          const email = cf.email.value.trim().toLowerCase(), password = cf.password.value;
          try {
            await must(sb.rpc('admin_create_user', { p_email: email, p_password: password, p_full_name: cf.full_name.value.trim(), p_role: cf.role.value, p_youth_id: cf.youth_id.value || null }));
            lastCred = { email, password, phone: youthById(cf.youth_id.value)?.phone };
            S.profiles = await fetchAll('profiles', ['full_name']); toast('Compte créé'); render(); window.scrollTo(0, 0);
          } catch (err) { toast(errMsg(err), true); b.disabled = false; }
        });
      }
      const ef = q('#ef', root);
      if (ef) {
        ef.addEventListener('submit', async (e) => {
          e.preventDefault(); const b = q('button[type=submit]', ef); b.disabled = true;
          try {
            const newRole = ed.role === 'superadmin' && !isSuper() ? 'superadmin' : ef.role.value;
            await must(sb.rpc('admin_update_user', { p_user_id: ed.id, p_role: newRole, p_full_name: ef.full_name.value.trim(), p_youth_id: ef.youth_id.value || null }));
            S.profiles = await fetchAll('profiles', ['full_name']);
            if (ed.id === S.me.id) S.me = profileById(S.me.id);
            toast('Compte mis à jour'); go('#/comptes');
          } catch (err) { toast(errMsg(err), true); b.disabled = false; }
        });
        q('#rp', root).addEventListener('click', async (e) => {
          const b = e.currentTarget; if (!confirmInline(b, 'Appuie encore pour générer un nouveau mot de passe')) return;
          const pw = genPassword();
          try { await must(sb.rpc('admin_reset_password', { p_user_id: ed.id, p_password: pw })); lastCred = { email: ed.email, password: pw, phone: youthById(ed.youth_id)?.phone }; toast('Mot de passe réinitialisé'); go('#/comptes'); }
          catch (err) { toast(errMsg(err), true); }
        });
      }
    },
  };
}

/* ---------- MON COMPTE ---------- */
function viewMyAccount() {
  const y = youthById(myYouthId());
  const html = `<div class="card"><h2>${esc(S.me.full_name || '')}</h2><dl class="kv"><dt>Email</dt><dd>${esc(S.me.email || S.user.email)}</dd><dt>Rôle</dt><dd>${esc(ROLES[role()])}</dd><dt>Ma fiche</dt><dd>${y ? `<a href="#/jeune/${y.id}">${esc(fullName(y))}</a>` : '—'}</dd>${hasTeam() ? `<dt>Mon équipe</dt><dd>${myTeam().length} jeune(s)</dd>` : ''}</dl></div>
  <div class="card"><h2>Changer mon mot de passe</h2>${passwordForm('mpf')}</div>
  <button class="btn danger full" data-logout>Se déconnecter</button>`;
  return {
    title: 'Mon compte', back: true, html,
    bind(root) { q('#mpf', root).addEventListener('submit', async (e) => { e.preventDefault(); try { await submitPassword(e.target); e.target.reset(); toast('Mot de passe modifié'); } catch (err) { toast(errMsg(err), true); } }); },
  };
}

/* ---------- EXPORT ---------- */
function csv(rows) { return '﻿' + rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n'); }
function download(name, content) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function viewExport() {
  if (!canReadAll()) return { title: 'Export', html: '<div class="alert warn">Accès réservé.</div>' };
  const html = `<div class="card"><h2>Exporter les données</h2><p class="small muted">Fichiers CSV (séparateur « ; »), ouvrables dans Excel ou Google Sheets.</p>
    <div class="stack"><button class="btn full" data-x="youth">Liste des jeunes</button><button class="btn full ghost" data-x="att">Présences (une colonne par séance)</button><button class="btn full ghost" data-x="fu">Suivis hebdomadaires</button><button class="btn full ghost" data-x="rep">Rapports</button></div></div>`;
  return {
    title: 'Export', back: true, html,
    bind(root) {
      on(root, '[data-x]', 'click', (e, el) => {
        const d = today(); const t = el.dataset.x;
        if (t === 'youth') download(`jeunes_${d}.csv`, csv([['Prénom', 'Nom', 'Téléphone', 'Email', 'Adresse', 'Naissance', 'Ministère', 'Bethel', 'Core Team', 'Leader', 'Statut', 'Taux présence %'], ...S.youth.map((y) => [y.first_name, y.last_name, y.phone, y.email, y.address, y.birth_date, y.ministry, y.bethel == null ? '' : y.bethel ? 'Oui' : 'Non', y.is_core_team ? 'Oui' : '', fullName(youthById(y.leader_youth_id)) === '—' ? '' : fullName(youthById(y.leader_youth_id)), STATUS[y.status], presenceStats(y).rate ?? ''])]));
        if (t === 'att') { const ss = [...S.sessions].sort((a, b) => a.date.localeCompare(b.date)); download(`presences_${d}.csv`, csv([['Prénom', 'Nom', ...ss.map((s) => `${KIND_SHORT[s.kind]} ${s.date}`)], ...S.youth.map((y) => [y.first_name, y.last_name, ...ss.map((s) => { const a = attOf(s.id, y.id); return a ? (a.present ? 'P' : 'A') : ''; })])])); }
        if (t === 'fu') download(`suivis_${d}.csv`, csv([['Semaine', 'Jeune', 'Leader', 'Contacté', 'A répondu', 'Note'], ...[...S.followups].sort((a, b) => b.week_start.localeCompare(a.week_start)).map((f) => { const y = youthById(f.youth_id); return [f.week_start, fullName(y), y ? fullName(youthById(y.leader_youth_id)) : '', f.sent ? 'Oui' : 'Non', f.replied == null ? '' : f.replied ? 'Oui' : 'Non', f.note]; })]));
        if (t === 'rep') download(`rapports_${d}.csv`, csv([['Semaine', 'Leader', 'Contactés', 'Équipe', 'Résumé', 'Attention', 'Prière', 'Difficultés', 'Suggestions'], ...S.reports.map((r) => [r.week_start, profileById(r.author_id)?.full_name, r.contacted, r.team_size, r.summary, (r.attention_youth || []).map((id) => fullName(youthById(id))).join(', '), r.prayer, r.difficulties, r.suggestions])]));
        toast('Fichier téléchargé');
      });
    },
  };
}

/* ---------- AIDE ---------- */
function viewHelp() {
  const html = `<div class="card small"><h2>Comment ça marche</h2>
  <p><b>Présences</b> : ouvre la séance du jour (type + date), puis appuie sur <b>P</b> (présent) ou <b>A</b> (absent) pour chaque jeune. Appuie à nouveau pour effacer.</p>
  <p><b>Suivi</b> : chaque semaine (lundi → dimanche), envoie un message à chaque jeune de ton équipe (le bouton vert ouvre WhatsApp avec un message prêt), puis coche « Contacté ». Indique s'il a répondu.</p>
  <p><b>Rapport</b> : à la fin de la semaine, rédige ton rapport dans l'onglet Rapports. Le nombre de jeunes contactés est calculé automatiquement.</p>
  <p><b>Fiches</b> : touche un jeune pour voir ses infos, ses présences, son suivi et ajouter une note.</p>
  <p><b>À risque</b> : un jeune absent aux 3 dernières séances apparaît dans « À risque ». C'est la priorité de la semaine.</p>
  <p class="muted">Astuce : sur Android, menu du navigateur → « Ajouter à l'écran d'accueil » pour l'ouvrir comme une application.</p></div>`;
  return { title: 'Aide', back: true, html };
}

/* ---------- démarrage ---------- */
async function startSession(user) {
  S.user = user; S.loaded = false; render();
  try { await loadAll(); } catch (e) { toast(errMsg(e), true); S.loaded = true; S.me = S.me || { id: user.id, role: 'inactif', email: user.email }; }
  render();
}
(async function boot() {
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) await startSession(data.session.user); else render();
  } catch (e) { console.error(e); render(); }
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_OUT') { S.user = null; S.me = null; S.loaded = false; render(); } });
})();
