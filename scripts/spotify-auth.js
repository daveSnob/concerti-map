#!/usr/bin/env node
// Helper da eseguire UNA VOLTA sul proprio computer per ottenere il refresh token Spotify
// da salvare nel secret SPOTIFY_REFRESH_TOKEN della GitHub Action.
//
// Uso:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy npm run spotify-auth
//   (su PowerShell: $env:SPOTIFY_CLIENT_ID="xxx"; $env:SPOTIFY_CLIENT_SECRET="yyy"; npm run spotify-auth)
//
// Prerequisito: nella dashboard Spotify aggiungi il Redirect URI
//   http://127.0.0.1:8888/callback
// (Spotify accetta http solo con indirizzi loopback espliciti, non "localhost").
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

if (!clientId || !clientSecret) {
  console.error('Imposta SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET prima di eseguire lo script.');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authorizeUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  scope: 'user-follow-read',
  redirect_uri: REDIRECT_URI,
  state,
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }

  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
    res.writeHead(400).end('Richiesta non valida o autorizzazione negata.');
    return;
  }

  // Scambio del codice con access + refresh token (flusso Authorization Code con secret).
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: REDIRECT_URI }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    res.writeHead(500).end('Errore nello scambio del codice: guarda il terminale.');
    console.error(data);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Fatto! Puoi chiudere questa scheda e tornare al terminale.');
    console.log('\n✅ Refresh token (salvalo nel secret SPOTIFY_REFRESH_TOKEN):\n');
    console.log(data.refresh_token);
    console.log('');
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Apri questo indirizzo nel browser e accetta l\'autorizzazione:\n');
  console.log(authorizeUrl);
});
