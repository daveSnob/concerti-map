// Accesso all'API Spotify dalla GitHub Action.
// Usa un refresh token (ottenuto una volta con `npm run spotify-auth`) salvato nei secret:
// così l'Action può leggere gli artisti seguiti senza login interattivo.
import { fetchJson } from './http.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

/** Scambia il refresh token con un access token valido per circa un'ora. */
async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const data = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    // Con il flusso Authorization Code "classico" Spotify di norma non ruota il token;
    // se succede, avvisiamo: il secret andrà aggiornato.
    console.warn('⚠️  Spotify ha restituito un nuovo refresh token: aggiorna il secret SPOTIFY_REFRESH_TOKEN.');
  }
  return data.access_token;
}

/**
 * Restituisce tutti gli artisti seguiti dall'utente (endpoint "Get Followed Artists",
 * scope user-follow-read). La paginazione è a cursore: si segue il campo `next`.
 */
export async function fetchFollowedArtists(credentials) {
  const token = await getAccessToken(credentials);
  const artists = [];
  let url = `${API}/me/following?type=artist&limit=50`;
  while (url) {
    const data = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
    for (const a of data.artists.items) {
      artists.push({ name: a.name, spotifyId: a.id });
    }
    url = data.artists.next;
  }
  return artists;
}
