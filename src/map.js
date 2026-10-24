// Mappa Leaflet con un marker per locale e raggruppamento (cluster) dei marker vicini.
// Leaflet e Leaflet.markercluster sono caricati come script globali in index.html.
/* global L */
import { esc } from './utils.js';

let map;
let cluster;
let onSelect = () => {};
let selectedId = null;
const markers = new Map(); // venueId -> { marker, count, approximate }

/** Icona del locale: un cerchio con il numero di date; tratteggiato se la posizione è approssimativa. */
function icon(count, approximate, selected) {
  const cls = ['venue-marker', approximate && 'is-approx', selected && 'is-selected'].filter(Boolean).join(' ');
  return L.divIcon({
    className: '',
    html: `<span class="${cls}">${count}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function initMap(handleSelect) {
  onSelect = handleSelect;
  map = L.map('map', { worldCopyJump: true, zoomControl: true }).setView([46, 10], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
  map.addLayer(cluster);
}

/**
 * Ridisegna i marker per gli eventi filtrati.
 * @returns numero di eventi senza coordinate (non mostrabili sulla mappa)
 */
export function renderMap(events, { fit = true } = {}) {
  cluster.clearLayers();
  markers.clear();

  const byVenue = new Map();
  let missing = 0;
  for (const e of events) {
    if (e.venue.lat == null) { missing += 1; continue; }
    const list = byVenue.get(e.venue.id) ?? [];
    list.push(e);
    byVenue.set(e.venue.id, list);
  }

  const layers = [];
  for (const [id, list] of byVenue) {
    const v = list[0].venue;
    const marker = L.marker([v.lat, v.lng], {
      icon: icon(list.length, v.approximate, id === selectedId),
      title: v.name,
      alt: `${v.name}, ${list.length} date`,
      keyboard: true,
    });
    marker.bindTooltip(`<strong>${esc(v.name)}</strong><br>${esc(v.city ?? '')} · ${list.length} ${list.length === 1 ? 'data' : 'date'}`);
    marker.on('click', () => onSelect(id));
    markers.set(id, { marker, count: list.length, approximate: v.approximate });
    layers.push(marker);
  }
  cluster.addLayers(layers);

  if (fit && layers.length) {
    map.fitBounds(cluster.getBounds(), { padding: [30, 30], maxZoom: 11 });
  }
  return missing;
}

/** Evidenzia il locale selezionato e lo porta in vista (aprendo il cluster se serve). */
export function selectVenue(id, { pan = true } = {}) {
  const prev = markers.get(selectedId);
  if (prev) prev.marker.setIcon(icon(prev.count, prev.approximate, false));
  selectedId = id;
  const cur = markers.get(id);
  if (!cur) return;
  cur.marker.setIcon(icon(cur.count, cur.approximate, true));
  if (pan) cluster.zoomToShowLayer(cur.marker, () => map.panTo(cur.marker.getLatLng()));
}

/** Da chiamare quando il contenitore della mappa cambia dimensione o diventa visibile. */
export function refreshMapSize() {
  map?.invalidateSize();
}
