// Sostituisce fetch globale con risposte finte, per testare la pipeline senza rete.
// Caricato con: node --import ./scripts/test/fixtures/mock-fetch.js scripts/fetch-events.js
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input) => {
  const url = new URL(String(input));

  if (url.hostname === 'app.ticketmaster.com' && url.pathname.endsWith('/attractions.json')) {
    return json({ _embedded: { attractions: [
      { id: 'OMONIMO', name: 'The Cure Tribute', externalLinks: {} },
      { id: 'K8vZ917', name: 'The Cure', externalLinks: { spotify: [{ url: 'https://open.spotify.com/artist/7bu3H8JO7d0UbMoVzbo70s' }] } },
    ] } });
  }
  if (url.hostname === 'app.ticketmaster.com' && url.pathname.endsWith('/events.json')) {
    return json({
      page: { totalPages: 1 },
      _embedded: { events: [
        {
          id: 'tm1', name: 'The Cure', url: 'https://www.ticketmaster.it/event/tm1',
          dates: { start: { localDate: inDays(30), localTime: '21:00:00' }, timezone: 'Europe/Rome', status: { code: 'onsale' } },
          classifications: [{ segment: { name: 'Music' } }],
          _embedded: { venues: [{ name: 'Unipol Forum', address: { line1: 'Via G. di Vittorio 6' }, city: { name: 'Assago' },
            country: { name: 'Italy', countryCode: 'IT' }, location: { latitude: '45.4103', longitude: '9.1349' } }] },
        },
        {
          id: 'tm2', name: 'The Cure', url: 'https://www.ticketmaster.de/event/tm2',
          dates: { start: { localDate: inDays(40) }, status: { code: 'onsale' } },
          classifications: [{ segment: { name: 'Music' } }],
          _embedded: { venues: [{ name: 'Club Senza Indirizzo', city: { name: 'Berlin' }, country: { name: 'Germany', countryCode: 'DE' } }] },
        },
        {
          id: 'tm3', name: 'Parking: The Cure', url: 'https://x', dates: { start: { localDate: inDays(30) } },
          _embedded: { venues: [{ name: 'Unipol Forum', city: { name: 'Assago' } }] },
        },
      ] },
    });
  }
  if (url.hostname === 'rest.bandsintown.com') {
    return json({ error: 'forbidden' }, 403); // sorgente in errore: deve scattare il fallback
  }
  if (url.hostname === 'nominatim.openstreetmap.org') {
    // Solo la ricerca per città trova un risultato: verifica il fallback "approssimativo".
    if (url.searchParams.get('city') === 'Berlin' && !url.searchParams.get('street')) {
      return json([{ lat: '52.52', lon: '13.405' }]);
    }
    return json([]);
  }
  throw new Error(`URL non previsto nel mock: ${url}`);
};
