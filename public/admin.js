'use strict';

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginButton = document.getElementById('login-submit');
const sessionList = document.getElementById('session-list');
const emptyState = document.getElementById('empty-state');
const dashboardError = document.getElementById('dashboard-error');
const searchInput = document.getElementById('session-search');
let csrfToken = '';
let sessions = [];
let pollTimer = null;

const statusNames = {
  starting: 'Préparation', connecting: 'Connexion en cours', pairing: 'À confirmer sur WhatsApp', connected: 'Disponible',
  reconnecting: 'Nouvelle tentative', disconnecting: 'Déconnexion en cours', disconnected: 'Déconnecté', failed: 'À contrôler',
};

function formatDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return '—'; }
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) { amount /= 1000; unit += 1; }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(amount)} ${units[unit]}`;
}

function renderStorage(storage) {
  const used = document.getElementById('storage-used');
  const detail = document.getElementById('storage-detail');
  if (!storage || storage.available !== true || !Number.isFinite(Number(storage.totalBytes))) {
    used.textContent = '—';
    detail.textContent = 'Information indisponible pour le moment';
    return;
  }
  used.textContent = formatBytes(storage.usedBytes);
  detail.textContent = `sur ${formatBytes(storage.totalBytes)} au total · ${formatBytes(storage.freeBytes)} libres`;
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  if (options.method && options.method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || '');
  return data;
}

function showLogin(message = '') {
  if (pollTimer) clearTimeout(pollTimer);
  csrfToken = '';
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginError.textContent = message;
  loginError.hidden = !message;
}

function makeSessionCard(session) {
  const card = document.createElement('article');
  card.className = 'session-card';
  const identity = document.createElement('div');
  const phone = document.createElement('div');
  phone.className = 'session-number';
  phone.textContent = `+${session.phone || '—'}`;
  identity.append(phone);
  const linked = document.createElement('div');
  linked.className = 'session-sub';
  linked.textContent = session.linkedNumber && session.linkedNumber !== session.phone ? `Compte WhatsApp : +${session.linkedNumber}` : `Ajouté le ${formatDate(session.createdAt)}`;
  identity.append(linked);
  card.append(identity);

  const status = document.createElement('span');
  status.className = `status-badge status-${session.status || 'starting'}`;
  status.textContent = statusNames[session.status] || 'En cours';
  card.append(status);

  const details = document.createElement('div');
  details.className = 'session-date';
  const updated = document.createElement('div');
  updated.className = 'session-sub';
  updated.textContent = `Dernière activité : ${formatDate(session.updatedAt)}`;
  details.append(updated);
  if (session.connectedAt) {
    const connected = document.createElement('div');
    connected.className = 'session-sub';
    connected.textContent = `Disponible depuis : ${formatDate(session.connectedAt)}`;
    details.append(connected);
  }
  card.append(details);

  if (session.lastError) {
    const error = document.createElement('div');
    error.className = 'session-error';
    error.textContent = session.status === 'disconnected' ? 'Ce compte est déconnecté. Vous pouvez le retirer de la liste.' : 'La liaison a rencontré un souci. Vous pouvez réessayer ou retirer ce numéro, puis le relier à nouveau.';
    card.append(error);
  }

  const actions = document.createElement('div');
  actions.className = 'session-actions';
  if (session.status === 'disconnected') {
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Retirer';
    remove.addEventListener('click', () => runAction(session, 'delete'));
    actions.append(remove);
  } else {
    const restart = document.createElement('button');
    restart.type = 'button'; restart.className = 'secondary-button'; restart.textContent = 'Réessayer';
    restart.addEventListener('click', () => runAction(session, 'restart'));
    actions.append(restart);
    const disconnect = document.createElement('button');
    disconnect.type = 'button'; disconnect.className = 'danger-button'; disconnect.textContent = 'Interrompre';
    disconnect.disabled = session.status === 'disconnecting';
    disconnect.addEventListener('click', () => runAction(session, 'disconnect'));
    actions.append(disconnect);
  }
  card.append(actions);
  return card;
}

function renderSessions() {
  const query = searchInput.value.replace(/\D/g, '');
  const filtered = sessions.filter((session) => !query || String(session.phone).includes(query));
  sessionList.replaceChildren(...filtered.map(makeSessionCard));
  emptyState.hidden = filtered.length > 0;
  const active = sessions.filter((session) => !['disconnected', 'failed'].includes(session.status)).length;
  const connected = sessions.filter((session) => session.status === 'connected').length;
  const attention = sessions.filter((session) => ['reconnecting', 'failed', 'disconnecting'].includes(session.status)).length;
  document.getElementById('active-count').textContent = String(active);
  document.getElementById('connected-count').textContent = String(connected);
  document.getElementById('attention-count').textContent = String(attention);
}

async function refresh() {
  try {
    const data = await request('/api/admin/sessions');
    sessions = Array.isArray(data.sessions) ? data.sessions : [];
    document.getElementById('capacity-label').textContent = `sur ${data.capacity} au total`;
    renderStorage(data.storage);
    document.getElementById('updated-label').textContent = `Mis à jour à ${new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date())}`;
    dashboardError.hidden = true;
    renderSessions();
    pollTimer = setTimeout(refresh, 5000);
  } catch (error) {
    if (/Connexion admin requise/.test(error.message)) return showLogin('Votre accès a expiré. Reconnectez-vous.');
    dashboardError.textContent = 'La liste ne peut pas être mise à jour pour le moment. Réessayez dans un instant.';
    dashboardError.hidden = false;
    pollTimer = setTimeout(refresh, 8000);
  }
}

async function runAction(session, action) {
  const phone = `+${session.phone}`;
  if (action === 'disconnect' && !window.confirm(`Interrompre la liaison du compte ${phone} ? Il faudra le relier à nouveau à BestBot pour le rendre disponible.`)) return;
  if (action === 'delete' && !window.confirm(`Retirer définitivement ${phone} de la liste ? Les informations enregistrées pour ce compte seront effacées.`)) return;
  try {
    await request(`/api/admin/sessions/${encodeURIComponent(session.id)}/${action}`, { method: 'POST', body: '{}' });
    dashboardError.textContent = action === 'disconnect' ? `L’interruption de ${phone} a été demandée.` : action === 'delete' ? `${phone} a été retiré de la liste.` : `Une nouvelle tentative est lancée pour ${phone}.`;
    dashboardError.hidden = false;
    setTimeout(refresh, 700);
  } catch {
    dashboardError.textContent = 'Impossible de faire ce changement pour le moment. Réessayez dans un instant.';
    dashboardError.hidden = false;
  }
}

async function openDashboard() {
  try {
    const me = await request('/api/admin/me');
    csrfToken = me.csrfToken;
    loginView.hidden = true;
    dashboardView.hidden = false;
    await refresh();
  } catch { showLogin(); }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginError.hidden = true;
  try {
    const data = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value }) });
    csrfToken = data.csrfToken;
    document.getElementById('password').value = '';
    loginView.hidden = true;
    dashboardView.hidden = false;
    await refresh();
  } catch (error) {
    loginError.textContent = /incorrect|invalid|identifiant|mot de passe/i.test(error.message) ? 'Nom d’utilisateur ou mot de passe incorrect.' : 'Impossible d’ouvrir votre espace pour le moment. Réessayez dans un instant.';
    loginError.hidden = false;
  } finally { loginButton.disabled = false; }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try { await request('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin();
});
document.getElementById('refresh-button').addEventListener('click', refresh);
searchInput.addEventListener('input', renderSessions);
openDashboard();
