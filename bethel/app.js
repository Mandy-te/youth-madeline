/* Bethel TG Madeline – Suivi
   Suivi des Bethels (leader, assistant, membres) + dîmes et offrandes · Shekinah Tabernacle de Gloire, Madeline (Cap-Haïtien)
   Front statique + Supabase (auth, base de données, règles d'accès RLS). */
'use strict';

const SB_URL = 'https://sjwjhglremounuuwrreq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqd2poZ2xyZW1vdW51dXdycmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NDM2NzIsImV4cCI6MjEwOTExOTY3Mn0.72E5OuJlSrBWWf_OYlLdLiG6JLHRdd3N8_4fl8OfA78';
const sb = window.__MOCK_SB__ || window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- constantes ---------- */
const KINDS = { reunion: 'Réunion Bethel', priere: 'Prière', activite: 'Activité / sortie' };
const KIND_SHORT = { reunion: 'Réunion', priere: 'Prière', activite: 'Activité' };
const ROLES = { superadmin: 'Super Admin', coordinateur: 'Coordinateur des Bethels', pasteur: 'Pasteur (lecture)', leader: 'Leader de Bethel', assistant: 'Assistant(e) de Bethel', inactif: 'Inactif (aucun accès)' };
const FONCTIONS = { leader: 'Leader', assistant: 'Assistant(e)', membre: 'Membre' };
const STATUS = { actif: 'Actif', nouveau: 'Nouveau', inactif: 'Inactif' };
const CKINDS = { dime: 'Dîme', offrande: 'Offrande', grace: 'Action de grâce', speciale: 'Offrande spéciale' };
const METHODS = { cash: 'Espèces', moncash: 'MonCash', natcash: 'NatCash', banque: 'Banque', autre: 'Autre' };

/* ---------- état ---------- */
const S = { user: null, me: null, groups: [], members: [], profiles: [], sessions: [], attendance: [], followups: [], reports: [], contribs: [], resets: [], loaded: false };
const app = () => document.getElementById('app');

/* ---------- utilitaires ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return iso(x); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const curMonth = () => today().slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = (ym) => { const s = parseD(ym + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
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
const num = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ | /g, ' ');
const money = (n, cur = 'HTG') => `${num(n)} ${cur}`;
function sumBy(list) { const t = { HTG: 0, USD: 0 }; list.forEach((c) => { t[c.currency] = (t[c.currency] || 0) + Number(c.amount || 0); }); return t; }
const fmtTot = (t, zero = '0 HTG') => { const p = []; if (t.HTG) p.push(money(t.HTG, 'HTG')); if (t.USD) p.push(money(t.USD, 'USD')); return p.join(' + ') || zero; };
function genPassword() { const c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const arr = new Uint32Array(6); crypto.getRandomValues(arr); arr.forEach((v) => (s += c[v % c.length])); return 'Bethel-' + s; }
function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erreur');
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Pas de connexion internet. Réessaie.';
  if (/row-level security|permission denied/i.test(m)) return "Tu n'as pas l'autorisation de faire ça.";
  if (/duplicate key/i.test(m)) return 'Cet élément existe déjà.';
  if (/violates foreign key/i.test(m)) return 'Impossible : des données y sont encore liées (dîmes, membres…).';
  if (/should be different/i.test(m)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  return m;
}
let toastT;
function toast(msg, err = false) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), err ? 4200 : 2200); }
function q(sel, root = document) { return root.querySelector(sel); }
function qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function on(root, sel, ev, fn) { qa(sel, root).forEach((el) => el.addEventListener(ev, (e) => fn(e, el))); }
async function must(p) { const r = await p; if (r.error) throw r.error; return r.data; }
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
// Confirmation en deux appuis (pas de boîte de dialogue native)
function confirmInline(btn, label) {
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; return true; }
  btn.dataset.armed = '1'; btn.dataset.old = btn.textContent; btn.textContent = label; btn.disabled = false;
  setTimeout(() => { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = btn.dataset.old; } }, 5000);
  return false;
}

/* ---------- rôles et périmètre ---------- */
const role = () => S.me?.role || 'inactif';
const canReadAll = () => ['superadmin', 'pasteur', 'coordinateur'].includes(role());
const canEditAll = () => ['superadmin', 'coordinateur'].includes(role());
const isAdmin = canEditAll;
const isSuper = () => role() === 'superadmin';
const readOnly = () => role() === 'pasteur';
const isLeaderish = () => ['leader', 'assistant'].includes(role());
const canEditB = (bid) => canEditAll() || (isLeaderish() && !!bid && bid === S.me.bethel_id);
const groupById = (id) => S.groups.find((g) => g.id === id);
const memberById = (id) => S.members.find((m) => m.id === id);
const profileById = (id) => S.profiles.find((p) => p.id === id);
const groupsSorted = () => [...S.groups].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
function curB() {
  if (isLeaderish()) return S.me.bethel_id || 'none';
  if (S.groups.length === 1) return S.groups[0].id;
  const v = store.get('bethel.cur');
  return v && groupById(v) ? v : 'all';
}
const inScope = (bid) => curB() === 'all' || bid === curB();
const curGroup = () => groupById(curB());
const scopeMembers = (all = false) => S.members.filter((m) => inScope(m.bethel_id) && (all || m.status !== 'inactif'));
const scopeGroups = () => (curB() === 'all' ? groupsSorted() : [curGroup()].filter(Boolean));
const leaderOf = (bid) => S.members.find((m) => m.bethel_id === bid && m.fonction === 'leader' && m.status !== 'inactif');
const assistantOf = (bid) => S.members.find((m) => m.bethel_id === bid && m.fonction === 'assistant' && m.status !== 'inactif');
const myMemberId = () => S.me?.member_id || null;
const accountOfMember = (mid) => S.profiles.find((p) => p.member_id === mid && p.role !== 'inactif');
const editableGroups = () => groupsSorted().filter((g) => canEditB(g.id));
const bName = (bid) => groupById(bid)?.name || '—';

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
  const [me] = await must(sb.from('bethel_profiles').select('*').eq('id', S.user.id));
  S.me = me || { id: S.user.id, role: 'inactif', email: S.user.email };
  if (role() === 'inactif') { S.loaded = true; return; }
  const [groups, members, profiles, sessions, attendance, followups, reports, contribs] = await Promise.all([
    fetchAll('bethel_groups', ['name']), fetchAll('bethel_members', ['first_name']), fetchAll('bethel_profiles', ['full_name']),
    fetchAll('bethel_sessions', ['date', false]), fetchAll('bethel_attendance'), fetchAll('bethel_followups'),
    fetchAll('bethel_reports', ['week_start', false]), fetchAll('bethel_contributions', ['date', false]),
  ]);
  const resets = isAdmin() ? (await fetchAll('password_reset_requests', ['created_at'])).filter((r) => !r.handled_at && profiles.some((p) => p.id === r.user_id)) : [];
  Object.assign(S, { groups, members: members.sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr')), profiles, sessions, attendance, followups, reports, contribs, resets, loaded: true });
}

/* ---------- calculs ---------- */
const attOf = (sid, mid) => S.attendance.find((a) => a.session_id === sid && a.member_id === mid);
const sessionsSorted = () => [...S.sessions].sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)));
const scopeSessions = () => sessionsSorted().filter((s) => inScope(s.bethel_id));
function eligibleSessions(m) {
  const c = (m.created_at || '').slice(0, 10);
  return sessionsSorted().filter((s) => {
    if (s.bethel_id !== m.bethel_id) return false;
    const a = attOf(s.id, m.id);
    if (s.kind === 'activite' && !a) return false;
    return !c || s.date >= c || a;
  });
}
function presenceStats(m) {
  const ss = eligibleSessions(m); let p = 0, n = 0;
  ss.forEach((s) => { const a = attOf(s.id, m.id); if (a) { n++; if (a.present) p++; } });
  return { present: p, marked: n, rate: n ? pct(p, n) : null, total: ss.length };
}
function atRisk(m) {
  if (m.status === 'inactif') return false;
  const ss = eligibleSessions(m).slice(0, 3);
  if (ss.length < 3) return false;
  return ss.every((s) => !attOf(s.id, m.id)?.present);
}
function missingFields(m) { const x = []; if (!m.last_name) x.push('nom'); if (!digits(m.phone)) x.push('téléphone'); if (!m.birth_date) x.push('date de naissance'); return x; }
function upcomingBirthdays(list, days = 30) {
  const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return list.filter((y) => y.birth_date).map((y) => {
    const b = parseD(y.birth_date); let nx = new Date(t0.getFullYear(), b.getMonth(), b.getDate());
    if (nx < t0) nx = new Date(t0.getFullYear() + 1, b.getMonth(), b.getDate());
    return { y, nx, d: Math.round((nx - t0) / 864e5) };
  }).filter((x) => x.d <= days).sort((a, b) => a.d - b.d);
}
const fuOf = (mid, ws) => S.followups.find((f) => f.member_id === mid && f.week_start === ws);
function followStats(list, ws) { const sent = list.filter((m) => fuOf(m.id, ws)?.sent).length; return { sent, n: list.length, p: pct(sent, list.length) }; }
const reportOf = (bid, ws) => S.reports.find((r) => r.bethel_id === bid && r.week_start === ws);
function presenceRate(bid, n = 4) {
  const ss = S.sessions.filter((s) => s.bethel_id === bid && s.kind === 'reunion').sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  let p = 0, t = 0;
  ss.forEach((s) => { const rows = S.attendance.filter((a) => a.session_id === s.id); t += rows.length; p += rows.filter((a) => a.present).length; });
  return t ? pct(p, t) : null;
}
const presentCount = (sid) => S.attendance.filter((a) => a.session_id === sid && a.present).length;
const contribsIn = (from, to, bid = null) => S.contribs.filter((c) => c.date >= from && c.date <= to && (bid ? c.bethel_id === bid : inScope(c.bethel_id)));
const monthContribs = (ym, bid) => contribsIn(ym + '-01', ym + '-31', bid);
const pending = (bid = null) => S.contribs.filter((c) => !c.remitted_at && (bid ? c.bethel_id === bid : inScope(c.bethel_id)));
const tithersOf = (list) => new Set(list.filter((c) => c.kind === 'dime' && c.member_id).map((c) => c.member_id));

