'use strict';

const form = document.getElementById('pair-form');
const phoneInput = document.getElementById('phone');
const submitButton = document.getElementById('pair-submit');
const result = document.getElementById('pair-result');
const resultStatus = document.getElementById('result-status');
const codeArea = document.getElementById('code-area');
const codeValue = document.getElementById('pair-code');
const expiry = document.getElementById('expiry');
const errorText = document.getElementById('result-error');
const newRequestButton = document.getElementById('new-request');
const copyButton = document.getElementById('copy-code');
let activePairing = null;
let pollTimer = null;
let countdownTimer = null;
const STORAGE_KEY = 'bestbot-pairing-request';

function friendlyError(message) {
  const text = String(message || '').toLowerCase();
  if (/(capacity|maximum|limite|complet|full|too many|capacité de sessions|places disponibles)/.test(text)) {
    return 'Toutes les places disponibles sont prises pour le moment. Réessayez un peu plus tard.';
  }
  if (/(trop de demandes|rate|429|réessaie plus tard)/.test(text)) {
    return 'Trop de tentatives rapprochées. Attendez quelques minutes avant de redemander un code.';
  }
  if (/(déjà active|en cours|session)/.test(text)) {
    return 'Une tentative est déjà en cours pour ce numéro. Cliquez sur Recommencer une seule fois.';
  }
  if (/(connection terminated|connexion fermée|reconnexion|websocket)/.test(text)) {
    return 'La connexion WhatsApp a été interrompue. Gardez cette page ouverte : une nouvelle tentative va être effectuée.';
  }
  if (/(configuration|service n’est pas|service n'est pas)/.test(text)) {
    return 'Le service est temporairement indisponible. Réessayez plus tard.';
  }
  if (/(invalid|invalide|numéro|phone|téléphone)/.test(text)) {
    return 'Vérifiez votre numéro, puis réessayez.';
  }
  if (/(expired|expire|introuvable|not found)/.test(text)) {
    return 'Le délai est écoulé. Demande un nouveau code.';
  }
  return 'La liaison n’a pas abouti. Vérifiez votre numéro et réessayez dans un instant.';
}

function setPendingMessage(text) {
  resultStatus.replaceChildren();
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const message = document.createElement('span');
  message.textContent = text;
  resultStatus.append(spinner, message);
}

function showError(message) {
  resultStatus.hidden = true;
  codeArea.hidden = true;
  errorText.textContent = friendlyError(message);
  errorText.hidden = false;
  newRequestButton.textContent = activePairing ? 'Réessayer' : 'Recommencer';
  newRequestButton.hidden = false;
}

function resetPairing() {
  if (pollTimer) clearTimeout(pollTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  sessionStorage.removeItem(STORAGE_KEY);
  activePairing = null;
  codeValue.textContent = '••••-••••';
  result.hidden = true;
  form.hidden = false;
  submitButton.disabled = false;
  submitButton.querySelector('span').textContent = 'Recevoir le code';
  errorText.hidden = true;
  codeArea.hidden = true;
  resultStatus.hidden = false;
  setPendingMessage('Préparation de votre liaison…');
  newRequestButton.hidden = true;
  newRequestButton.textContent = 'Recommencer';
  newRequestButton.disabled = false;
}

function renderCode(code, expiresAt) {
  const hasVisibleCode = codeValue.textContent && !codeValue.textContent.includes('•');
  if (!code) {
    if (hasVisibleCode) {
      // WhatsApp peut renvoyer null pendant la rotation : garder le dernier code
      // visible évite un écran vide entre deux réponses de polling.
      codeArea.hidden = false;
      resultStatus.hidden = true;
      expiry.textContent = 'Actualisation du code… gardez cette page ouverte.';
      return;
    }
    codeValue.textContent = '••••-••••';
    codeArea.hidden = true;
    resultStatus.hidden = false;
    setPendingMessage('Votre code arrive dans un instant…');
    expiry.textContent = 'Gardez cette page ouverte : votre code apparaîtra ici.';
    return;
  }
  codeValue.textContent = code;
  codeArea.hidden = false;
  resultStatus.hidden = true;
  let seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  expiry.textContent = `Votre code change dans ${seconds} s`;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expiry.textContent = seconds ? `Votre code change dans ${seconds} s` : 'Un nouveau code arrive… gardez cette page ouverte.';
  }, 1000);
}

