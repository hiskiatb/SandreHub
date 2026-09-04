/**
 * Tile map LocationIQ (raster) - dipakai di semua peta MartaHub (desktop +
 * mobile) supaya konsisten satu provider, sesuai keputusan pindah dari
 * OpenStreetMap/CARTO ke LocationIQ.
 *
 * Key di bawah adalah "Access Token" publik LocationIQ (awalan `pk.` = akses
 * publik/client-side, BUKAN secret key server - beda dengan token
 * `LOCATIONIQ_TOKEN` yang dipakai edge function `locationiq` utk
 * search/reverse-geocode). Access token jenis ini memang didesain aman utk
 * ditaruh langsung di kode client (dibatasi lewat domain-restriction di
 * dashboard LocationIQ, bukan lewat kerahasiaan), makanya boleh hardcode di
 * sini - sama seperti Mapbox `pk.` public token.
 *
 * PENTING - kuota: plan gratis LocationIQ 5.000 request/hari DIBAGI rata
 * dengan geocoding/autocomplete. Render satu layar peta bisa makan puluhan
 * tile request, jadi kalau kuota harian habis, search alamat JUGA ikut kena
 * rate-limit (429). Kalau itu terjadi, upgrade plan LocationIQ atau
 * pertimbangkan balik sebagian tile ke OSM.
 */
export const LOCATIONIQ_TILE_KEY = "pk.bf9d55343a2e2736e0b85632ac12c67b";

/**
 * @param {"streets"|"light"|"dark"} theme
 * @returns {string} URL template siap dipakai di L.tileLayer(...)
 */
export function locationiqTileUrl(theme = "streets") {
  return `https://{s}-tiles.locationiq.com/v3/${theme}/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_TILE_KEY}`;
}

export const LOCATIONIQ_TILE_SUBDOMAINS = "abc";
export const LOCATIONIQ_TILE_ATTRIBUTION =
  '&copy; <a href="https://locationiq.com" target="_blank" rel="noopener">LocationIQ</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const LOCATIONIQ_TILE_MAX_ZOOM = 19;