/* ---------- icônes ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.4 3.4-5.5 6.5-5.5s5.8 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 13.5l2.5 2.5L16 11"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.8A8 8 0 1 1 21 12z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
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

function scopeLabel() {
  if (canReadAll() && S.groups.length > 1) {
    const cur = curB();
    return `<select class="bp" id="bpick" aria-label="Choisir le Bethel"><option value="all" ${cur === 'all' ? 'selected' : ''}>Tous les Bethels ▾</option>${groupsSorted().map((g) => `<option value="${g.id}" ${cur === g.id ? 'selected' : ''}>${esc(g.name)} ▾</option>`).join('')}</select>`;
  }
  return `<small>${esc(curGroup()?.name || 'Bethel TG Madeline')}</small>`;
}
function shell(title, body, opts = {}) {
  const r = route().name;
  const tab = (href, key, icon, label) => `<a href="${href}" class="${key.includes(r) ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return `
  <header class="top">
    ${opts.back ? `<button data-back aria-label="Retour">${I.back}</button>` : ''}
    <div class="ttl">${scopeLabel()}<b>${esc(title)}</b></div>
    <button data-refresh aria-label="Actualiser">${I.refresh}</button>
    <button data-menu aria-label="Menu">${I.menu}</button>
  </header>
  <main class="main">${body}</main>
  <nav class="nav">
    ${tab('#/', ['', 'accueil'], I.home, 'Accueil')}
    ${tab('#/membres', ['membres', 'membre'], I.users, 'Membres')}
    ${tab('#/presences', ['presences', 'presence'], I.check, 'Présences')}
    ${tab('#/dimes', ['dimes', 'don'], I.coin, 'Dîmes')}
    ${tab('#/suivi', ['suivi', 'rapports', 'rapport'], I.msg, 'Suivi')}
  </nav>
  ${menuOpen ? menuHtml() : ''}`;
}
function menuHtml() {
  const m = memberById(myMemberId());
  return `<div class="menu" data-close-menu><div class="sheet" onclick="event.stopPropagation()">
    <div class="who"><b>${esc(S.me.full_name || S.me.email)}</b><div class="small muted">${esc(ROLES[role()])}${S.me.bethel_id ? ' · ' + esc(bName(S.me.bethel_id)) : ''}${m ? '<br>fiche : ' + esc(fullName(m)) : ''}</div></div>
    <a href="#/compte">Mon compte</a>
    <a href="#/rapports">Rapports hebdomadaires</a>
    <a href="#/bethels">${canEditAll() ? 'Gérer les Bethels' : 'Mon Bethel'}</a>
    ${isAdmin() ? '<a href="#/comptes">Comptes et rôles</a>' : ''}
    <a href="#/export">Exporter (CSV)</a>
    <a href="#/aide">Aide</a>
    <a href="../">↗ App Youth Madeline</a>
    <div class="grow"></div>
    <button class="item" data-logout style="color:var(--bad)">Se déconnecter</button>
  </div></div>`;
}
function bindShell(root) {
  on(root, '[data-menu]', 'click', () => { menuOpen = true; render(); });
  on(root, '[data-close-menu]', 'click', () => { menuOpen = false; render(); });
  on(root, '[data-back]', 'click', () => (history.length > 1 ? history.back() : go('#/')));
  on(root, '[data-refresh]', 'click', async () => { try { await loadAll(); render(); toast('Données à jour'); } catch (e) { toast(errMsg(e), true); } });
  on(root, '[data-logout]', 'click', async () => { await sb.auth.signOut(); S.user = null; S.me = null; location.hash = '#/'; render(); });
  const bp = q('#bpick', root); if (bp) bp.addEventListener('change', () => { store.set('bethel.cur', bp.value); render(); });
}

/* ---------- rendu principal ---------- */
async function render() {
  const root = app();
  if (!S.user) return renderLogin(root);
  if (!S.loaded) { root.innerHTML = '<div class="splash"><div class="logo">BT</div><p>Chargement des données…</p></div>'; return; }
  if (role() === 'inactif') return renderInactive(root);
  if (S.me.must_change_password) return renderForcePassword(root);
  const r = route(); const p = r.parts;
  let v;
  try {
    switch (r.name) {
      case '': case 'accueil': v = viewHome(); break;
      case 'membres': v = viewMemberList(r.params); break;
      case 'membre': v = p[1] === 'nouveau' ? viewMemberForm(null, r.params) : p[2] === 'modifier' ? viewMemberForm(p[1], r.params) : viewMemberDetail(p[1]); break;
      case 'presences': v = viewSessions(r.params); break;
      case 'presence': v = viewSession(p[1], r.params); break;
      case 'dimes': v = viewFinance(r.params); break;
      case 'don': v = p[1] === 'nouveau' ? viewContribForm(null, r.params) : viewContribForm(p[1], r.params); break;
      case 'suivi': v = viewFollow(r.params); break;
      case 'rapports': v = viewReports(r.params); break;
      case 'rapport': v = p[1] === 'nouveau' ? viewReportForm(r.params) : viewReportDetail(p[1]); break;
      case 'bethels': v = viewGroups(r.params); break;
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
    <div class="logo">BT</div><h1>Bethel TG Madeline</h1><p class="c">Suivi des Bethels · dîmes et offrandes</p>
    <label class="f"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
    <label class="f"><span>Mot de passe</span><input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn full" type="submit">Se connecter</button>
    <p class="small" style="text-align:center;margin:14px 0 0"><a href="#" id="forgot">Mot de passe oublié ?</a></p>
    <p class="small muted" style="text-align:center;margin:6px 0 0">Même compte que l'app Youth si tu en as un.<br>Pas de compte ? Demande au responsable des Bethels.</p>
  </form></div>`;
  q('#forgot').addEventListener('click', (e) => { e.preventDefault(); renderForgot(root, q('#lf').email.value); });
  q('#lf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const b = q('button', f); b.disabled = true; b.textContent = 'Connexion…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.password.value });
      if (error) throw error;
      await startSession(data.user);
    } catch (err) { toast(errMsg(err), true); b.disabled = false; b.textContent = 'Se connecter'; }
  });
}
/* ---------- mot de passe oublié (demande validée par un responsable, envoi par WhatsApp) ---------- */
function renderForgot(root, email = '') {
  root.innerHTML = `<div class="login"><form class="box" id="ff">
    <div class="logo">BT</div><h1>Mot de passe oublié</h1>
    <p class="c">Entre l'email de ton compte. Un responsable va te renvoyer un mot de passe provisoire par WhatsApp.</p>
    <label class="f"><span>Email du compte</span><input type="email" name="email" value="${esc(email)}" autocomplete="username" required></label>
    <label class="f"><span>Ton numéro WhatsApp</span><input type="tel" name="phone" inputmode="numeric" placeholder="ex. 31324336" required></label>
    <button class="btn full" type="submit">Envoyer la demande</button>
    <button class="btn full light" type="button" id="bk" style="margin-top:8px">Retour à la connexion</button>
  </form></div>`;
  q('#bk').addEventListener('click', () => renderLogin(root));
  q('#ff').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const b = q('button[type=submit]', f); b.disabled = true;
    try {
      await must(sb.rpc('request_password_reset', { p_email: f.email.value.trim().toLowerCase(), p_phone: f.phone.value, p_app: 'bethel' }));
      const msg = encodeURIComponent(`Bonjour, j'ai oublié mon mot de passe de l'app Bethel TG Madeline. Mon email : ${f.email.value.trim()}. J'ai fait la demande dans l'app. Merci !`);
      root.innerHTML = `<div class="login"><div class="box"><div class="logo">BT</div><h1>Demande envoyée ✅</h1>
        <p class="c">Si un compte existe avec cet email, la demande apparaît chez les responsables. Tu recevras un mot de passe provisoire sur WhatsApp, puis tu choisiras le tien à la connexion. (Il sert aussi pour l'app Youth.)</p>
        <a class="btn ok full" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">${I.wa} Prévenir le responsable sur WhatsApp</a>
        <button class="btn full light" id="bk2" style="margin-top:8px">Retour à la connexion</button></div></div>`;
      q('#bk2').addEventListener('click', () => renderLogin(root));
    } catch (err) { toast(errMsg(err), true); b.disabled = false; }
  });
}
function resetPhone(r) { const p = profileById(r.user_id); return r.phone || memberById(p?.member_id)?.phone || ''; }
function resetRequestsCard() {
  if (!isAdmin() || !S.resets.length) return '';
  return `<div class="card" style="border:2px solid var(--warn-soft)"><h2>🔑 Mot de passe oublié <span class="b warn">${S.resets.length}</span></h2>
    ${S.resets.map((r) => { const p = profileById(r.user_id); const ph = resetPhone(r);
      return `<div class="row" style="margin:10px 0" data-rr="${r.id}"><div class="grow" style="min-width:0"><b>${esc(p?.full_name || r.email)}</b><div class="tiny muted">${esc(r.email)}${p?.bethel_id ? ' · ' + esc(bName(p.bethel_id)) : ''} · ${esc(ph ? fmtPhone(ph) : 'pas de numéro')} · ${new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
      <button class="btn sm" data-rr-go>Nouveau mot de passe</button><button class="btn light sm" data-rr-x aria-label="Ignorer">✕</button></div>`; }).join('')}
    <div class="tiny muted">Vérifie que la demande vient bien de la personne (appel ou WhatsApp) avant d'envoyer le nouveau mot de passe. Il change aussi pour l'app Youth.</div></div>`;
}
function bindResetRequests(root) {
  on(root, '[data-rr-go]', 'click', async (e, el) => {
    const r = S.resets.find((x) => x.id === el.closest('[data-rr]').dataset.rr);
    if (!confirmInline(el, 'Appuie encore pour confirmer')) return;
    el.disabled = true; const pw = genPassword();
    try { await must(sb.rpc('b_admin_reset_password', { p_user_id: r.user_id, p_password: pw })); lastCred = { email: r.email, password: pw, phone: resetPhone(r) }; S.resets = S.resets.filter((x) => x.user_id !== r.user_id); toast('Mot de passe réinitialisé : envoie-le par WhatsApp'); go('#/comptes'); window.scrollTo(0, 0); }
    catch (err) { toast(errMsg(err), true); el.disabled = false; }
  });
  on(root, '[data-rr-x]', 'click', async (e, el) => {
    const id = el.closest('[data-rr]').dataset.rr;
    if (!confirmInline(el, 'Ignorer ?')) return;
    try { await must(sb.from('password_reset_requests').update({ handled_at: new Date().toISOString(), handled_by: S.me.id }).eq('id', id)); S.resets = S.resets.filter((x) => x.id !== id); toast('Demande ignorée'); render(); } catch (err) { toast(errMsg(err), true); }
  });
}

function renderInactive(root) {
  root.innerHTML = `<div class="login"><div class="box"><div class="logo">BT</div><h1>Pas d'accès aux Bethels</h1>
  <p class="c">Ton compte (${esc(S.user.email)}) n'a pas encore accès à l'app Bethel. Demande au responsable des Bethels de te l'ouvrir.</p>
  <a class="btn full ghost" href="../" style="margin-bottom:8px">Aller à l'app Youth</a>
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
  await must(sb.rpc('b_password_changed'));
  S.me.must_change_password = false;
}
function renderForcePassword(root) {
  root.innerHTML = `<div class="login"><div class="box"><div class="logo">BT</div><h1>Bienvenue ${esc((S.me.full_name || '').split(' ')[0])}</h1>
  <p class="c">Choisis ton propre mot de passe avant de continuer.</p>${passwordForm('pf')}</div></div>`;
  q('#pf').addEventListener('submit', async (e) => { e.preventDefault(); try { await submitPassword(e.target); toast('Mot de passe enregistré'); render(); } catch (err) { toast(errMsg(err), true); } });
}

/* ---------- ACCUEIL ---------- */
const mLine = (m, right = '') => `<a class="row small" style="margin:7px 0;color:inherit" href="#/membre/${m.id}"><span class="av" style="width:30px;height:30px;font-size:.72rem">${esc(initials(m))}</span><span class="grow">${esc(fullName(m))}${curB() === 'all' ? ` <span class="muted">· ${esc(bName(m.bethel_id))}</span>` : ''}</span><span class="muted">${right || esc(fmtPhone(m.phone))}</span></a>`;
const bdayMsg = (m) => encodeURIComponent(`Joyeux anniversaire ${m.first_name} ! 🎉🎂 Toute la famille du Bethel ${bName(m.bethel_id)} te souhaite une belle journée. Que Dieu te bénisse abondamment cette nouvelle année ! 🙏`);
function viewHome() {
  const ws = weekStart();
  const first = (S.me.full_name || '').split(' ')[0];
  let html = `<div style="margin:2px 4px 12px"><h1>Bonjour ${esc(first)} 👋</h1><div class="small muted">${esc(ROLES[role()])} · semaine ${esc(weekLabel(ws))}</div></div>`;
  if (!S.groups.length) {
    html += canEditAll() ? `<div class="card"><h2>Bienvenue dans l'app Bethel</h2><p class="small">Commence par créer les Bethels (nom, zone, jour de réunion), puis ajoute leurs membres, le leader et l'assistant.</p><a class="btn full" href="#/bethels?new=1">Créer le premier Bethel</a></div>`
      : `<div class="alert warn">Aucun Bethel n'est encore accessible pour ton compte. Demande au responsable de te rattacher à ton Bethel.</div>`;
    return { title: 'Accueil', html };
  }
  if (isLeaderish() && !curGroup()) return { title: 'Accueil', html: html + `<div class="alert warn">Ton compte n'est rattaché à aucun Bethel. Demande au responsable de corriger.</div>` };
  if (isAdmin() && S.resets.length) html += `<div class="alert warn"><a href="#/comptes" style="color:inherit">🔑 <b>${S.resets.length} demande(s) de mot de passe oublié</b> → traiter</a></div>`;
  html += homeAlerts();
  html += curB() === 'all' ? homeAll(ws) : homeBethel(curGroup(), ws);
  return { title: 'Accueil', html };
}
function homeBethel(g, ws) {
  const list = scopeMembers();
  const fs = followStats(list, ws);
  const rep = reportOf(g.id, ws);
  const pr = presenceRate(g.id);
  const ym = curMonth(); const mc = monthContribs(ym, g.id);
  const tithers = tithersOf(mc);
  const pend = pending(g.id);
  const risk = list.filter(atRisk);
  const ld = leaderOf(g.id), as = assistantOf(g.id);
  const last = S.sessions.filter((s) => s.bethel_id === g.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const edit = canEditB(g.id) && !readOnly();
  return `<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">${esc(g.name)}</h2><div class="small muted">${[g.zone, [g.meeting_day, g.meeting_time].filter(Boolean).join(' à ')].filter(Boolean).map(esc).join(' · ') || '<a href="#/bethels">Compléter les infos du Bethel</a>'}</div></div></div>
    <div class="small" style="margin-top:8px">Leader : <b>${ld ? `<a href="#/membre/${ld.id}">${esc(fullName(ld))}</a>` : '<span style="color:var(--warn)">à définir</span>'}</b> · Assistant(e) : <b>${as ? `<a href="#/membre/${as.id}">${esc(fullName(as))}</a>` : '<span style="color:var(--warn)">à définir</span>'}</b></div></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${list.length}</div><div class="l">membres actifs</div><div class="s">${list.filter((m) => m.status === 'nouveau').length} nouveaux</div></div>
    <div class="kpi"><div class="v">${fs.sent}/${fs.n}</div><div class="l">contactés cette semaine</div><div class="prog" style="margin-top:6px"><i style="width:${fs.p}%"></i></div></div>
    <div class="kpi"><div class="v">${pr ?? '—'}${pr != null ? '%' : ''}</div><div class="l">présence (4 dernières réunions)</div><div class="s">${last ? `dernière : ${presentCount(last.id)} présents` : 'aucune réunion'}</div></div>
    <div class="kpi"><div class="v">${rep ? '✅' : '⏳'}</div><div class="l">${rep ? 'rapport soumis' : 'rapport à faire'}</div></div>
  </div>
  <div class="btns" style="margin-bottom:12px">${edit ? '<a class="btn" href="#/suivi">Faire le suivi</a>' : ''}${edit && !rep ? '<a class="btn ghost" href="#/rapport/nouveau">Écrire le rapport</a>' : ''}</div>
  <div class="card"><h2>Dîmes et offrandes · ${esc(monthLabel(ym))}</h2>
    <div class="tot">${Object.keys(CKINDS).map((k) => { const t = sumBy(mc.filter((c) => c.kind === k)); return t.HTG || t.USD ? `<span>${CKINDS[k]}</span><span class="money">${fmtTot(t)}</span>` : ''; }).join('') || '<span class="muted">Rien enregistré ce mois</span><span></span>'}
    ${mc.length ? `<b>Total du mois</b><span class="money">${fmtTot(sumBy(mc))}</span>` : ''}</div>
    <div class="small muted" style="margin-top:8px">${tithers.size}/${list.length} membres ont donné leur dîme ce mois.</div>
    ${pend.length ? `<div class="alert warn" style="margin:10px 0 0"><a href="#/dimes?v=nonremis" style="color:inherit"><b>${fmtTot(sumBy(pend))}</b> pas encore remis à l'église (${pend.length} entrée${pend.length > 1 ? 's' : ''}) →</a></div>` : ''}
    ${edit ? '<a class="btn full" style="margin-top:10px" href="#/don/nouveau">+ Enregistrer une dîme / offrande</a>' : ''}
  </div>
  ${risk.length ? `<div class="card"><h2>À relancer <span class="b bad">${risk.length}</span></h2><div class="small muted" style="margin:-4px 0 8px">Absents aux 3 dernières rencontres</div>${risk.map((m) => mLine(m)).join('')}</div>` : ''}`;
}
function homeAll(ws) {
  const ym = curMonth();
  const all = scopeMembers();
  const mcAll = monthContribs(ym);
  const rows = groupsSorted().map((g) => {
    const list = all.filter((m) => m.bethel_id === g.id);
    return { g, list, fs: followStats(list, ws), pr: presenceRate(g.id), rep: reportOf(g.id, ws), mc: mcAll.filter((c) => c.bethel_id === g.id), ld: leaderOf(g.id) };
  });
  const fsAll = followStats(all, ws);
  const repDone = rows.filter((r) => r.rep).length;
  const pend = pending();
  const risk = all.filter(atRisk);
  const noLead = rows.filter((r) => !r.ld);
  return `<div class="kpis">
    <div class="kpi"><div class="v">${S.groups.length}</div><div class="l">Bethels</div><div class="s">${all.length} membres actifs</div></div>
    <div class="kpi"><div class="v">${fsAll.p}%</div><div class="l">membres suivis cette semaine</div><div class="s">${fsAll.sent}/${fsAll.n}</div></div>
    <div class="kpi"><div class="v">${repDone}/${rows.length}</div><div class="l">rapports de la semaine</div></div>
    <div class="kpi"><div class="v" style="font-size:1.05rem">${esc(fmtTot(sumBy(mcAll)))}</div><div class="l">collecté en ${esc(monthLabel(ym).toLowerCase())}</div><div class="s">dont dîmes : ${esc(fmtTot(sumBy(mcAll.filter((c) => c.kind === 'dime'))))}</div></div>
  </div>
  <div class="card"><h2>Les Bethels</h2>
    <table class="t"><tr><th>Bethel</th><th>Memb.</th><th>Suivi</th><th>Prés.</th><th>Rapp.</th><th>Mois</th></tr>
    ${rows.map((r) => `<tr><td><a href="#" data-pick="${r.g.id}">${esc(r.g.name)}</a>${r.ld ? '' : ' <span class="b warn">sans leader</span>'}</td><td>${r.list.length}</td><td><span class="b ${r.fs.p >= 80 ? 'ok' : r.fs.p >= 40 ? 'warn' : 'bad'}">${r.fs.sent}/${r.fs.n}</span></td><td>${r.pr ?? '—'}${r.pr != null ? '%' : ''}</td><td>${r.rep ? '<span class="b ok">✓</span>' : '<span class="b bad">✗</span>'}</td><td class="money small">${num(sumBy(r.mc).HTG)}</td></tr>`).join('')}</table>
    <div class="tiny muted" style="margin-top:6px">« Mois » = total HTG reçu ce mois. Touche un Bethel pour l'ouvrir.</div>
    ${noLead.length && canEditAll() ? `<div class="alert warn" style="margin:10px 0 0">${noLead.length} Bethel(s) sans leader désigné : ouvre un membre → Modifier → Fonction « Leader ».</div>` : ''}
  </div>
  ${pend.length ? `<div class="alert warn"><a href="#/dimes?v=nonremis" style="color:inherit"><b>${esc(fmtTot(sumBy(pend)))}</b> pas encore remis à l'église, tous Bethels confondus →</a></div>` : ''}
  ${risk.length ? `<div class="card"><h2>À relancer <span class="b bad">${risk.length}</span></h2><div class="small muted" style="margin:-4px 0 6px">Absents aux 3 dernières rencontres</div>${risk.map((m) => mLine(m)).join('')}</div>` : ''}`;
}
function homeAlerts() {
  let out = '';
  const bd = upcomingBirthdays(scopeMembers(), 7);
  if (bd.length) {
    out += `<div class="card" style="border:2px solid var(--acc-soft)"><h2>🎂 Anniversaires ${bd.some((x) => x.d === 0) ? "aujourd'hui et cette semaine" : 'cette semaine'}</h2>
    ${bd.map((x) => `<div class="row" style="margin:8px 0"><a class="grow" href="#/membre/${x.y.id}" style="color:inherit;min-width:0"><b>${esc(fullName(x.y))}</b><div class="tiny muted">${x.d === 0 ? "<b style='color:var(--acc)'>AUJOURD'HUI</b>" : x.d === 1 ? 'demain' : 'dans ' + x.d + ' jours'} · ${esc(fmtD(iso(x.nx), { weekday: 'long', day: 'numeric', month: 'long' }))} · ${age(x.y.birth_date) + (x.d === 0 ? 0 : 1)} ans${curB() === 'all' ? ' · ' + esc(bName(x.y.bethel_id)) : ''}</div></a>
    ${digits(x.y.phone) ? `<a class="btn ok sm" href="https://wa.me/${intlPhone(x.y.phone)}?text=${bdayMsg(x.y)}" target="_blank" rel="noopener">${I.wa} Souhaiter</a>` : ''}</div>`).join('')}</div>`;
  }
  const noDob = scopeMembers().filter((m) => !m.birth_date).length;
  if (noDob && !readOnly() && scopeMembers().length) out += `<div class="alert info"><a href="#/membres?f=incomplet" style="color:inherit">🎂 <b>${noDob} membre(s) sans date de naissance</b> : complète leur fiche pour recevoir les rappels d'anniversaire.</a></div>`;
  return out;
}

/* ---------- MEMBRES : liste ---------- */
function viewMemberList(params) {
  const f = params.f || 'tous';
  const qv = params.q || '';
  let list = scopeMembers(true);
  if (f === 'risque') list = list.filter(atRisk);
  if (f === 'nouveaux') list = list.filter((m) => m.status === 'nouveau');
  if (f === 'incomplet') list = list.filter((m) => missingFields(m).length);
  if (f === 'mes') list = list.filter((m) => m.followed_by === myMemberId());
  if (f === 'inactifs') list = list.filter((m) => m.status === 'inactif'); else list = list.filter((m) => m.status !== 'inactif');
  if (qv) { const n = norm(qv), d = digits(qv); list = list.filter((m) => norm(fullName(m)).includes(n) || (d && digits(m.phone).includes(d))); }
  const order = { leader: 0, assistant: 1, membre: 2 };
  list.sort((a, b) => (order[a.fonction] - order[b.fonction]) || fullName(a).localeCompare(fullName(b), 'fr'));
  const canAdd = !readOnly() && (curB() === 'all' ? editableGroups().length > 0 : canEditB(curB()));
  const chip = (k, l) => `<button class="chip ${f === k ? 'on' : ''}" data-f="${k}">${l}</button>`;
  const html = `
  <input type="search" class="search" id="qs" placeholder="Rechercher un nom ou un numéro…" value="${esc(qv)}">
  <div class="chips">${chip('tous', 'Tous')}${myMemberId() && S.members.some((m) => m.followed_by === myMemberId()) ? chip('mes', 'Mes suivis') : ''}${chip('risque', 'À risque')}${chip('nouveaux', 'Nouveaux')}${chip('incomplet', 'Incomplètes')}${chip('inactifs', 'Inactifs')}</div>
  <div class="row" style="margin:0 4px 8px"><span class="small muted grow">${list.length} membre${list.length > 1 ? 's' : ''}</span>${canAdd ? '<a class="btn sm" href="#/membre/nouveau">+ Ajouter</a>' : ''}</div>
  <div class="list">${list.length ? list.map((m) => {
    const st = presenceStats(m); const miss = missingFields(m);
    return `<a class="li" href="#/membre/${m.id}"><span class="av ${m.fonction !== 'membre' ? 'core' : ''}">${esc(initials(m))}</span>
      <span class="grow"><div class="nm">${esc(fullName(m))} ${m.fonction !== 'membre' ? `<span class="b acc">${FONCTIONS[m.fonction]}</span>` : ''}${m.status === 'nouveau' ? ' <span class="b pri">nouveau</span>' : ''}</div>
      <div class="sub">${curB() === 'all' ? esc(bName(m.bethel_id)) + ' · ' : ''}${esc(fmtPhone(m.phone)) || 'pas de numéro'}${miss.length ? ' · <span style="color:var(--warn)">incomplète</span>' : ''}</div></span>
      <span class="b ${st.rate == null ? '' : st.rate >= 60 ? 'ok' : st.rate >= 30 ? 'warn' : 'bad'}">${st.rate == null ? '—' : st.rate + '%'}</span></a>`;
  }).join('') : `<div class="empty">${S.members.length ? 'Aucun membre ici.' : 'Aucun membre pour le moment.'}</div>`}</div>`;
  return {
    title: 'Membres', html,
    bind(root) {
      const set = (k, v) => { const p = { f, q: qv, [k]: v }; Object.keys(p).forEach((x) => !p[x] && delete p[x]); location.hash = '#/membres?' + new URLSearchParams(p).toString(); };
      on(root, '[data-f]', 'click', (e, el) => set('f', el.dataset.f));
      const qs = q('#qs', root); let t;
      qs.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', '#/membres?' + new URLSearchParams({ ...(f ? { f } : {}), ...(qs.value ? { q: qs.value } : {}) })); const pos = qs.selectionStart; render(); const n = q('#qs'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
    },
  };
}

/* ---------- MEMBRE : fiche ---------- */
function contribRow(c, showMember = true) {
  const m = memberById(c.member_id);
  return `<a class="li" href="#/don/${c.id}"><span class="grow"><div class="nm"><span class="b ${c.kind}">${CKINDS[c.kind]}</span> ${showMember ? (m ? esc(fullName(m)) : '<span class="muted">Collecte / anonyme</span>') : ''}</div>
    <div class="sub">${esc(fmtD(c.date, { day: 'numeric', month: 'short', year: 'numeric' }))} · ${METHODS[c.method]}${curB() === 'all' ? ' · ' + esc(bName(c.bethel_id)) : ''}${c.note ? ' · ' + esc(c.note) : ''}</div></span>
    <span style="text-align:right"><span class="money">${esc(money(c.amount, c.currency))}</span><br>${c.remitted_at ? '<span class="b ok">remis</span>' : '<span class="b warn">à remettre</span>'}</span></a>`;
}
function viewMemberDetail(id) {
  const m = memberById(id);
  if (!m) return { title: 'Membre', back: true, html: '<div class="empty">Fiche introuvable ou non accessible.</div>' };
  const st = presenceStats(m); const miss = missingFields(m);
  const edit = canEditB(m.bethel_id) && !readOnly();
  const ss = eligibleSessions(m);
  const fus = S.followups.filter((f) => f.member_id === m.id).sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 8);
  const yr = today().slice(0, 4);
  const cs = S.contribs.filter((c) => c.member_id === m.id).sort((a, b) => b.date.localeCompare(a.date));
  const csY = cs.filter((c) => c.date.startsWith(yr));
  const months = new Set(csY.filter((c) => c.kind === 'dime').map((c) => c.date.slice(0, 7)));
  const fb = memberById(m.followed_by);
  const acc = accountOfMember(m.id);
  const html = `
  <div class="card"><div class="hero"><span class="av ${m.fonction !== 'membre' ? 'core' : ''}">${esc(initials(m))}</span>
    <div class="grow"><h1>${esc(fullName(m))}</h1><div class="small muted">${FONCTIONS[m.fonction]} · ${esc(bName(m.bethel_id))} · ${esc(STATUS[m.status])}${age(m.birth_date) != null ? ' · ' + age(m.birth_date) + ' ans' : ''}</div></div></div>
    ${digits(m.phone) ? `<div class="btns"><a class="btn ok sm" href="https://wa.me/${intlPhone(m.phone)}" target="_blank" rel="noopener">${I.wa} WhatsApp</a><a class="btn ghost sm" href="tel:+${intlPhone(m.phone)}">${I.phone} Appeler</a></div>` : ''}
  </div>
  ${miss.length ? `<div class="alert warn">Fiche incomplète : ${esc(miss.join(', '))}.</div>` : ''}
  <div class="card"><h2>Informations ${edit ? `<a class="btn sm ghost" href="#/membre/${m.id}/modifier">Modifier</a>` : ''}</h2>
  <dl class="kv">
    <dt>Téléphone</dt><dd>${esc(fmtPhone(m.phone)) || '—'}</dd>
    <dt>Email</dt><dd>${esc(m.email) || '—'}</dd>
    <dt>Adresse</dt><dd>${esc(m.address) || '—'}</dd>
    <dt>Naissance</dt><dd>${m.birth_date ? esc(fmtLong(m.birth_date)) : '—'}</dd>
    <dt>Sexe</dt><dd>${m.gender === 'H' ? 'Homme' : m.gender === 'F' ? 'Femme' : '—'}</dd>
    <dt>Baptisé(e)</dt><dd>${m.baptized == null ? '—' : m.baptized ? 'Oui' : 'Non'}</dd>
    <dt>Suivi par</dt><dd>${fb ? esc(fullName(fb)) : 'Leader et assistant'}</dd>
    ${m.fonction !== 'membre' ? `<dt>Compte app</dt><dd>${acc ? esc(ROLES[acc.role]) : '<span style="color:var(--warn)">pas de compte</span>'}</dd>` : ''}
    <dt>Ajouté le</dt><dd>${esc(fmtLong((m.created_at || '').slice(0, 10)))}</dd>
  </dl></div>
  <div class="card"><h2>Dîmes et offrandes ${yr}</h2>
    <div class="tot">${Object.keys(CKINDS).map((k) => { const t = sumBy(csY.filter((c) => c.kind === k)); return t.HTG || t.USD ? `<span>${CKINDS[k]}</span><span class="money">${fmtTot(t)}</span>` : ''; }).join('') || '<span class="muted">Rien enregistré cette année</span><span></span>'}</div>
    <div class="small muted" style="margin-top:8px">Dîme donnée ${months.size} mois sur ${Number(today().slice(5, 7))} cette année.</div>
    ${cs.length ? `<div class="list" style="margin-top:10px">${cs.slice(0, 8).map((c) => contribRow(c, false)).join('')}</div>` : ''}
    ${edit ? `<a class="btn full" style="margin-top:10px" href="#/don/nouveau?m=${m.id}">+ Enregistrer pour ${esc(m.first_name)}</a>` : ''}
  </div>
  <div class="card"><h2>Présences <span class="b ${st.rate == null ? '' : st.rate >= 60 ? 'ok' : st.rate >= 30 ? 'warn' : 'bad'}">${st.present}/${st.marked}${st.rate != null ? ' · ' + st.rate + '%' : ''}</span></h2>
    ${ss.length ? `<div class="hist">${ss.map((s) => { const a = attOf(s.id, m.id); return `<a class="dot ${a ? (a.present ? 'p' : 'a') : ''}" href="#/presence/${s.id}">${a ? (a.present ? '✓' : '✗') : '·'} ${esc(KIND_SHORT[s.kind])} ${esc(fmtD(s.date, { day: 'numeric', month: 'short' }))}</a>`; }).join('')}</div>` : '<div class="muted small">Aucune rencontre.</div>'}
  </div>
  <div class="card"><h2>Suivi hebdomadaire</h2>
    ${fus.length ? fus.map((f) => `<div class="row small" style="margin:6px 0"><span class="grow">Semaine ${esc(weekLabel(f.week_start))}</span>${f.sent ? '<span class="b ok">contacté</span>' : '<span class="b">non</span>'}${f.replied === true ? ' <span class="b ok">a répondu</span>' : f.replied === false ? ' <span class="b bad">pas de réponse</span>' : ''}</div>${f.note ? `<div class="small muted" style="margin:-2px 0 6px">${esc(f.note)}</div>` : ''}`).join('') : '<div class="muted small">Aucun suivi enregistré.</div>'}
  </div>
  <div class="card"><h2>Notes de suivi</h2><div id="notes"><div class="muted small">Chargement…</div></div>
    ${edit ? `<form id="nf" style="margin-top:10px"><textarea name="body" placeholder="Ajouter une note (visite, besoin, prière, situation…)" required></textarea><button class="btn sm" style="margin-top:8px">Ajouter la note</button></form>` : ''}
  </div>`;
  return {
    title: m.first_name, back: true, html,
    async bind(root) {
      const box = q('#notes', root);
      const load = async () => {
        try {
          const notes = await must(sb.from('bethel_notes').select('*').eq('member_id', m.id).order('created_at', { ascending: false }));
          box.innerHTML = notes.length ? notes.map((n) => `<div class="note"><div class="small">${esc(n.body).replace(/\n/g, '<br>')}</div><div class="tiny muted">${esc(profileById(n.author_id)?.full_name || '—')} · ${new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div></div>`).join('') : '<div class="muted small">Aucune note.</div>';
        } catch (e) { box.innerHTML = `<div class="small" style="color:var(--bad)">${esc(errMsg(e))}</div>`; }
      };
      load();
      const nf = q('#nf', root);
      if (nf) nf.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button', nf); b.disabled = true;
        try { await must(sb.from('bethel_notes').insert({ member_id: m.id, author_id: S.me.id, body: nf.body.value.trim() })); nf.reset(); toast('Note ajoutée'); load(); } catch (err) { toast(errMsg(err), true); }
        b.disabled = false;
      });
    },
  };
}

/* ---------- MEMBRE : formulaire ---------- */
const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
function bethelSelect(name, cur, groups = editableGroups()) {
  if (groups.length === 1) return `<input type="hidden" name="${name}" value="${groups[0].id}">`;
  return `<label class="f"><span>Bethel *</span><select name="${name}" required><option value="">— Choisir —</option>${groups.map((g) => opt(g.id, g.name, cur)).join('')}</select></label>`;
}
function viewMemberForm(id, params) {
  const m = id ? memberById(id) : { status: 'nouveau', fonction: 'membre', bethel_id: curB() !== 'all' ? curB() : params.b || '' };
  if (!m) return { title: 'Modifier', back: true, html: '<div class="empty">Fiche introuvable.</div>' };
  const groups = canEditAll() ? groupsSorted() : editableGroups();
  if (readOnly() || !groups.length || (id && !canEditB(m.bethel_id))) return { title: 'Modifier', back: true, html: `<div class="alert warn">Tu n'as pas l'autorisation de modifier cette fiche.</div>` };
  const fbOpts = (bid) => S.members.filter((x) => x.bethel_id === bid && x.fonction !== 'membre' && x.id !== m.id && x.status !== 'inactif');
  const html = `<form class="card" id="mf">
    ${bethelSelect('bethel_id', m.bethel_id, groups)}
    <label class="f"><span>Prénom *</span><input type="text" name="first_name" value="${esc(m.first_name)}" required></label>
    <label class="f"><span>Nom</span><input type="text" name="last_name" value="${esc(m.last_name)}"></label>
    <label class="f"><span>Téléphone (8 chiffres)</span><input type="tel" name="phone" inputmode="numeric" value="${esc(m.phone)}" placeholder="ex. 31324336"></label>
    <label class="f"><span>Date de naissance</span><input type="date" name="birth_date" value="${esc(m.birth_date)}"></label>
    <label class="f"><span>Adresse</span><input type="text" name="address" value="${esc(m.address)}"></label>
    <label class="f"><span>Email</span><input type="email" name="email" value="${esc(m.email)}"></label>
    <div class="row wrap"><label class="f grow"><span>Sexe</span><select name="gender">${opt('', '—', m.gender)}${opt('H', 'Homme', m.gender)}${opt('F', 'Femme', m.gender)}</select></label>
    <label class="f grow"><span>Baptisé(e)</span><select name="baptized">${opt('', '—', m.baptized == null ? '' : null)}${opt('true', 'Oui', m.baptized === true ? 'true' : null)}${opt('false', 'Non', m.baptized === false ? 'false' : null)}</select></label></div>
    <label class="f"><span>Fonction dans le Bethel</span><select name="fonction">${Object.entries(FONCTIONS).map(([k, l]) => opt(k, l, m.fonction)).join('')}</select></label>
    <label class="f"><span>Suivi par</span><select name="followed_by" id="fbsel"><option value="">Leader et assistant (les deux)</option>${fbOpts(m.bethel_id).map((x) => opt(x.id, `${fullName(x)} (${FONCTIONS[x.fonction]})`, m.followed_by)).join('')}</select></label>
    <label class="f"><span>Statut</span><select name="status">${Object.entries(STATUS).map(([k, l]) => opt(k, l, m.status)).join('')}</select></label>
    <div class="btns" style="margin-top:8px"><button class="btn" type="submit">${id ? 'Enregistrer' : 'Ajouter le membre'}</button><button type="button" class="btn light" data-back>Annuler</button></div>
    ${id && canEditAll() ? '<hr><button type="button" class="btn danger sm" id="del">Supprimer cette fiche</button><div class="tiny muted" style="margin-top:6px">Impossible si des dîmes sont enregistrées à son nom : mets plutôt le statut « Inactif ».</div>' : ''}
  </form>`;
  return {
    title: id ? 'Modifier la fiche' : 'Nouveau membre', back: true, html,
    bind(root) {
      const f = q('#mf', root);
      const bs = f.querySelector('select[name=bethel_id]');
      if (bs) bs.addEventListener('change', () => { q('#fbsel', root).innerHTML = '<option value="">Leader et assistant (les deux)</option>' + fbOpts(bs.value).map((x) => opt(x.id, `${fullName(x)} (${FONCTIONS[x.fonction]})`, null)).join(''); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', f); b.disabled = true;
        const rec = {
          bethel_id: f.bethel_id.value, first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim() || null,
          phone: digits(f.phone.value) || null, email: f.email.value.trim() || null, address: f.address.value.trim() || null,
          birth_date: f.birth_date.value || null, gender: f.gender.value || null, baptized: f.baptized.value === '' ? null : f.baptized.value === 'true',
          fonction: f.fonction.value, followed_by: f.followed_by.value || null, status: f.status.value,
        };
        try {
          if (!rec.bethel_id) throw new Error('Choisis le Bethel.');
          if (rec.phone) { const dup = S.members.find((x) => x.id !== id && digits(x.phone) === rec.phone); if (dup && !confirmInline(b, `Numéro déjà utilisé par ${fullName(dup)}. Appuie encore pour enregistrer.`)) { b.disabled = false; return; } }
          if (rec.fonction !== 'membre') { const other = S.members.find((x) => x.id !== id && x.bethel_id === rec.bethel_id && x.fonction === rec.fonction && x.status !== 'inactif'); if (other && !confirmInline(b, `${fullName(other)} est déjà ${FONCTIONS[rec.fonction].toLowerCase()} de ce Bethel. Appuie encore pour le/la remplacer.`)) { b.disabled = false; return; } if (other) { await must(sb.from('bethel_members').update({ fonction: 'membre' }).eq('id', other.id)); other.fonction = 'membre'; } }
          let saved;
          if (id) { saved = (await must(sb.from('bethel_members').update(rec).eq('id', id).select()))[0]; Object.assign(memberById(id), saved || rec); }
          else { rec.created_by = S.me.id; saved = (await must(sb.from('bethel_members').insert(rec).select()))[0]; S.members.push(saved); S.members.sort((a, c) => fullName(a).localeCompare(fullName(c), 'fr')); }
          toast(id ? 'Fiche enregistrée' : 'Membre ajouté'); go('#/membre/' + (id || saved.id));
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const del = q('#del', root);
      if (del) del.addEventListener('click', async () => {
        if (!confirmInline(del, 'Appuie encore : suppression définitive (présences et suivis inclus)')) return;
        try { await must(sb.from('bethel_members').delete().eq('id', id)); S.members = S.members.filter((x) => x.id !== id); S.attendance = S.attendance.filter((a) => a.member_id !== id); toast('Fiche supprimée'); go('#/membres'); } catch (err) { toast(errMsg(err), true); }
      });
    },
  };
}

/* ---------- PRÉSENCES : rencontres ---------- */
function viewSessions() {
  const ss = scopeSessions();
  const groups = editableGroups().filter((g) => inScope(g.id));
  const canCreate = !readOnly() && groups.length > 0;
  const html = `
  ${canCreate ? `<form class="card" id="sf"><h2>Nouvelle rencontre</h2>
    ${bethelSelect('bethel_id', curB() !== 'all' ? curB() : '', groups)}
    <div class="row wrap"><select name="kind" class="grow" style="min-width:150px">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <input type="date" name="date" value="${today()}" style="width:auto;flex:1;min-width:150px"></div>
    <input type="text" name="theme" placeholder="Thème / passage (facultatif)" style="margin-top:8px">
    <button class="btn full" style="margin-top:10px">Ouvrir la feuille de présence</button></form>` : ''}
  <div class="sec">Rencontres</div>
  <div class="list">${ss.length ? ss.map((s) => `<a class="li" href="#/presence/${s.id}"><span class="av">${esc(fmtD(s.date, { day: 'numeric' }))}</span><span class="grow"><div class="nm">${esc(KINDS[s.kind])}${curB() === 'all' ? ' · ' + esc(bName(s.bethel_id)) : ''}</div><div class="sub">${esc(fmtD(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${s.theme ? ' · ' + esc(s.theme) : ''}</div></span><span class="b ok">${presentCount(s.id)}${s.visitors ? ' +' + s.visitors : ''} prés.</span></a>`).join('') : '<div class="empty">Aucune rencontre pour le moment.</div>'}</div>`;
  return {
    title: 'Présences', html,
    bind(root) {
      const f = q('#sf', root); if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const kind = f.kind.value, date = f.date.value, bethel_id = f.bethel_id.value; if (!date) return;
        if (!bethel_id) return toast('Choisis le Bethel.', true);
        let s = S.sessions.find((x) => x.kind === kind && x.date === date && x.bethel_id === bethel_id);
        try {
          if (!s) {
            const r = await sb.from('bethel_sessions').insert({ bethel_id, kind, date, theme: f.theme.value.trim() || null, created_by: S.me.id }).select();
            if (r.error && /duplicate/i.test(r.error.message)) { await loadAll(); s = S.sessions.find((x) => x.kind === kind && x.date === date && x.bethel_id === bethel_id); }
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
  if (!s) return { title: 'Rencontre', back: true, html: '<div class="empty">Rencontre introuvable.</div>' };
  const edit = canEditB(s.bethel_id) && !readOnly();
  const scope = params.v || 'tous';
  let list = S.members.filter((m) => m.bethel_id === s.bethel_id && (m.status !== 'inactif' || attOf(s.id, m.id)));
  if (scope === 'nonmarques') list = list.filter((m) => !attOf(s.id, m.id));
  const counts = () => { const rows = S.attendance.filter((a) => a.session_id === s.id); return { p: rows.filter((a) => a.present).length, a: rows.filter((a) => !a.present).length }; };
  const c = counts();
  const dis = edit ? '' : 'disabled';
  const html = `
  <div class="card"><div class="row"><div class="grow"><h2>${esc(KINDS[s.kind])}</h2><div class="small muted">${esc(bName(s.bethel_id))} · ${esc(fmtD(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
  <div style="text-align:right"><div><span class="b ok" id="cp">${c.p} présents</span></div><div style="margin-top:4px"><span class="b bad" id="ca">${c.a} absents</span></div></div></div>
  ${edit ? `<div class="row wrap" style="margin-top:10px"><input type="text" id="theme" placeholder="Thème / passage" value="${esc(s.theme)}" class="grow" style="min-width:160px"><input type="number" id="vis" min="0" inputmode="numeric" placeholder="Visiteurs" value="${esc(s.visitors)}" style="width:110px"></div>` : `${s.theme ? `<div class="small" style="margin-top:8px">Thème : ${esc(s.theme)}</div>` : ''}${s.visitors ? `<div class="small">Visiteurs : ${s.visitors}</div>` : ''}<div class="small muted" style="margin-top:8px">Lecture seule.</div>`}</div>
  <div class="chips"><button class="chip ${scope === 'tous' ? 'on' : ''}" data-v="tous">Tout le Bethel</button><button class="chip ${scope === 'nonmarques' ? 'on' : ''}" data-v="nonmarques">Non marqués</button></div>
  <div class="list">${list.length ? list.map((m) => { const a = attOf(s.id, m.id);
    return `<div class="li" data-y="${m.id}"><span class="av ${m.fonction !== 'membre' ? 'core' : ''}">${esc(initials(m))}</span><span class="grow"><div class="nm">${esc(fullName(m))}</div><div class="sub">${m.fonction !== 'membre' ? FONCTIONS[m.fonction] : m.status === 'nouveau' ? 'Nouveau' : ''}</div></span>
    <span class="pa"><button class="p ${a?.present ? 'on' : ''}" data-mark="1" ${dis} aria-label="Présent">P</button><button class="a ${a && !a.present ? 'on' : ''}" data-mark="0" ${dis} aria-label="Absent">A</button></span></div>`; }).join('') : '<div class="empty">Personne dans cette liste.</div>'}</div>
  ${edit && list.some((m) => !attOf(s.id, m.id)) ? '<button class="btn light full" id="allabs" style="margin-bottom:12px">Marquer absents tous les non marqués</button>' : ''}
  ${edit ? `<a class="btn full ghost" style="margin-bottom:12px" href="#/don/nouveau?b=${s.bethel_id}&d=${s.date}">Enregistrer les dîmes / offrandes de cette rencontre</a>
  <form class="card" id="vf"><h2>Ajouter un nouveau membre</h2>
    <div class="row wrap"><input type="text" name="fn" placeholder="Prénom *" required style="flex:1;min-width:130px"><input type="text" name="ln" placeholder="Nom" style="flex:1;min-width:130px"></div>
    <input type="tel" name="ph" inputmode="numeric" placeholder="Téléphone" style="margin-top:8px">
    <button class="btn full" style="margin-top:8px">Ajouter au Bethel et marquer présent</button></form>
  <button class="btn danger sm" id="dels">Supprimer cette rencontre</button>` : ''}`;
  return {
    title: KIND_SHORT[s.kind] + ' · ' + fmtD(s.date, { day: 'numeric', month: 'short' }), back: true, html,
    bind(root) {
      on(root, '[data-v]', 'click', (e, el) => { history.replaceState(null, '', `#/presence/${id}?v=${el.dataset.v}`); render(); });
      const refreshCounts = () => { const cc = counts(); q('#cp', root).textContent = cc.p + ' présents'; q('#ca', root).textContent = cc.a + ' absents'; };
      const saveSession = async (patch) => { try { await must(sb.from('bethel_sessions').update(patch).eq('id', s.id)); Object.assign(s, patch); toast('Enregistré'); } catch (err) { toast(errMsg(err), true); } };
      const th = q('#theme', root); if (th) th.addEventListener('change', () => saveSession({ theme: th.value.trim() || null }));
      const vi = q('#vis', root); if (vi) vi.addEventListener('change', () => saveSession({ visitors: vi.value === '' ? null : Math.max(0, parseInt(vi.value, 10) || 0) }));
      const mark = async (mid, present, row) => {
        const prev = attOf(s.id, mid);
        const now = prev && prev.present === present ? null : present; // ré-appui = effacer
        const btns = qa('button', row); btns.forEach((b) => b.classList.remove('on'));
        if (now !== null) q(now ? '.p' : '.a', row).classList.add('on');
        try {
          if (now === null) { await must(sb.from('bethel_attendance').delete().eq('session_id', s.id).eq('member_id', mid)); S.attendance = S.attendance.filter((a) => !(a.session_id === s.id && a.member_id === mid)); }
          else {
            const rec = { session_id: s.id, member_id: mid, present: now, marked_by: S.me.id, marked_at: new Date().toISOString() };
            await must(sb.from('bethel_attendance').upsert(rec));
            if (prev) Object.assign(prev, rec); else S.attendance.push(rec);
          }
          refreshCounts();
        } catch (err) { toast(errMsg(err), true); btns.forEach((b) => b.classList.remove('on')); if (prev) q(prev.present ? '.p' : '.a', row).classList.add('on'); }
      };
      on(root, '[data-mark]', 'click', (e, el) => { const row = el.closest('[data-y]'); mark(row.dataset.y, el.dataset.mark === '1', row); });
      const ab = q('#allabs', root);
      if (ab) ab.addEventListener('click', async () => {
        const recs = list.filter((m) => !attOf(s.id, m.id)).map((m) => ({ session_id: s.id, member_id: m.id, present: false, marked_by: S.me.id, marked_at: new Date().toISOString() }));
        if (!recs.length) return; ab.disabled = true;
        try { await must(sb.from('bethel_attendance').upsert(recs)); S.attendance.push(...recs); toast(recs.length + ' absents marqués'); render(); } catch (err) { toast(errMsg(err), true); ab.disabled = false; }
      });
      const vf = q('#vf', root);
      if (vf) vf.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button', vf); b.disabled = true;
        try {
          const ph = digits(vf.ph.value) || null;
          const ex = ph && S.members.find((x) => digits(x.phone) === ph && x.bethel_id === s.bethel_id);
          let m = ex;
          if (!m) { m = (await must(sb.from('bethel_members').insert({ bethel_id: s.bethel_id, first_name: vf.fn.value.trim(), last_name: vf.ln.value.trim() || null, phone: ph, status: 'nouveau', created_by: S.me.id }).select()))[0]; S.members.push(m); S.members.sort((a, c2) => fullName(a).localeCompare(fullName(c2), 'fr')); }
          const rec = { session_id: s.id, member_id: m.id, present: true, marked_by: S.me.id, marked_at: new Date().toISOString() };
          await must(sb.from('bethel_attendance').upsert(rec));
          S.attendance = S.attendance.filter((a) => !(a.session_id === s.id && a.member_id === m.id)); S.attendance.push(rec);
          toast(ex ? `${fullName(m)} existait déjà : marqué présent` : `${fullName(m)} ajouté et marqué présent`); render();
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const ds = q('#dels', root);
      if (ds) ds.addEventListener('click', async () => {
        if (!confirmInline(ds, 'Appuie encore : supprimer la rencontre et ses présences')) return;
        try { await must(sb.from('bethel_sessions').delete().eq('id', s.id)); S.sessions = S.sessions.filter((x) => x.id !== s.id); S.attendance = S.attendance.filter((a) => a.session_id !== s.id); toast('Rencontre supprimée'); go('#/presences'); } catch (err) { toast(errMsg(err), true); }
      });
    },
  };
}

/* ---------- DÎMES ET OFFRANDES ---------- */
function viewFinance(params) {
  const ym = params.m || curMonth();
  const v = params.v || 'journal';
  const isCur = ym === curMonth();
  const mc = monthContribs(ym);
  const edit = !readOnly() && editableGroups().some((g) => inScope(g.id));
  const pend = pending();
  const tab = (k, l) => `<button class="chip ${v === k ? 'on' : ''}" data-v="${k}">${l}</button>`;
  let body = '';
  if (v === 'journal') {
    const byDay = {};
    mc.forEach((c) => { (byDay[c.date] = byDay[c.date] || []).push(c); });
    body = Object.keys(byDay).sort().reverse().map((d) => `<div class="day">${esc(fmtD(d, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(fmtTot(sumBy(byDay[d])))}</div><div class="list">${byDay[d].map((c) => contribRow(c)).join('')}</div>`).join('') || '<div class="empty">Aucune entrée ce mois.</div>';
  } else if (v === 'membres') {
    const ms = scopeMembers();
    const yr = ym.slice(0, 4);
    const yc = S.contribs.filter((c) => c.date.startsWith(yr) && inScope(c.bethel_id));
    const tith = tithersOf(mc);
    body = `<div class="card"><div class="small" style="margin-bottom:8px"><b>${tith.size}/${ms.length}</b> membres ont donné leur dîme en ${esc(monthLabel(ym).toLowerCase())}.</div>
    <table class="t"><tr><th>Membre</th><th>Dîme du mois</th><th>Offr. du mois</th><th>Mois avec dîme (${yr})</th></tr>
    ${ms.map((m) => { const mine = mc.filter((c) => c.member_id === m.id); const d = sumBy(mine.filter((c) => c.kind === 'dime')); const o = sumBy(mine.filter((c) => c.kind !== 'dime')); const months = new Set(yc.filter((c) => c.member_id === m.id && c.kind === 'dime').map((c) => c.date.slice(0, 7))).size;
      return `<tr><td><a href="#/membre/${m.id}">${esc(fullName(m))}</a></td><td class="money">${d.HTG || d.USD ? esc(fmtTot(d)) : '<span class="muted">—</span>'}</td><td class="money">${o.HTG || o.USD ? esc(fmtTot(o)) : '<span class="muted">—</span>'}</td><td>${months}</td></tr>`; }).join('')}</table>
    <div class="tiny muted" style="margin-top:8px">Information confidentielle : réservée au leader, à l'assistant et aux responsables.</div></div>`;
  } else {
    const byB = {};
    pend.forEach((c) => { (byB[c.bethel_id] = byB[c.bethel_id] || []).push(c); });
    body = Object.keys(byB).map((bid) => `<div class="card"><h2>${esc(bName(bid))} <span class="money">${esc(fmtTot(sumBy(byB[bid])))}</span></h2>
      <div class="small muted" style="margin:-4px 0 8px">${byB[bid].length} entrée(s) encaissée(s) par le Bethel, pas encore remises à la trésorerie de l'église.</div>
      <div class="list">${byB[bid].sort((a, b) => b.date.localeCompare(a.date)).map((c) => contribRow(c)).join('')}</div>
      ${canEditB(bid) && !readOnly() ? `<button class="btn full" style="margin-top:10px" data-remit="${bid}">Marquer tout remis aujourd'hui</button><div class="tiny muted" style="margin-top:6px">Une fois remise, une entrée ne peut plus être modifiée que par le coordinateur.</div>` : ''}</div>`).join('') || '<div class="alert ok">Tout a été remis à l\'église 👍</div>';
  }
  const html = `
  <div class="card"><div class="row"><button class="btn light sm" data-m="${addMonths(ym, -1)}">‹</button>
    <div class="grow" style="text-align:center"><b>${esc(monthLabel(ym))}</b></div>
    <button class="btn light sm" data-m="${addMonths(ym, 1)}" ${isCur ? 'disabled' : ''}>›</button></div>
    <div class="tot" style="margin-top:12px">${Object.keys(CKINDS).map((k) => { const t = sumBy(mc.filter((c) => c.kind === k)); return `<span>${CKINDS[k]}</span><span class="money">${fmtTot(t, '—')}</span>`; }).join('')}
    <b>Total</b><span class="money">${fmtTot(sumBy(mc))}</span></div>
    ${pend.length ? `<div class="small" style="margin-top:8px;color:var(--warn)">À remettre à l'église (tous mois) : <b>${esc(fmtTot(sumBy(pend)))}</b></div>` : ''}
  </div>
  ${edit ? '<a class="btn full" style="margin-bottom:12px" href="#/don/nouveau">+ Nouvelle dîme / offrande</a>' : ''}
  <div class="chips">${tab('journal', 'Journal')}${tab('membres', 'Par membre')}${tab('nonremis', `À remettre${pend.length ? ' (' + pend.length + ')' : ''}`)}</div>
  ${body}`;
  return {
    title: 'Dîmes et offrandes', html,
    bind(root) {
      const nav = (k, val) => { const p = { m: ym, v, [k]: val }; if (p.m === curMonth()) delete p.m; if (p.v === 'journal') delete p.v; location.hash = '#/dimes?' + new URLSearchParams(p); };
      on(root, '[data-m]', 'click', (e, el) => nav('m', el.dataset.m));
      on(root, '[data-v]', 'click', (e, el) => nav('v', el.dataset.v));
      on(root, '[data-remit]', 'click', async (e, el) => {
        const bid = el.dataset.remit; const list = pending(bid);
        if (!confirmInline(el, `Appuie encore : confirmer la remise de ${fmtTot(sumBy(list))}`)) return;
        el.disabled = true;
        try { const d = today(); await must(sb.from('bethel_contributions').update({ remitted_at: d }).in('id', list.map((c) => c.id))); list.forEach((c) => { c.remitted_at = d; c.remitted_by = S.me.id; }); toast('Remise enregistrée'); render(); } catch (err) { toast(errMsg(err), true); el.disabled = false; }
      });
    },
  };
}
const receiptMsg = (c) => { const m = memberById(c.member_id); return encodeURIComponent(`Bonjour ${m.first_name} 🙏\nLe Bethel ${bName(c.bethel_id)} confirme avoir reçu ta ${CKINDS[c.kind].toLowerCase()} de ${money(c.amount, c.currency)} le ${fmtLong(c.date)}.\nMerci pour ta fidélité. Que Dieu te bénisse abondamment !`); };
function viewContribForm(id, params) {
  const c = id ? S.contribs.find((x) => x.id === id) : null;
  if (id && !c) return { title: 'Entrée', back: true, html: '<div class="empty">Entrée introuvable.</div>' };
  const pre = params.m ? memberById(params.m) : null;
  const bid0 = c ? c.bethel_id : pre ? pre.bethel_id : params.b || (curB() !== 'all' ? curB() : '');
  const groups = editableGroups();
  const locked = c && c.remitted_at && !canEditAll();
  const edit = !readOnly() && (c ? canEditB(c.bethel_id) && !locked : groups.length > 0);
  if (c && params.ok) {
    const m = memberById(c.member_id);
    return {
      title: 'Enregistré', back: true,
      html: `<div class="card" style="text-align:center"><div style="font-size:2rem">✅</div><h2 style="justify-content:center">${CKINDS[c.kind]} enregistrée</h2>
      <div class="money" style="font-size:1.6rem;margin:6px 0">${esc(money(c.amount, c.currency))}</div><div class="small muted">${m ? esc(fullName(m)) : 'Collecte / anonyme'} · ${esc(fmtLong(c.date))} · ${METHODS[c.method]}</div>
      <div class="stack" style="margin-top:14px">${m && digits(m.phone) ? `<a class="btn ok full" href="https://wa.me/${intlPhone(m.phone)}?text=${receiptMsg(c)}" target="_blank" rel="noopener">${I.wa} Envoyer le reçu par WhatsApp</a>` : ''}
      <a class="btn full" href="#/don/nouveau?b=${c.bethel_id}&d=${c.date}">+ Enregistrer une autre entrée</a><a class="btn light full" href="#/dimes">Voir le journal</a></div></div>`,
    };
  }
  if (!c && !edit) return { title: 'Nouvelle entrée', back: true, html: `<div class="alert warn">Tu n'as pas l'autorisation d'enregistrer des dîmes.</div>` };
  const cur = c || { kind: 'dime', currency: 'HTG', method: 'cash', date: params.d || today(), member_id: pre?.id || '' };
  const memberOpts = (bid, sel) => `<option value="">— Offrande collective / anonyme —</option>${S.members.filter((m) => m.bethel_id === bid && (m.status !== 'inactif' || m.id === sel)).map((m) => opt(m.id, fullName(m), sel)).join('')}`;
  const dis = edit ? '' : 'disabled';
  const html = `${locked ? '<div class="alert info">Cette entrée a été remise à l\'église le ' + esc(fmtLong(c.remitted_at)) + '. Seul le coordinateur peut la corriger.</div>' : ''}
  <form class="card" id="cf">
    ${c || groups.length === 1 ? `<input type="hidden" name="bethel_id" value="${bid0 || groups[0]?.id || ''}">${c ? `<div class="small muted" style="margin-bottom:10px">${esc(bName(c.bethel_id))}</div>` : ''}` : `<label class="f"><span>Bethel *</span><select name="bethel_id" id="cb" required><option value="">— Choisir —</option>${groups.map((g) => opt(g.id, g.name, bid0)).join('')}</select></label>`}
    <div class="seg">${Object.entries(CKINDS).map(([k, l]) => `<label><input type="radio" name="kind" value="${k}" ${cur.kind === k ? 'checked' : ''} ${dis}><span>${l}</span></label>`).join('')}</div>
    <label class="f"><span>Membre</span><select name="member_id" id="cm" ${dis}>${memberOpts(bid0, cur.member_id)}</select></label>
    <label class="f"><span>Montant *</span><input class="amt" type="number" name="amount" min="1" step="any" inputmode="decimal" required value="${esc(cur.amount)}" placeholder="0" ${dis}></label>
    <div class="row wrap"><label class="f grow"><span>Devise</span><select name="currency" ${dis}>${opt('HTG', 'Gourdes (HTG)', cur.currency)}${opt('USD', 'Dollars US (USD)', cur.currency)}</select></label>
    <label class="f grow"><span>Mode</span><select name="method" ${dis}>${Object.entries(METHODS).map(([k, l]) => opt(k, l, cur.method)).join('')}</select></label></div>
    <label class="f"><span>Date</span><input type="date" name="date" value="${esc(cur.date)}" max="${today()}" required ${dis}></label>
    <label class="f"><span>Note</span><input type="text" name="note" value="${esc(cur.note)}" placeholder="ex. réf. MonCash, construction, mission…" ${dis}></label>
    ${c ? `<div class="small muted" style="margin-bottom:10px">Saisi par ${esc(profileById(c.created_by)?.full_name || '—')} le ${new Date(c.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}${c.remitted_at ? ` · remis le ${esc(fmtLong(c.remitted_at))} par ${esc(profileById(c.remitted_by)?.full_name || '—')}` : ''}</div>` : ''}
    ${edit ? `<div class="btns"><button class="btn" type="submit">${c ? 'Enregistrer' : 'Enregistrer'}</button><button type="button" class="btn light" data-back>Annuler</button></div>` : ''}
    ${c && c.member_id && digits(memberById(c.member_id)?.phone) ? `<a class="btn ok sm" style="margin-top:10px" href="https://wa.me/${intlPhone(memberById(c.member_id).phone)}?text=${receiptMsg(c)}" target="_blank" rel="noopener">${I.wa} Renvoyer le reçu</a>` : ''}
    ${c && canEditAll() && c.remitted_at ? '<hr><button type="button" class="btn ghost sm" id="unremit">Annuler la remise</button>' : ''}
    ${c && edit && (!c.remitted_at || isSuper()) ? '<hr><button type="button" class="btn danger sm" id="delc">Supprimer cette entrée</button>' : ''}
  </form>`;
  return {
    title: c ? 'Dîme / offrande' : 'Nouvelle entrée', back: true, html,
    bind(root) {
      const f = q('#cf', root);
      const cb = q('#cb', root); if (cb) cb.addEventListener('change', () => { q('#cm', root).innerHTML = memberOpts(cb.value, ''); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', f);
        const amount = Number(String(f.amount.value).replace(',', '.'));
        const rec = { bethel_id: f.bethel_id.value, member_id: f.member_id.value || null, kind: f.kind.value, amount, currency: f.currency.value, method: f.method.value, date: f.date.value, note: f.note.value.trim() || null };
        if (!rec.bethel_id) return toast('Choisis le Bethel.', true);
        if (!(amount > 0)) return toast('Montant invalide.', true);
        if (rec.kind === 'dime' && !rec.member_id) return toast('Une dîme doit être rattachée à un membre.', true);
        if (!c && rec.amount >= 50000 && rec.currency === 'HTG' && !confirmInline(b, `${money(amount)} : appuie encore pour confirmer`)) return;
        b.disabled = true;
        try {
          let saved;
          if (c) { saved = (await must(sb.from('bethel_contributions').update(rec).eq('id', c.id).select()))[0]; Object.assign(c, saved || rec); toast('Entrée modifiée'); go('#/dimes'); }
          else { saved = (await must(sb.from('bethel_contributions').insert(rec).select()))[0]; S.contribs.unshift(saved); go(`#/don/${saved.id}?ok=1`); }
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const un = q('#unremit', root);
      if (un) un.addEventListener('click', async () => { if (!confirmInline(un, 'Appuie encore pour annuler la remise')) return; try { await must(sb.from('bethel_contributions').update({ remitted_at: null }).eq('id', c.id)); c.remitted_at = null; c.remitted_by = null; toast('Remise annulée'); render(); } catch (err) { toast(errMsg(err), true); } });
      const dl = q('#delc', root);
      if (dl) dl.addEventListener('click', async () => { if (!confirmInline(dl, 'Appuie encore pour supprimer')) return; try { await must(sb.from('bethel_contributions').delete().eq('id', c.id)); S.contribs = S.contribs.filter((x) => x.id !== c.id); toast('Entrée supprimée'); go('#/dimes'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}

/* ---------- SUIVI HEBDO ---------- */
function viewFollow(params) {
  const ws = params.w || weekStart();
  const mine = myMemberId() && S.members.some((m) => m.followed_by === myMemberId());
  const v = params.v || (mine ? 'mes' : 'tous');
  let list = scopeMembers();
  if (v === 'mes') list = list.filter((m) => m.followed_by === myMemberId() || !m.followed_by);
  list = list.filter((m) => m.id !== myMemberId());
  const canTick = (m) => !readOnly() && canEditB(m.bethel_id);
  const st = followStats(list, ws);
  const isCur = ws === weekStart();
  const rep = curB() !== 'all' && reportOf(curB(), ws);
  const msgTpl = (m) => encodeURIComponent(`Bonjour ${m.first_name} ! 🙏 Comment vas-tu cette semaine ? Toute la famille du Bethel ${bName(m.bethel_id)} pense à toi. As-tu un sujet de prière ? On se voit à la prochaine rencontre !`);
  const html = `
  <div class="card"><div class="row"><button class="btn light sm" data-w="${addDays(ws, -7)}">‹</button>
    <div class="grow" style="text-align:center"><b>Semaine ${esc(weekLabel(ws))}</b><div class="tiny muted">${isCur ? 'semaine en cours' : ''}</div></div>
    <button class="btn light sm" data-w="${addDays(ws, 7)}" ${isCur ? 'disabled' : ''}>›</button></div>
    <div class="row" style="margin-top:12px"><div class="grow prog"><i style="width:${st.p}%"></i></div><b class="small">${st.sent}/${st.n}</b></div>
    ${curB() !== 'all' ? `<div class="row small" style="margin-top:10px"><span class="grow">Rapport de la semaine</span>${rep ? `<a class="b ok" href="#/rapport/${rep.id}">soumis ✓</a>` : canEditB(curB()) && !readOnly() ? `<a class="btn sm ghost" href="#/rapport/nouveau${isCur ? '' : '?w=' + ws}">Rédiger</a>` : '<span class="b warn">pas encore</span>'}</div>` : '<div class="small" style="margin-top:10px"><a href="#/rapports">Voir les rapports des Bethels →</a></div>'}
  </div>
  ${mine ? `<div class="chips"><button class="chip ${v === 'mes' ? 'on' : ''}" data-v="mes">Mes membres</button><button class="chip ${v === 'tous' ? 'on' : ''}" data-v="tous">Tout le Bethel</button></div>` : ''}
  ${!list.length ? '<div class="empty">Aucun membre dans cette liste.</div>' : `
  <div class="small muted" style="margin:0 4px 8px">Envoie ton message (WhatsApp, appel, visite…) puis coche « Contacté ».</div>
  <div class="list">${list.map((m) => { const f = fuOf(m.id, ws); const dis = canTick(m) ? '' : 'disabled';
    return `<div class="fu" data-y="${m.id}"><div class="row"><a class="grow" href="#/membre/${m.id}" style="color:inherit;min-width:0"><div class="nm" style="font-weight:600">${esc(fullName(m))}</div><div class="tiny muted">${curB() === 'all' ? esc(bName(m.bethel_id)) + ' · ' : ''}${esc(fmtPhone(m.phone)) || 'pas de numéro'}${m.followed_by ? ' · suivi : ' + esc(memberById(m.followed_by)?.first_name || '') : ''}</div></a>
      ${digits(m.phone) ? `<a class="btn ok sm" style="padding:0 10px" href="https://wa.me/${intlPhone(m.phone)}?text=${msgTpl(m)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ''}
      <button class="tog ${f?.sent ? 'on' : ''}" data-sent ${dis}>${f?.sent ? '✓ Contacté' : 'Contacté ?'}</button></div>
      ${f?.sent ? `<div class="extra"><div class="row"><span class="small muted grow">A répondu ?</span><span class="mini"><button class="y ${f.replied === true ? 'on' : ''}" data-rep="1" ${dis}>Oui</button><button class="n ${f.replied === false ? 'on' : ''}" data-rep="0" ${dis}>Non</button></span></div>
      <input type="text" data-note placeholder="Note (facultatif)" value="${esc(f.note)}" ${dis}></div>` : ''}</div>`; }).join('')}</div>`}`;
  return {
    title: 'Suivi hebdo', html,
    bind(root) {
      const nav = (k, val) => { const p = { w: ws, v, [k]: val }; if (p.w === weekStart()) delete p.w; location.hash = '#/suivi?' + new URLSearchParams(p); };
      on(root, '[data-w]', 'click', (e, el) => nav('w', el.dataset.w));
      on(root, '[data-v]', 'click', (e, el) => nav('v', el.dataset.v));
      const save = async (mid, patch) => {
        const prev = fuOf(mid, ws);
        const rec = { member_id: mid, week_start: ws, sent: prev?.sent || false, replied: prev?.replied ?? null, note: prev?.note ?? null, ...patch, updated_by: S.me.id, updated_at: new Date().toISOString() };
        if (!rec.sent) rec.replied = null;
        await must(sb.from('bethel_followups').upsert(rec));
        if (prev) Object.assign(prev, rec); else S.followups.push(rec);
      };
      on(root, '[data-sent]', 'click', async (e, el) => { const mid = el.closest('[data-y]').dataset.y; el.disabled = true; try { await save(mid, { sent: !fuOf(mid, ws)?.sent }); render(); } catch (err) { toast(errMsg(err), true); el.disabled = false; } });
      on(root, '[data-rep]', 'click', async (e, el) => { const mid = el.closest('[data-y]').dataset.y; const val = el.dataset.rep === '1'; const cur = fuOf(mid, ws)?.replied; try { await save(mid, { replied: cur === val ? null : val }); render(); } catch (err) { toast(errMsg(err), true); } });
      on(root, '[data-note]', 'change', async (e, el) => { const mid = el.closest('[data-y]').dataset.y; try { await save(mid, { note: el.value.trim() || null }); toast('Note enregistrée'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}

/* ---------- RAPPORTS ---------- */
function weekFigures(bid, ws) {
  const list = S.members.filter((m) => m.bethel_id === bid && m.status !== 'inactif');
  const fs = followStats(list, ws);
  const ss = S.sessions.filter((s) => s.bethel_id === bid && s.date >= ws && s.date <= addDays(ws, 6));
  const pres = ss.length ? Math.max(...ss.map((s) => presentCount(s.id))) : null;
  const money7 = contribsIn(ws, addDays(ws, 6), bid);
  return { list, fs, ss, pres, money7 };
}
function viewReports(params) {
  const ws = params.w || weekStart();
  const isCur = ws === weekStart();
  const groups = scopeGroups();
  const html = `
  <div class="card"><div class="row"><button class="btn light sm" data-w="${addDays(ws, -7)}">‹</button><div class="grow" style="text-align:center"><b>Semaine ${esc(weekLabel(ws))}</b></div><button class="btn light sm" data-w="${addDays(ws, 7)}" ${isCur ? 'disabled' : ''}>›</button></div>
  <div class="small" style="margin-top:10px">${groups.filter((g) => reportOf(g.id, ws)).length} rapport(s) reçu(s) sur ${groups.length} Bethel(s).</div></div>
  <div class="list">${groups.map((g) => { const r = reportOf(g.id, ws); const can = canEditB(g.id) && !readOnly();
    return r ? `<a class="li" href="#/rapport/${r.id}"><span class="grow"><div class="nm">${esc(g.name)}</div><div class="sub">par ${esc(profileById(r.author_id)?.full_name || '—')} · ${r.contacted ?? 0}/${r.members_count ?? '?'} contactés${r.present_count != null ? ' · ' + r.present_count + ' présents' : ''}</div></span><span class="b ok">✓</span></a>`
      : `<div class="li"><span class="grow"><div class="nm">${esc(g.name)}</div><div class="sub">pas encore soumis</div></span>${can ? `<a class="btn sm" href="#/rapport/nouveau?b=${g.id}${isCur ? '' : '&w=' + ws}">Rédiger</a>` : '<span class="b bad">✗</span>'}</div>`; }).join('') || '<div class="empty">Aucun Bethel.</div>'}</div>`;
  return { title: 'Rapports', back: true, html, bind(root) { on(root, '[data-w]', 'click', (e, el) => { location.hash = '#/rapports' + (el.dataset.w === weekStart() ? '' : '?w=' + el.dataset.w); }); } };
}
function viewReportForm(params) {
  const ws = params.w || weekStart();
  const bid = params.b || (curB() !== 'all' ? curB() : '');
  const g = groupById(bid);
  if (!g || !canEditB(bid) || readOnly()) return { title: 'Rapport', back: true, html: `<div class="alert warn">${g ? 'Seuls le leader et l\'assistant du Bethel peuvent soumettre son rapport.' : 'Choisis d\'abord un Bethel (en haut de l\'écran) ou passe par Menu → Rapports.'}</div>` };
  const ex = reportOf(bid, ws);
  if (ex) return { title: 'Rapport', back: true, html: `<div class="alert ok">Le rapport de cette semaine est déjà soumis. <a href="#/rapport/${ex.id}">Le voir</a></div>` };
  const w = weekFigures(bid, ws);
  const html = `<form class="card" id="rf">
    <h2>${esc(g.name)} · semaine ${esc(weekLabel(ws))}</h2>
    <div class="alert info">Membres contactés : <b>${w.fs.sent}/${w.fs.n}</b>${w.fs.sent < w.fs.n ? ` (<a href="#/suivi${ws !== weekStart() ? '?w=' + ws : ''}">compléter le suivi</a>)` : ''}<br>Présents à la rencontre : <b>${w.pres ?? 'aucune rencontre enregistrée'}</b><br>Dîmes et offrandes reçues : <b>${esc(fmtTot(sumBy(w.money7)))}</b></div>
    <label class="f"><span>Résumé de la semaine *</span><textarea name="summary" required placeholder="Comment s'est passée la rencontre ? Comment vont les membres ? Nouvelles importantes…"></textarea></label>
    <div class="f" style="margin-bottom:12px"><span class="small muted" style="font-weight:600">Membres qui ont besoin d'une attention particulière</span>
      ${w.list.map((m) => `<label class="chk"><input type="checkbox" name="att" value="${m.id}"> ${esc(fullName(m))}</label>`).join('')}</div>
    <label class="f"><span>Besoins de prière</span><textarea name="prayer"></textarea></label>
    <label class="f"><span>Difficultés rencontrées</span><textarea name="difficulties"></textarea></label>
    <label class="f"><span>Suggestions</span><textarea name="suggestions"></textarea></label>
    <div class="small muted" style="margin-bottom:10px">Un seul rapport par Bethel et par semaine (leader ou assistant). Une fois soumis, il ne peut plus être modifié.</div>
    <button class="btn full" type="submit">Soumettre le rapport</button>
  </form>`;
  return {
    title: 'Rapport du Bethel', back: true, html,
    bind(root) {
      const f = q('#rf', root);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', f);
        if (!confirmInline(b, 'Appuie encore pour confirmer l’envoi')) return;
        b.disabled = true;
        const rec = { bethel_id: bid, author_id: S.me.id, week_start: ws, contacted: w.fs.sent, members_count: w.fs.n, present_count: w.pres, summary: f.summary.value.trim(), attention_members: qa('input[name=att]:checked', f).map((x) => x.value), prayer: f.prayer.value.trim() || null, difficulties: f.difficulties.value.trim() || null, suggestions: f.suggestions.value.trim() || null };
        try { const r = (await must(sb.from('bethel_reports').insert(rec).select()))[0]; S.reports.push(r); toast('Rapport soumis. Merci !'); go('#/rapport/' + r.id); } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
    },
  };
}
function viewReportDetail(id) {
  const r = S.reports.find((x) => x.id === id);
  if (!r) return { title: 'Rapport', back: true, html: '<div class="empty">Rapport introuvable.</div>' };
  const p = profileById(r.author_id);
  const block = (t, v) => (v ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:600">${t}</div><div>${esc(v).replace(/\n/g, '<br>')}</div></div>` : '');
  const att = (r.attention_members || []).map(memberById).filter(Boolean);
  const m7 = contribsIn(r.week_start, addDays(r.week_start, 6), r.bethel_id);
  const html = `<div class="card"><h2>${esc(bName(r.bethel_id))}</h2><div class="small muted">Semaine ${esc(weekLabel(r.week_start))} · par ${esc(p?.full_name || '—')}${r.submitted_at ? ' · ' + new Date(r.submitted_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</div>
    <div class="alert info" style="margin-top:12px">Contactés : <b>${r.contacted ?? 0}/${r.members_count ?? '?'}</b> · Présents : <b>${r.present_count ?? '—'}</b><br>Dîmes et offrandes de la semaine : <b>${esc(fmtTot(sumBy(m7)))}</b></div>
    ${block('Résumé', r.summary)}
    ${att.length ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:600">Attention particulière</div>${att.map((m) => mLine(m)).join('')}</div>` : ''}
    ${block('Besoins de prière', r.prayer)}${block('Difficultés', r.difficulties)}${block('Suggestions', r.suggestions)}
    ${isSuper() ? '<hr><button class="btn danger sm" id="delr">Supprimer (permet de le refaire)</button>' : ''}</div>`;
  return {
    title: 'Rapport', back: true, html,
    bind(root) {
      const d = q('#delr', root);
      if (d) d.addEventListener('click', async () => { if (!confirmInline(d, 'Appuie encore pour supprimer')) return; try { await must(sb.from('bethel_reports').delete().eq('id', r.id)); S.reports = S.reports.filter((x) => x.id !== r.id); toast('Rapport supprimé'); go('#/rapports'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}

/* ---------- BETHELS ---------- */
function viewGroups(params) {
  const editId = params.edit; const isNew = params.new === '1' && canEditAll();
  const g = editId ? groupById(editId) : isNew ? {} : null;
  const canEditG = g && (isNew || canEditB(g.id)) && !readOnly();
  const list = canReadAll() ? groupsSorted() : scopeGroups();
  const html = `
  ${canEditG ? `<form class="card" id="gf"><h2>${isNew ? 'Nouveau Bethel' : 'Modifier : ' + esc(g.name)}</h2>
    <label class="f"><span>Nom du Bethel *</span><input type="text" name="name" value="${esc(g.name)}" required placeholder="ex. Bethel Nan Bouno"></label>
    <label class="f"><span>Zone / adresse de la rencontre</span><input type="text" name="zone" value="${esc(g.zone)}" placeholder="ex. Madeline, chez Fr. …"></label>
    <div class="row wrap"><label class="f grow"><span>Jour de réunion</span><select name="meeting_day">${opt('', '—', g.meeting_day)}${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((d) => opt(d, d, g.meeting_day)).join('')}</select></label>
    <label class="f grow"><span>Heure</span><input type="time" name="meeting_time" value="${esc(g.meeting_time)}"></label></div>
    <div class="btns"><button class="btn" type="submit">${isNew ? 'Créer le Bethel' : 'Enregistrer'}</button><a class="btn light" href="#/bethels">Annuler</a></div>
    ${!isNew && isSuper() ? '<hr><button type="button" class="btn danger sm" id="delg">Supprimer ce Bethel</button><div class="tiny muted" style="margin-top:6px">Impossible tant qu\'il a des membres ou des dîmes.</div>' : ''}
    ${isNew ? '<div class="tiny muted" style="margin-top:8px">Ensuite : ajoute ses membres (Membres → + Ajouter) en choisissant la fonction Leader ou Assistant(e) pour eux, puis crée leurs comptes (Menu → Comptes et rôles).</div>' : ''}</form>` : ''}
  ${canEditAll() && !g ? '<a class="btn full" style="margin-bottom:12px" href="#/bethels?new=1">+ Nouveau Bethel</a>' : ''}
  ${list.map((x) => { const ld = leaderOf(x.id), as = assistantOf(x.id); const n = S.members.filter((m) => m.bethel_id === x.id && m.status !== 'inactif').length; const accs = S.profiles.filter((p) => p.bethel_id === x.id && p.role !== 'inactif');
    return `<div class="card"><h2>${esc(x.name)} ${canEditB(x.id) && !readOnly() ? `<a class="btn sm ghost" href="#/bethels?edit=${x.id}">Modifier</a>` : ''}</h2>
    <dl class="kv"><dt>Rencontre</dt><dd>${[x.meeting_day, x.meeting_time].filter(Boolean).map(esc).join(' à ') || '—'}</dd><dt>Lieu</dt><dd>${esc(x.zone) || '—'}</dd>
    <dt>Leader</dt><dd>${ld ? `<a href="#/membre/${ld.id}">${esc(fullName(ld))}</a>` : '<span style="color:var(--warn)">à définir</span>'}</dd>
    <dt>Assistant(e)</dt><dd>${as ? `<a href="#/membre/${as.id}">${esc(fullName(as))}</a>` : '<span style="color:var(--warn)">à définir</span>'}</dd>
    <dt>Membres</dt><dd>${n}</dd><dt>Comptes</dt><dd>${accs.length ? accs.map((p) => esc(p.full_name || p.email) + ' <span class="muted">(' + esc(ROLES[p.role].split(' ')[0]) + ')</span>').join(', ') : '<span style="color:var(--warn)">aucun</span>'}</dd></dl>
    ${canReadAll() && S.groups.length > 1 ? `<button class="btn light sm" style="margin-top:10px" data-pick="${x.id}">Ouvrir ce Bethel</button>` : ''}</div>`; }).join('') || '<div class="empty">Aucun Bethel.</div>'}`;
  return {
    title: canEditAll() ? 'Les Bethels' : 'Mon Bethel', back: true, html,
    bind(root) {
      const gf = q('#gf', root);
      if (gf) gf.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = q('button[type=submit]', gf); b.disabled = true;
        const rec = { name: gf.name.value.trim(), zone: gf.zone.value.trim() || null, meeting_day: gf.meeting_day.value || null, meeting_time: gf.meeting_time.value || null };
        try {
          if (isNew) { const saved = (await must(sb.from('bethel_groups').insert(rec).select()))[0]; S.groups.push(saved); store.set('bethel.cur', saved.id); toast('Bethel créé'); }
          else { await must(sb.from('bethel_groups').update(rec).eq('id', g.id)); Object.assign(g, rec); toast('Bethel enregistré'); }
          go('#/bethels');
        } catch (err) { toast(errMsg(err), true); b.disabled = false; }
      });
      const dg = q('#delg', root);
      if (dg) dg.addEventListener('click', async () => { if (!confirmInline(dg, 'Appuie encore pour supprimer')) return; try { await must(sb.from('bethel_groups').delete().eq('id', g.id)); S.groups = S.groups.filter((x) => x.id !== g.id); toast('Bethel supprimé'); go('#/bethels'); } catch (err) { toast(errMsg(err), true); } });
    },
  };
}
document.addEventListener('click', (e) => { const el = e.target.closest('[data-pick]'); if (!el) return; e.preventDefault(); store.set('bethel.cur', el.dataset.pick); go('#/'); });

/* ---------- COMPTES ---------- */
let lastCred = null;
function credText(c) { return c.existing ? `Bethel TG Madeline – Suivi\nLien : ${location.origin + location.pathname}\nEmail : ${c.email}\nMot de passe : le même que pour l'app Youth.` : `Bethel TG Madeline – Suivi\nLien : ${location.origin + location.pathname}\nEmail : ${c.email}\nMot de passe provisoire : ${c.password}\n(Tu devras choisir ton propre mot de passe à la première connexion.)`; }
function viewAccounts(params) {
  if (!isAdmin()) return { title: 'Comptes', html: `<div class="alert warn">Accès réservé au Super Admin et au coordinateur.</div>` };
  const ed = params.edit && profileById(params.edit);
  const ps = S.profiles.filter((p) => !/@example\.test$/i.test(p.email || '')).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'fr'));
  const linked = new Set(S.profiles.map((p) => p.member_id).filter(Boolean));
  const roleOpts = (cur) => Object.entries(ROLES).filter(([k]) => k !== 'superadmin' || isSuper()).map(([k, l]) => opt(k, l, cur)).join('');
  const memberOpts = (bid, cur) => `<option value="">— Aucune fiche —</option>${S.members.filter((m) => m.bethel_id === bid && (!linked.has(m.id) || m.id === cur)).sort((a, b) => (a.fonction === 'membre') - (b.fonction === 'membre')).map((m) => opt(m.id, fullName(m) + (m.fonction !== 'membre' ? ` (${FONCTIONS[m.fonction]})` : ''), cur)).join('')}`;
  const form = (p) => `
    <label class="f"><span>Rôle *</span><select name="role" id="ar">${p && p.role === 'superadmin' && !isSuper() ? '<option value="superadmin">Super Admin</option>' : roleOpts(p ? p.role : 'leader')}</select></label>
    <label class="f" id="abw"><span>Bethel (pour leader / assistant)</span><select name="bethel_id" id="ab"><option value="">—</option>${groupsSorted().map((g) => opt(g.id, g.name, p?.bethel_id || (curB() !== 'all' ? curB() : ''))).join('')}</select></label>
    <label class="f" id="amw"><span>Sa fiche membre</span><select name="member_id" id="am">${memberOpts(p?.bethel_id || (curB() !== 'all' ? curB() : ''), p?.member_id)}</select><span class="tiny muted" style="display:block;margin-top:4px">La fiche de la personne elle-même (sert pour « Mes suivis »).</span></label>`;
  const html = `
  ${lastCred ? '' : resetRequestsCard()}
  ${lastCred ? `<div class="card"><h2>Identifiants à transmettre</h2><div class="cred">${esc(credText(lastCred))}</div>
    <div class="btns" style="margin-top:10px"><a class="btn ok sm" target="_blank" rel="noopener" href="https://wa.me/${lastCred.phone ? intlPhone(lastCred.phone) : ''}?text=${encodeURIComponent(credText(lastCred))}">${I.wa} Envoyer par WhatsApp</a><button class="btn light sm" id="copy">Copier</button><button class="btn light sm" id="hide">Masquer</button></div>
    ${lastCred.existing ? '<div class="tiny muted" style="margin-top:6px">Cette personne avait déjà un compte (app Youth) : elle se connecte avec le même mot de passe.</div>' : '<div class="tiny muted" style="margin-top:6px">Ce mot de passe ne sera plus affiché après.</div>'}</div>` : ''}
  ${ed ? `<form class="card" id="ef"><h2>Modifier : ${esc(ed.full_name || ed.email)}</h2><div class="small muted" style="margin-bottom:10px">${esc(ed.email)}</div>
    <label class="f"><span>Nom affiché</span><input type="text" name="full_name" value="${esc(ed.full_name)}"></label>${form(ed)}
    <div class="btns"><button class="btn" type="submit">Enregistrer</button><a class="btn light" href="#/comptes">Annuler</a></div>
    <hr><button type="button" class="btn ghost sm" id="rp">Réinitialiser le mot de passe</button><div class="tiny muted" style="margin-top:6px">Attention : c'est le même mot de passe que pour l'app Youth.</div></form>`
    : `<form class="card" id="cf"><h2>Donner accès à quelqu'un</h2>
    <label class="f"><span>Nom affiché *</span><input type="text" name="full_name" required></label>
    <label class="f"><span>Email *</span><input type="email" name="email" required autocomplete="off"></label>${form(null)}
    <label class="f"><span>Mot de passe provisoire</span><div class="row"><input type="text" name="password" value="${genPassword()}" minlength="8" class="grow"><button type="button" class="btn light sm" id="gen">↻</button></div><span class="tiny muted" style="display:block;margin-top:4px">Ignoré si la personne a déjà un compte Youth : elle garde son mot de passe.</span></label>
    <button class="btn full" type="submit">Créer l'accès</button></form>`}
  <div class="sec">Comptes (${ps.length})</div>
  <div class="list">${ps.map((p) => `<a class="li" href="#/comptes?edit=${p.id}"><span class="grow"><div class="nm">${esc(p.full_name || p.email)}</div><div class="sub">${esc(p.email)}${p.bethel_id ? ' · ' + esc(bName(p.bethel_id)) : ''}${['leader', 'assistant'].includes(p.role) && !p.member_id ? ' · <span style="color:var(--warn)">sans fiche</span>' : ''}</div></span><span class="b ${p.role === 'inactif' ? 'bad' : p.role === 'superadmin' ? 'acc' : 'pri'}">${esc(ROLES[p.role].split(' (')[0])}</span></a>`).join('')}</div>
  <div class="card small muted"><b>Rôles</b><br>• <b>Super Admin</b> : tout voir, tout modifier, gérer les comptes.<br>• <b>Coordinateur</b> : tous les Bethels, créer des Bethels et des comptes, corriger une dîme déjà remise.<br>• <b>Pasteur</b> : tout voir, sans rien modifier.<br>• <b>Leader / Assistant(e)</b> : seulement son Bethel — membres, présences, suivi, dîmes et rapport.<br>• <b>Inactif</b> : aucun accès.</div>`;
  return {
    title: 'Comptes et rôles', back: true, html,
    bind(root) {
      bindResetRequests(root);
      const cp = q('#copy', root); if (cp) cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(credText(lastCred)); toast('Copié'); } catch { toast('Copie impossible : sélectionne le texte', true); } });
      const hd = q('#hide', root); if (hd) hd.addEventListener('click', () => { lastCred = null; render(); });
      const ar = q('#ar', root), ab = q('#ab', root), am = q('#am', root);
      const sync = () => { const lead = ['leader', 'assistant'].includes(ar.value); q('#abw', root).style.display = lead ? '' : 'none'; q('#amw', root).style.display = lead ? '' : 'none'; };
      if (ar) { ar.addEventListener('change', sync); sync(); ab.addEventListener('change', () => { am.innerHTML = memberOpts(ab.value, null); }); }
      const vals = (f) => { const lead = ['leader', 'assistant'].includes(f.role.value); return { p_role: f.role.value, p_bethel_id: lead ? f.bethel_id.value || null : null, p_member_id: lead ? f.member_id.value || null : null }; };
      const cf = q('#cf', root);
      if (cf) {
        q('#gen', root).addEventListener('click', () => { cf.password.value = genPassword(); });
        am.addEventListener('change', () => { const m = memberById(am.value); if (m) { if (!cf.full_name.value) cf.full_name.value = fullName(m); if (!cf.email.value && m.email) cf.email.value = m.email; } });
        cf.addEventListener('submit', async (e) => {
          e.preventDefault(); const b = q('button[type=submit]', cf); b.disabled = true;
          const email = cf.email.value.trim().toLowerCase(), password = cf.password.value; const v = vals(cf);
          try {
            if (['leader', 'assistant'].includes(v.p_role) && !v.p_bethel_id) throw new Error('Choisis son Bethel.');
            const r = await must(sb.rpc('b_admin_create_user', { p_email: email, p_password: password, p_full_name: cf.full_name.value.trim(), ...v }));
            lastCred = { email, password, existing: !!r?.existing, phone: memberById(v.p_member_id)?.phone };
            S.profiles = await fetchAll('bethel_profiles', ['full_name']); toast('Accès créé'); render(); window.scrollTo(0, 0);
          } catch (err) { toast(errMsg(err), true); b.disabled = false; }
        });
      }
      const ef = q('#ef', root);
      if (ef) {
        ef.addEventListener('submit', async (e) => {
          e.preventDefault(); const b = q('button[type=submit]', ef); b.disabled = true;
          try {
            const v = vals(ef);
            if (['leader', 'assistant'].includes(v.p_role) && !v.p_bethel_id) throw new Error('Choisis son Bethel.');
            await must(sb.rpc('b_admin_update_user', { p_user_id: ed.id, p_full_name: ef.full_name.value.trim(), ...v }));
            S.profiles = await fetchAll('bethel_profiles', ['full_name']);
            if (ed.id === S.me.id) S.me = profileById(S.me.id);
            toast('Compte mis à jour'); go('#/comptes');
          } catch (err) { toast(errMsg(err), true); b.disabled = false; }
        });
        q('#rp', root).addEventListener('click', async (e) => {
          const b = e.currentTarget; if (!confirmInline(b, 'Appuie encore pour générer un nouveau mot de passe')) return;
          const pw = genPassword();
          try { await must(sb.rpc('b_admin_reset_password', { p_user_id: ed.id, p_password: pw })); lastCred = { email: ed.email, password: pw, phone: memberById(ed.member_id)?.phone }; toast('Mot de passe réinitialisé'); go('#/comptes'); } catch (err) { toast(errMsg(err), true); }
        });
      }
    },
  };
}

/* ---------- MON COMPTE ---------- */
function viewMyAccount() {
  const m = memberById(myMemberId());
  const html = `<div class="card"><h2>${esc(S.me.full_name || '')}</h2><dl class="kv"><dt>Email</dt><dd>${esc(S.me.email || S.user.email)}</dd><dt>Rôle</dt><dd>${esc(ROLES[role()])}</dd>${S.me.bethel_id ? `<dt>Bethel</dt><dd>${esc(bName(S.me.bethel_id))}</dd>` : ''}<dt>Ma fiche</dt><dd>${m ? `<a href="#/membre/${m.id}">${esc(fullName(m))}</a>` : '—'}</dd></dl></div>
  <div class="card"><h2>Changer mon mot de passe</h2><div class="tiny muted" style="margin:-4px 0 10px">Il change aussi pour l'app Youth si tu l'utilises.</div>${passwordForm('mpf')}</div>
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
  const html = `<div class="card"><h2>Exporter les données</h2><p class="small muted">Fichiers CSV (séparateur « ; »), ouvrables dans Excel ou Google Sheets. Périmètre : ${esc(curB() === 'all' ? 'tous les Bethels' : bName(curB()))}.</p>
    <div class="stack"><button class="btn full" data-x="dimes">Dîmes et offrandes</button><button class="btn full ghost" data-x="members">Liste des membres</button><button class="btn full ghost" data-x="att">Présences (une colonne par rencontre)</button><button class="btn full ghost" data-x="fu">Suivis hebdomadaires</button><button class="btn full ghost" data-x="rep">Rapports</button></div></div>`;
  return {
    title: 'Export', back: true, html,
    bind(root) {
      on(root, '[data-x]', 'click', (e, el) => {
        const d = today(); const t = el.dataset.x; const ms = scopeMembers(true);
        if (t === 'dimes') download(`dimes_offrandes_${d}.csv`, csv([['Date', 'Bethel', 'Membre', 'Type', 'Montant', 'Devise', 'Mode', 'Note', 'Remis le', 'Saisi par'], ...S.contribs.filter((c) => inScope(c.bethel_id)).sort((a, b) => a.date.localeCompare(b.date)).map((c) => [c.date, bName(c.bethel_id), c.member_id ? fullName(memberById(c.member_id)) : 'Collecte / anonyme', CKINDS[c.kind], String(c.amount).replace('.', ','), c.currency, METHODS[c.method], c.note, c.remitted_at, profileById(c.created_by)?.full_name])]));
        if (t === 'members') download(`membres_bethel_${d}.csv`, csv([['Bethel', 'Prénom', 'Nom', 'Fonction', 'Téléphone', 'Email', 'Adresse', 'Naissance', 'Sexe', 'Baptisé', 'Statut', 'Taux présence %'], ...ms.map((m) => [bName(m.bethel_id), m.first_name, m.last_name, FONCTIONS[m.fonction], m.phone, m.email, m.address, m.birth_date, m.gender, m.baptized == null ? '' : m.baptized ? 'Oui' : 'Non', STATUS[m.status], presenceStats(m).rate ?? ''])]));
        if (t === 'att') { const ss = scopeSessions().reverse(); download(`presences_bethel_${d}.csv`, csv([['Bethel', 'Prénom', 'Nom', ...ss.map((s) => `${KIND_SHORT[s.kind]} ${s.date}${curB() === 'all' ? ' ' + bName(s.bethel_id) : ''}`)], ...ms.map((m) => [bName(m.bethel_id), m.first_name, m.last_name, ...ss.map((s) => { const a = attOf(s.id, m.id); return a ? (a.present ? 'P' : 'A') : ''; })])])); }
        if (t === 'fu') download(`suivis_bethel_${d}.csv`, csv([['Semaine', 'Bethel', 'Membre', 'Contacté', 'A répondu', 'Note'], ...S.followups.filter((f) => memberById(f.member_id) && inScope(memberById(f.member_id).bethel_id)).sort((a, b) => b.week_start.localeCompare(a.week_start)).map((f) => { const m = memberById(f.member_id); return [f.week_start, bName(m.bethel_id), fullName(m), f.sent ? 'Oui' : 'Non', f.replied == null ? '' : f.replied ? 'Oui' : 'Non', f.note]; })]));
        if (t === 'rep') download(`rapports_bethel_${d}.csv`, csv([['Semaine', 'Bethel', 'Auteur', 'Contactés', 'Membres', 'Présents', 'Résumé', 'Attention', 'Prière', 'Difficultés', 'Suggestions'], ...S.reports.filter((r) => inScope(r.bethel_id)).map((r) => [r.week_start, bName(r.bethel_id), profileById(r.author_id)?.full_name, r.contacted, r.members_count, r.present_count, r.summary, (r.attention_members || []).map((x) => fullName(memberById(x))).join(', '), r.prayer, r.difficulties, r.suggestions])]));
        toast('Fichier téléchargé');
      });
    },
  };
}

/* ---------- AIDE ---------- */
function viewHelp() {
  const html = `<div class="card small"><h2>Comment ça marche</h2>
  <p><b>Dîmes</b> : après la rencontre, touche « + Nouvelle dîme / offrande », choisis le type, le membre et le montant. Une offrande collective peut être enregistrée sans membre ; une dîme, jamais. Après l'enregistrement, tu peux envoyer un reçu WhatsApp au membre.</p>
  <p><b>Remise à l'église</b> : quand le leader remet l'argent à la trésorerie, il ouvre Dîmes → « À remettre » → « Marquer tout remis ». Les entrées remises sont verrouillées : seul le coordinateur peut les corriger. Ça protège tout le monde.</p>
  <p><b>Présences</b> : ouvre la rencontre du jour (type + date), puis appuie sur <b>P</b> ou <b>A</b> pour chaque membre. Appuie à nouveau pour effacer. Note le thème et le nombre de visiteurs.</p>
  <p><b>Suivi</b> : chaque semaine (lundi → dimanche), contacte chaque membre (le bouton vert ouvre WhatsApp avec un message prêt), puis coche « Contacté ». Le leader et l'assistant peuvent se partager les membres (fiche → Modifier → « Suivi par »).</p>
  <p><b>Rapport</b> : un rapport par Bethel et par semaine, rédigé par le leader ou l'assistant. Les chiffres (contactés, présents, dîmes) se remplissent tout seuls.</p>
  <p><b>À risque</b> : un membre absent aux 3 dernières rencontres apparaît dans « À relancer ».</p>
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
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.user = null; S.me = null; S.loaded = false; render(); } });
})();
