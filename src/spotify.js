// Login Spotify direttamente dal browser con Authorization Code + PKCE (nessun segreto
// nel codice) e lettura degli artisti seguiti (scope user-follow-read).
// Usi nel sito:
//  - filtro "Solo artisti che seguo";
//  - elenco degli artisti seguiti non ancora monitorati, con download di artists.json aggiornato.
import { CONFIG } from './config.js';
import { keyOf } from './utils.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const K = { verifier: 'sp:verifier', state: 'sp:state', token: 'sp:token', return: 'sp:return' };

// sessionStorage "sicuro" (può essere bloccato in alcune modalità del browser).
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignorato */ } },
  remove: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignorato */ } },
};

export const isConfigured = () => Boolean(CONFIG.spotifyClientId);
const redirectUri = () => CONFIG.spotifyRedirectUri ?? `${location.origin}${location.pathname}`;

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(bytes = 48) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** code_challenge = BASE64URL(SHA256(code_verifier)), come richiesto da PKCE. */
async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Avvia il login: reindirizza alla pagina di autorizzazione Spotify. */
export async function login() {
  const verifier = randomString();
  const state = randomString(16);
  session.set(K.verifier, verifier);
  session.set(K.state, state);
  session.set(K.return, location.search); // per ripristinare i filtri al ritorno
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.spotifyClientId,
    scope: 'user-follow-read',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  location.assign(`${AUTH_URL}?${params}`);
}

export function logout() {
  Object.values(K).forEach(session.remove);
}

/**
 * Da chiamare all'avvio: se l'URL contiene ?code=... (ritorno da Spotify) scambia il codice
 * con un token e ripulisce l'indirizzo. Restituisce un messaggio d'errore o null.
 */
export async function handleRedirect() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;

  const restore = session.get(K.return) ?? '';
  history.replaceState(null, '', `${location.pathname}${restore}`);
  session.remove(K.return);

  if (p.has('error')) return `Accesso Spotify annullato (${p.get('error')}).`;
  if (p.get('state') !== session.get(K.state)) return 'Risposta Spotify non valida (state diverso): riprova.';

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.get('code'),
      redirect_uri: redirectUri(),
      client_id: CONFIG.spotifyClientId,
      code_verifier: session.get(K.verifier) ?? '',
    }),
  });
  session.remove(K.verifier);
  session.remove(K.state);
  if (!res.ok) return `Login Spotify fallito (HTTP ${res.status}).`;
  const data = await res.json();
  session.set(K.token, JSON.stringify({
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }));
  return null;
}

/** Token valido corrente, oppure null se assente/scaduto (basta rifare il login). */
export function getToken() {
  try {
    const t = JSON.parse(session.get(K.token) ?? 'null');
    return t && t.expiresAt > Date.now() ? t.accessToken : null;
  } catch {
    return null;
  }
}

/** Tutti gli artisti seguiti, seguendo la paginazione a cursore. */
export async function fetchFollowedArtists() {
  const token = getToken();
  if (!token) return null;
  const artists = [];
  let url = `${API}/me/following?type=artist&limit=50`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { logout(); throw new Error('Sessione Spotify scaduta: accedi di nuovo.'); }
    if (res.status === 403) {
      // In Development Mode solo gli utenti aggiunti nella dashboard (max 5) possono usare l'app.
      throw new Error('Spotify ha negato l\'accesso: il tuo account deve essere tra gli utenti autorizzati dell\'app (Development Mode).');
    }
    if (!res.ok) throw new Error(`Errore Spotify (HTTP ${res.status}).`);
    const data = await res.json();
    artists.push(...data.artists.items.map((a) => ({ name: a.name, spotifyId: a.id })));
    url = data.artists.next;
  }
  return artists;
}

/** Insieme di id e chiavi-nome, per confrontare gli artisti seguiti con gli eventi. */
export function followedSet(artists) {
  return new Set(artists.flatMap((a) => [a.spotifyId, keyOf(a.name)]));
}
