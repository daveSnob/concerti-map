// Configurazione del frontend.
export const CONFIG = {
  // Client ID dell'app Spotify (è pubblico per definizione: il flusso PKCE non usa segreti).
  // Lascialo vuoto per nascondere il pulsante "Accedi con Spotify".
  spotifyClientId: '',

  // Redirect URI registrato nella dashboard Spotify. Se null usa l'indirizzo della pagina
  // (es. https://utente.github.io/concerti-map/).
  spotifyRedirectUri: null,

  // Dopo quanti giorni senza aggiornamenti mostrare un avviso "dati non aggiornati".
  staleAfterDays: 3,

  // Quanti eventi mostrare nella lista prima del pulsante "Mostra altri".
  listPageSize: 150,
};
