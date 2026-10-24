// Finestra con gli artisti seguiti su Spotify che non sono ancora monitorati dal sito,
// e pulsante per scaricare un artists.json aggiornato da committare nel repository.
import { logout } from './spotify.js';
import { esc, keyOf, collator } from './utils.js';

/** Unisce gli artisti di artists.json con quelli seguiti, senza doppioni. */
async function buildArtistsJson(followed) {
  let file = { artists: [], exclude: [] };
  try {
    const res = await fetch('data/artists.json', { cache: 'no-cache' });
    if (res.ok) file = await res.json();
  } catch { /* file assente: si parte da zero */ }

  const known = new Set((file.artists ?? []).flatMap((a) => [a.spotifyId, keyOf(a.name ?? a)]));
  const excluded = new Set((file.exclude ?? []).map(keyOf));
  for (const a of followed) {
    if (!known.has(a.spotifyId) && !known.has(keyOf(a.name)) && !excluded.has(keyOf(a.name))) {
      file.artists.push({ name: a.name, spotifyId: a.spotifyId });
    }
  }
  file.artists.sort((a, b) => collator.compare(a.name ?? a, b.name ?? b));
  return `${JSON.stringify(file, null, 2)}\n`;
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param followed artisti seguiti [{ name, spotifyId }]
 * @param tracked artisti già monitorati (campo `artists` di events.json)
 */
export function openSpotifyPanel(followed, tracked) {
  const dialog = document.getElementById('spotify-dialog');
  const trackedKeys = new Set(tracked.flatMap((a) => [a.spotifyId, a.key]));
  const missing = followed
    .filter((a) => !trackedKeys.has(a.spotifyId) && !trackedKeys.has(keyOf(a.name)))
    .sort((a, b) => collator.compare(a.name, b.name));

  dialog.innerHTML = `
    <form method="dialog" class="dialog-body">
      <header class="panel-header">
        <h2 class="panel-title">Spotify: ${followed.length} artisti seguiti</h2>
        <button class="btn btn-icon" value="close" aria-label="Chiudi">✕</button>
      </header>
      ${missing.length ? `
        <p>${missing.length} artisti che segui non sono ancora monitorati dall'aggiornamento automatico:</p>
        <ul class="chip-list">${missing.map((a) => `<li class="chip">${esc(a.name)}</li>`).join('')}</ul>
        <p class="muted">Scarica il file aggiornato e sostituisci <code>data/artists.json</code> nel repository
          (oppure configura i secret Spotify nella GitHub Action, vedi README).</p>
        <button type="button" class="btn btn-primary" data-download>Scarica artists.json aggiornato</button>`
      : '<p>Tutti gli artisti che segui sono già monitorati. 🎉</p>'}
      <footer class="dialog-footer">
        <button type="button" class="btn btn-ghost" data-logout>Esci da Spotify</button>
      </footer>
    </form>`;

  dialog.querySelector('[data-download]')?.addEventListener('click', async () => {
    download('artists.json', await buildArtistsJson(followed));
  });
  dialog.querySelector('[data-logout]').addEventListener('click', () => {
    logout();
    location.reload();
  });
  dialog.showModal();
}