async function pollStatus() {
  if (!activePairing) return;
  try {
    const response = await fetch(`/api/pairings/${encodeURIComponent(activePairing.id)}`, {
      headers: { Authorization: `Bearer ${activePairing.token}` },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '');
    errorText.hidden = true;
    if (data.status === 'connected' || data.linked) {
      if (pollTimer) clearTimeout(pollTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      codeArea.hidden = true;
      resultStatus.hidden = false;
      resultStatus.replaceChildren();
      const check = document.createElement('span');
      check.className = 'trust-icon';
      check.textContent = '✓';
      const message = document.createElement('span');
      message.textContent = 'C’est bon ! Votre WhatsApp est maintenant relié à BestBot.';
      resultStatus.append(check, message);
      newRequestButton.textContent = 'Arrêter cette liaison';
      newRequestButton.hidden = false;
      return;
    }
    if (data.status === 'failed' || data.status === 'disconnected') {
      showError(data.lastError || '');
      return;
    }
    const expiresAt = data.codeExpiresAt || Date.now();
    renderCode(data.pairingCode, expiresAt);
    // Interroger le serveur plus fréquemment juste avant l’expiration afin
    // d’afficher automatiquement le nouveau code dès qu’il est disponible.
    const untilExpiry = Math.max(250, expiresAt - Date.now() - 1000);
    pollTimer = setTimeout(pollStatus, Math.min(1800, untilExpiry));
  } catch (error) {
    showError(error.message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = phoneInput.value.replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) {
    phoneInput.setCustomValidity('Vérifiez votre numéro : il doit comporter entre 8 et 15 chiffres.');
    phoneInput.reportValidity();
    return;
  }
  phoneInput.setCustomValidity('');
  submitButton.disabled = true;
  submitButton.querySelector('span').textContent = 'Préparation…';
  result.hidden = false;
  resultStatus.hidden = false;
  setPendingMessage('Préparation de votre liaison…');
  codeArea.hidden = true;
  errorText.hidden = true;
  newRequestButton.hidden = true;
  try {
    const response = await fetch('/api/pairings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }), cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '');
    activePairing = { id: data.id, token: data.token };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activePairing));
    form.hidden = true;
    submitButton.querySelector('span').textContent = 'Demande reçue';
    pollStatus();
  } catch (error) {
    showError(error.message);
    submitButton.disabled = false;
    submitButton.querySelector('span').textContent = 'Recevoir le code';
  }
});

phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 15);
  phoneInput.setCustomValidity('');
});
copyButton.addEventListener('click', async () => {
  const value = codeValue.textContent;
  if (!value || value.includes('•')) return;
  try {
    await navigator.clipboard.writeText(value);
    copyButton.textContent = 'Copié';
    setTimeout(() => { copyButton.textContent = 'Copier'; }, 1500);
  } catch { copyButton.textContent = 'Copie impossible'; }
});
newRequestButton.addEventListener('click', async () => {
  if (!activePairing) return resetPairing();
  newRequestButton.disabled = true;
  try {
    const response = await fetch(`/api/pairings/${encodeURIComponent(activePairing.id)}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${activePairing.token}` }, cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '');
    resetPairing();
  } catch (error) {
    showError(error.message);
    newRequestButton.disabled = false;
  }
});

try {
  const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && /^[0-9a-f-]{36}$/i.test(saved.id || '') && typeof saved.token === 'string' && saved.token.length >= 32) {
    activePairing = saved;
    form.hidden = true;
    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Liaison en cours';
    result.hidden = false;
    newRequestButton.hidden = true;
    pollStatus();
  }
} catch { sessionStorage.removeItem(STORAGE_KEY); }
