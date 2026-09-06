"use client";
/**
 * MapPickerSheet - picker peta interaktif (web mobile), padanan
 * `location_picker_screen.dart` di Flutter. Pakai Leaflet + tile OpenStreetMap
 * (TANPA API key, sama seperti alasan Flutter pakai flutter_map bukan
 * google_maps_flutter - lihat pubspec.yaml komentar). Pola "pin diam di
 * tengah, peta yang digeser" (bukan marker draggable), reverse-geocode via
 * Nominatim (gratis, tanpa key) di-debounce 500ms setelah peta berhenti
 * bergerak - SAMA PERSIS dgn `_onSettled()` Flutter.
 */
import { useEffect, useRef, useState } from "react";
import { X, Crosshair, Search, Check, Loader2, MapPin, Pencil, AlertTriangle, ChevronDown, Info } from "lucide-react";
import { FF, BRAND } from "./MobileShell";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { locationiqTileUrl, LOCATIONIQ_TILE_SUBDOMAINS, LOCATIONIQ_TILE_ATTRIBUTION, LOCATIONIQ_TILE_MAX_ZOOM } from "../../../../lib/locationiqTiles";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Cache client-side (in-memory, module scope - bertahan lintas
// buka/tutup sheet dlm satu session tab, TIDAK menggantikan cache 2 menit
// di sisi server, cuma fast-path biar hasil yg sama kelihatan instan tanpa
// nunggu network roundtrip). TTL disamakan dgn cache server (2 menit).
// Panel pencarian expanded SENGAJA tidak nutup 100% layar - disisain
// sedikit ruang di atas (peta + status bar kelihatan tipis) spt referensi
// Apple Maps, bukan flush ke ujung atas layar. COLLAPSED_APPROX_HEIGHT_PX
// dipakai cuma sbg estimasi utk BATAS drag-to-collapse (lihat
// handlePanelTouchMove) - approx tinggi panel versi collapsed (search bar +
// label "Lokasi Terpilih" + kartu alamat + tombol konfirmasi).
const EXPANDED_TOP_GAP_PX = 90;
const COLLAPSED_APPROX_HEIGHT_PX = 260;
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;
const geocodeCache = new Map(); // key: "lat5,lng5" -> { value, ts }
const autocompleteCache = new Map(); // key: lowercased/trimmed query -> { value, ts }

function geocodeCacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function getCached(map, key) {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > CLIENT_CACHE_TTL_MS) { map.delete(key); return undefined; }
  return hit.value;
}

function setCached(map, key, value) {
  map.set(key, { value, ts: Date.now() });
}

// Retry SEKALI (bukan exponential backoff) utk kegagalan yg keliatan
// transient (network error/timeout, atau 5xx-ish) - 429 (rate-limit) TIDAK
// di-retry sama sekali krn retry tidak akan membantu & cuma boros kuota.
function isTransientFailure(err, errorCtxStatus) {
  if (errorCtxStatus === 429) return false;
  if (err?.name === "AbortError") return true;
  if (errorCtxStatus == null) return true; // network error / exception tanpa status
  return errorCtxStatus >= 500;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let leafletLoadPromise = null;
export function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS; script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Gagal memuat peta"));
    document.body.appendChild(script);
  });
  return leafletLoadPromise;
}

/**
 * @param {{ initialLat?: number, initialLng?: number, onClose: () => void,
 *   onConfirm: (r: {lat:number,lng:number,address:string|null}) => void }} props
 */
export default function MapPickerSheet({ initialLat, initialLng, onClose, onConfirm }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [center, setCenter] = useState({ lat: initialLat || -5.4, lng: initialLng || 105.27 }); // default: sekitar Lampung
  const [address, setAddress] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchErr, setSearchErr] = useState("");
  // Search dipindah ke DALAM panel bawah (gaya Apple Maps) - "expanded"
  // saat input fokus ATAU ada ketikan, panel melebar nutupin hampir layar
  // penuh nampilin daftar saran scroll-able; "collapsed" (default) balik ke
  // tinggi normal nampilin blok alamat/manual/konfirmasi spt biasa.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  // Drag-to-collapse: lacak posisi jari vertikal dari titik sentuh awal di
  // handle/baris search saat expanded, panel "ngikutin" jari via translateY
  // inline sementara drag berlangsung, lalu snap balik expanded (kalau
  // geser < threshold) atau snap collapsed (>= threshold) begitu jari
  // dilepas - transform inline direset stlh snap, biar CSS transition yg
  // ambil alih animasinya.
  const dragStartYRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  // Jarak geser max yg diizinkan = selisih tinggi expanded - tinggi
  // collapsed (approx) - DIBATASI (bukan bebas sampai ke bawah layar) spy
  // "tinggi minimum saat ditarik" ya persis tinggi awal (collapsed), TIDAK
  // BISA ketarik lebih rendah dari itu / nutup semua kontennya. Threshold
  // utk benar2 snap ke collapsed dibuat proporsional (35% dari jarak max)
  // spy gampang ketarik turun tanpa perlu narik jauh2.
  const maxDragRef = useRef(320);
  const DRAG_COLLAPSE_RATIO = 0.35;

  function handlePanelTouchStart(e) {
    if (!searchExpanded) return;
    dragStartYRef.current = e.touches[0].clientY;
    const expandedPx = window.innerHeight - EXPANDED_TOP_GAP_PX;
    maxDragRef.current = Math.max(60, expandedPx - COLLAPSED_APPROX_HEIGHT_PX);
  }
  function handlePanelTouchMove(e) {
    if (dragStartYRef.current == null) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) setDragOffset(Math.min(dy, maxDragRef.current)); // cuma boleh narik ke bawah SAMPAI batas tinggi collapsed, bukan ke atas / lebih rendah dr itu
  }
  function handlePanelTouchEnd() {
    if (dragStartYRef.current == null) return;
    const draggedDown = dragOffset;
    dragStartYRef.current = null;
    setDragOffset(0);
    if (draggedDown >= maxDragRef.current * DRAG_COLLAPSE_RATIO) {
      searchInputRef.current?.blur();
      setSearchExpanded(false);
    }
    // < threshold: snap balik expanded (state sudah expanded, tinggal
    // transform di-reset di atas, CSS transition yg urus animasinya).
  }
  // Edit alamat manual - alamat hasil reverse-geocode kadang kurang presisi
  // (nama jalan resmi vs yg umum dipakai, patokan lokal, dsb), jadi DSF
  // boleh koreksi teksnya langsung di sini tanpa perlu geser peta lagi.
  const debounceRef = useRef(null);
  // `alive` dicek di SETIAP callback async (fetch/geolocation) sebelum
  // setState - sheet ini bisa ditutup (unmount) sementara request masih
  // di tengah jalan (fetch Nominatim/geolocation lambat), dan tanpa guard
  // ini React bakal warning "can't update state on unmounted component" +
  // berpotensi state nyasar. `geoReqId`/`searchReqId` mencegah race kondisi
  // laen: kalau peta digeser cepat 2x berturut-turut, respons request yg
  // LEBIH LAMA bisa nyampe belakangan & menimpa alamat dari request yg lebih
  // baru - id dicocokkan dulu sebelum commit ke state.
  const aliveRef = useRef(true);
  const geoReqId = useRef(0);
  const searchReqId = useRef(0);
  // BUG PENTING (penyebab tombol "Lokasi Saya" nyangkut loading terus):
  // sebelumnya effect ini CUMA daftarin cleanup (set false ke aliveRef),
  // TANPA pernah nge-reset aliveRef.current balik ke true saat setup. Di
  // React 18 StrictMode (mode development), tiap effect mount SENGAJA
  // di-mount -> unmount -> mount lagi 1x (buat nge-tes cleanup) - unmount
  // palsu itu trigger cleanup di atas (aliveRef.current jadi false), tapi
  // krn tidak ada yg reset ke true lagi pas mount KEDUA (yg sungguhan),
  // ref ini permanen kepasang false walau komponennya beneran hidup.
  // Efeknya: SEMUA pengecekan "if (!aliveRef.current) return;" di callback
  // async (geolocation, reverse-geocode, search) langsung bail out diam2
  // tanpa pernah setLocating(false)/setLocErr - state loading nyangkut
  // selamanya. Sebelumnya jarang kepergok krn cuma kena kalau tombol
  // ditekan PAS window sempit itu - sekarang jadi PASTI kena krn lokasi
  // skrg di-trigger OTOMATIS pas mount (effect auto-locate di bawah).
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Default saat sheet ini dibuka TANPA koordinat awal (mis. site/DSF blm
  // pernah pilih titik sebelumnya) - langsung arahkan ke lokasi user saat
  // ini (`useMyLocation`, fungsi yg SAMA persis dgn yg dipanggil tombol
  // crosshair manual), bukan diam di default hardcoded sekitar Lampung.
  // SENGAJA cuma jalan kalau `initialLat`/`initialLng` KOSONG - kalau sheet
  // dibuka utk ubah/liat titik yg SUDAH pernah dipilih sebelumnya, jangan
  // ditimpa otomatis ke lokasi user skrg. Hanya sekali saat mount (deps
  // kosong), bukan tiap kali initialLat/Lng berubah.
  useEffect(() => {
    if (!initialLat && !initialLng) useMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Input manual longlat - jalur cadangan kalau titiknya susah ditemukan
  // dgn geser peta (mis. area tanpa jalan/landmark jelas di tile OSM, atau
  // DSF sudah punya angka longlat pasti dari sumber lain) - toggle-able,
  // TIDAK menggantikan peta, cuma pelengkap.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCoordInput, setManualCoordInput] = useState("");
  const [manualErr, setManualErr] = useState("");

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, { zoomControl: false }).setView([center.lat, center.lng], 16);
      L.tileLayer(locationiqTileUrl("streets"), {
        attribution: LOCATIONIQ_TILE_ATTRIBUTION, maxZoom: LOCATIONIQ_TILE_MAX_ZOOM, subdomains: LOCATIONIQ_TILE_SUBDOMAINS,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.on("move", () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      mapRef.current = map;
      setReady(true);
      reverseGeocode(center.lat, center.lng);
    }).catch((e) => setLoadErr(e.message || "Gagal memuat peta"));
    return () => {
      alive = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce 500ms setelah peta berhenti bergerak → reverse geocode, SAMA
  // dgn `_onSettled()` Flutter.
  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reverseGeocode(center.lat, center.lng), 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, ready]);

  // Lewat edge function locationiq (action:"reverse") - beda dgn Nominatim,
  // LocationIQ tidak butuh parameter "zoom" bertingkat, jadi cukup SATU
  // request per titik (edge function-nya sendiri sudah punya cache 2 menit
  // di sisi server utk titik yg sama, jadi geser2 kecil di area yg sama
  // tidak boros kuota).
  async function reverseGeocode(lat, lng) {
    const reqId = ++geoReqId.current;
    // Fast-path cache client - kalau titik ini (dibulatkan 5 desimal, sama
    // granularitas dgn cache server) baru saja di-geocode, langsung pakai
    // tanpa nyalain spinner "Mencari alamat…" sama sekali - kerasa instan.
    const cached = getCached(geocodeCache, geocodeCacheKey(lat, lng));
    if (cached !== undefined) {
      setAddress(cached);
      return;
    }
    setGeocoding(true);
    try {
      const found = await fetchGeocode(lat, lng);
      if (!aliveRef.current || reqId !== geoReqId.current) return;
      setAddress(found);
    } catch {
      if (!aliveRef.current || reqId !== geoReqId.current) return;
      setAddress(null);
    } finally {
      if (aliveRef.current && reqId === geoReqId.current) setGeocoding(false);
    }
  }

  async function fetchGeocode(lat, lng, isRetry) {
    // Lewat edge function `locationiq` (proxy ke LocationIQ, token disimpan
    // aman di server via Supabase secret) - BUKAN fetch langsung ke Nominatim
    // dari browser. Panggil langsung dari client sering diblokir/rate-limit
    // di jaringan mobile/webview (itu penyebab "Mencari alamat…" nyangkut &
    // suggestion tidak pernah muncul). Timeout eksplisit tetap dipasang spy
    // state loading tidak macet kalau edge function/upstream lelet.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const { data, error } = await supabaseMarta.functions.invoke("locationiq", {
        body: { action: "reverse", lat, lon: lng },
        signal: controller.signal,
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[locationiq reverse] error:", error, error?.context?.status);
        const ctxStatus = error?.context?.status;
        if (!isRetry && isTransientFailure(error, ctxStatus)) {
          await delay(600);
          return fetchGeocode(lat, lng, true);
        }
        return null;
      }
      // Sebelumnya pakai result.display (versi RINGKAS yg disusun edge
      // function - road+area+city doang) buat ditampilin di "Lokasi
      // Terpilih" - DSF minta versi RAW/lengkap persis kayak response asli
      // LocationIQ (mis. "Lapangan Benteng, Petisah Tengah, Medan Petisah,
      // Kota Medan, Sumatera Utara, Sumatra, 20112, Indonesia"), bukan
      // dipotong sampai nama jalan aja ilang. Pakai displayFull (raw
      // display_name dari LocationIQ, sudah disediakan edge function-nya
      // sejak awal tapi belum dipakai di sini).
      const full = data?.result?.displayFull || data?.result?.display || null;
      if (full) setCached(geocodeCache, geocodeCacheKey(lat, lng), full);
      return full;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[locationiq reverse] exception:", e);
      if (!isRetry && isTransientFailure(e, undefined)) {
        await delay(600);
        return fetchGeocode(lat, lng, true);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function useMyLocation() {
    setLocErr("");
    // Sebelumnya kalau `navigator.geolocation` tidak ada (mis. dibuka lewat
    // koneksi non-HTTPS/context tidak aman, browser lawas, atau webview yg
    // mematikan API ini) fungsi ini `return` diam2 TANPA pesan apa pun -
    // tombol kelihatan "tidak ngapa-ngapain" sama sekali, DSF tidak tahu
    // apa yg salah. Sekarang selalu ada feedback jelas.
    if (!navigator.geolocation) {
      setLocErr("Perangkat/browser ini tidak mendukung deteksi lokasi. Gunakan Input Koordinat Manual di bawah.");
      return;
    }
    setLocating(true);
    // Safety timer TERPISAH dari timeout milik geolocation API sendiri -
    // beberapa WebView (mis. in-app browser) diketahui TIDAK PERNAH
    // memanggil callback sukses MAUPUN error saat izin lokasi diblokir di
    // level OS/aplikasi, jadi tombol "Lokasi Saya" nyangkut loading
    // selamanya kalau cuma mengandalkan opsi `timeout` bawaan (yg juga
    // TIDAK dijamin dihormati semua browser). Timer ini menjamin state
    // loading SELALU berakhir & DSF selalu dapat pesan yg jelas.
    const safetyTimer = setTimeout(() => {
      if (!aliveRef.current) return;
      setLocating(false);
      setLocErr("Tidak bisa mendapatkan lokasi (waktu habis). Pastikan izin Lokasi aktif utk browser ini, atau isi Input Koordinat Manual.");
    }, 13000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safetyTimer);
        if (!aliveRef.current) return;
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 17);
        setCenter({ lat: latitude, lng: longitude });
        setLocating(false);
      },
      (err) => {
        clearTimeout(safetyTimer);
        if (!aliveRef.current) return;
        setLocating(false);
        // Pesan dibedakan per kode error (PERMISSION_DENIED=1,
        // POSITION_UNAVAILABLE=2, TIMEOUT=3) - "izin diblokir" & "sinyal
        // GPS lemah" butuh tindakan yg beda dari DSF, jangan digeneralisir
        // jadi satu pesan generik yg tidak actionable.
        if (err.code === 1) setLocErr("Izin akses Lokasi ditolak. Aktifkan izin Lokasi utk browser ini di pengaturan perangkat, atau isi Input Koordinat Manual.");
        else if (err.code === 2) setLocErr("Lokasi tidak terdeteksi (sinyal GPS lemah). Coba lagi di area terbuka, atau isi Input Koordinat Manual.");
        else setLocErr("Waktu mencari lokasi habis. Coba lagi, atau isi Input Koordinat Manual.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // Auto-suggestion (search live tiap ngetik, di-debounce 450ms) SENGAJA
  // DIHAPUS - tiap ketikan yg berhenti 450ms sebelumnya trigger 1 request
  // ke edge function/LocationIQ, boros kuota (rencana LocationIQ dibatasi
  // jumlah request/bulan). Sekarang ganti ke konsep persis kayak demo resmi
  // LocationIQ sendiri: user KETIK BEBAS, request BARU dikirim begitu
  // eksplisit menekan tombol "Cari" (atau Enter di keyboard) - jauh lebih
  // hemat krn 1 pencarian = 1 request, bukan 1 request per jeda ketikan.
  // Efek sampingnya: hasil lama otomatis dikosongkan begitu query berubah
  // (spy tidak nyangkut nampilin hasil dari kata kunci sebelumnya).
  useEffect(() => {
    setSearchResults([]);
    setSearchErr("");
  }, [searchQ]);

  // Urutkan hasil autocomplete berdasarkan jarak lurus (squared-distance,
  // cukup akurat utk sekadar ranking dlm area kecil, tidak perlu presisi
  // haversine) dari titik peta SAAT pencarian ditembak - supaya hasil yg
  // paling relevan dgn posisi peta sekarang muncul paling atas.
  function sortResultsByDistance(results, fromLat, fromLng) {
    return [...results].sort((a, b) => {
      const da = (Number(a.lat) - fromLat) ** 2 + (Number(a.lon) - fromLng) ** 2;
      const db = (Number(b.lat) - fromLat) ** 2 + (Number(b.lon) - fromLng) ** 2;
      return da - db;
    });
  }

  // MITIGASI RINGAN utk typo prefix jalan (BUKAN fuzzy/Levenshtein spell-
// correction sungguhan - itu butuh gazetteer/index lokal yg tidak dipunyai
// app ini). Cuma menangani DUA hal simpel: (1) spasi ganda dirapikan jadi
// satu, (2) prefix umum "jl"/"jln" <-> "jalan" ditukar krn user sering
// tidak konsisten menulisnya. Typo di TENGAH nama jalan (mis. "Renfille"
// utk "Renville") TIDAK akan tertolong oleh ini.
function lightNormalizeQuery(q) {
  const collapsed = q.replace(/\s+/g, " ").trim();
  const lower = collapsed.toLowerCase();
  if (/^jln?\.?\s/.test(lower)) {
    return collapsed.replace(/^jln?\.?\s/i, "Jalan ");
  }
  if (/^jalan\s/.test(lower)) {
    return collapsed.replace(/^jalan\s/i, "Jl ");
  }
  return collapsed !== q ? collapsed : null; // null = tidak ada varian lain utk dicoba
}

async function runSearch(isRetry, reqIdOverride) {
    const q = searchQ.trim();
    if (!q) return;
    // Minimal 3 karakter - konsisten dgn ambang yg dipakai di tip/empty-
    // state UI (searchQ.trim().length >= 3) & sekalian jaga2 dari request
    // sia-sia utk query 1-2 huruf yg hasilnya nyaris pasti tidak berguna.
    if (q.length < 3 && !isRetry) {
      setSearchErr("Ketik minimal 3 huruf dulu, baru tekan Cari.");
      setSearchResults([]);
      return;
    }
    const reqId = isRetry ? reqIdOverride : ++searchReqId.current;
    const qKey = q.toLowerCase();
    const fromLat = center.lat, fromLng = center.lng;
    if (!isRetry) {
      // Fast-path cache client - query yg sama persis (case/whitespace
      // diabaikan) dlm 2 menit terakhir langsung dipakai, tanpa nyalain
      // spinner "Mencari…" sama sekali.
      const cached = getCached(autocompleteCache, qKey);
      if (cached !== undefined) {
        setSearchResults(sortResultsByDistance(cached, fromLat, fromLng));
        setSearchErr("");
        return;
      }
      setSearching(true); setSearchResults([]); setSearchErr("");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // sama alasannya dgn fetchGeocode - jangan sampai "Mencari…" macet tanpa batas
    try {
      const { data, error } = await supabaseMarta.functions.invoke("locationiq", {
        body: { action: "autocomplete", q },
        signal: controller.signal,
      });
      if (!aliveRef.current || reqId !== searchReqId.current) return;
      if (error) {
        // Ditampilkan biar keliatan alasan gagalnya PERSIS apa (bukan cuma
        // "hasil kosong") - mis. token belum aktif, kena rate-limit, dsb -
        // supaya gampang di-diagnosa tanpa perlu buka DevTools.
        // eslint-disable-next-line no-console
        console.error("[locationiq autocomplete] error:", error);
        const ctxStatus = error?.context?.status;
        if (!isRetry && isTransientFailure(error, ctxStatus)) {
          clearTimeout(timer);
          await delay(600);
          return runSearch(true, reqId);
        }
        setSearchErr(
          ctxStatus === 401 || ctxStatus === 403 ? "Token LocationIQ belum aktif/salah. Cek secret LOCATIONIQ_TOKEN."
          : ctxStatus === 429 ? "Kuota LocationIQ hari ini habis. Coba lagi besok atau upgrade plan."
          : ctxStatus === 500 ? "Server pencarian bermasalah (LOCATIONIQ_TOKEN belum diset?)."
          : "Gagal memuat saran pencarian. Coba lagi."
        );
        setSearchResults([]);
        return;
      }
      let results = data?.results || [];
      // Fallback SEKALI (bukan retry-of-retry) kalau attempt asli nol hasil
      // - coba varian query yg dinormalisasi ringan (lihat lightNormalizeQuery).
      // Tidak ditembak kalau attempt asli sudah dapat hasil, dan hasil dari
      // varian ini yg dipakai kalau lebih baik (attempt asli tetap kosong).
      if (!results.length && !isRetry) {
        const normalized = lightNormalizeQuery(q);
        if (normalized && normalized.toLowerCase() !== qKey) {
          try {
            const fallback = await supabaseMarta.functions.invoke("locationiq", {
              body: { action: "autocomplete", q: normalized },
            });
            if (!fallback.error && fallback.data?.results?.length) {
              results = fallback.data.results;
            }
          } catch {
            // diam-diam gagal - attempt asli (kosong) tetap yg ditampilkan
          }
        }
      }
      if (!aliveRef.current || reqId !== searchReqId.current) return;
      if (results.length) setCached(autocompleteCache, qKey, results);
      setSearchResults(sortResultsByDistance(results, fromLat, fromLng));
    } catch (e) {
      if (!aliveRef.current || reqId !== searchReqId.current) return;
      // eslint-disable-next-line no-console
      console.error("[locationiq autocomplete] exception:", e);
      if (!isRetry && isTransientFailure(e, undefined)) {
        clearTimeout(timer);
        await delay(600);
        return runSearch(true, reqId);
      }
      setSearchErr(e?.name === "AbortError" ? "Pencarian terlalu lama, coba lagi." : "Gagal memuat saran pencarian. Coba lagi.");
      setSearchResults([]);
    } finally {
      clearTimeout(timer);
      if (aliveRef.current && reqId === searchReqId.current) setSearching(false);
    }
  }

  function pickResult(r) {
    const lat = Number(r.lat), lng = Number(r.lon);
    mapRef.current?.setView([lat, lng], 17);
    setCenter({ lat, lng });
    // Sama spt fetchGeocode - simpan versi RAW (displayFull) sbg alamat
    // "Lokasi Terpilih", bukan versi ringkas `r.display` yg dipakai di baris
    // suggestion (list suggestion tetap ringkas biar gampang di-scan, tapi
    // begitu DIPILIH, alamat final yg disimpan harus lengkap).
    setAddress(r.displayFull || r.display || null);
    setSearchResults([]);
    setSearchQ("");
    setSearchErr("");
    searchInputRef.current?.blur();
    setSearchExpanded(false);
  }

  function applyManualCoords() {
    // Satu kolom gabungan "lat, lng" (BUKAN dua kolom terpisah) - dipisah
    // dgn koma ATAU spasi, urutan SELALU latitude dulu baru longitude
    // (sama seperti format yg ditampilkan di badge koordinat di atas),
    // supaya DSF tinggal copy-paste dari Google Maps/badge tanpa mikir
    // field mana yg mana.
    const parts = manualCoordInput.trim().replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (parts.length !== 2 || Number.isNaN(lat) || Number.isNaN(lng)) {
      setManualErr("Format harus \"latitude, longitude\", mis. -5.401579, 105.263786.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setManualErr("Nilai di luar rentang koordinat yang valid.");
      return;
    }
    setManualErr("");
    mapRef.current?.setView([lat, lng], 17);
    setCenter({ lat, lng });
    setManualOpen(false);
    setManualCoordInput("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes pinDrop{0%{transform:translateY(-16px);opacity:0}100%{transform:translateY(0);opacity:1}}
        .mh-map-search::placeholder{color:#7A7A86;font-weight:500}`}</style>
      {/* Top bar - HANYA tombol close, search sudah pindah ke panel bawah
          (gaya Apple Maps) - lihat bagian "Bottom confirm panel" di bawah. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 0" }}>
        <button onClick={onClose}
          style={{ width: 38, height: 38, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(23,24,28,0.08)", flexShrink: 0 }}>
          <X size={17} color="#5A5A68" />
        </button>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapDivRef} style={{ position: "absolute", inset: 0, background: "#E9EAEE" }} />
        {(!ready || loadErr) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            {loadErr ? (
              <div style={{ fontSize: 12.5, color: "#C62828", fontWeight: 600 }}>{loadErr}</div>
            ) : (
              <Loader2 size={22} color="#ED1C24" style={{ animation: "mspin 1s linear infinite" }} />
            )}
          </div>
        )}
        {/* Center pin - diam di tengah, peta yang digeser di bawahnya.
            Sebelumnya cuma ikon outline MapPin polos (kurang "nempel" scr
            visual krn transparan) - sekarang pin teardrop solid dgn gradient
            + white dot di tengah (bahasa marker peta yg umum/familiar),
            plus bayangan elips statis di titik tanahnya spy kesan "melayang
            di atas titik" kebaca jelas, dan sedikit animasi drop saat peta
            baru siap. */}
        {ready && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)", pointerEvents: "none", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width="42" height="54" viewBox="0 0 42 54" style={{ animation: "pinDrop 0.4s cubic-bezier(0.34,1.56,0.64,1)", filter: "drop-shadow(0 3px 6px rgba(220,38,38,0.35))" }}>
              <defs>
                <linearGradient id="mapPinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F0384A" />
                  <stop offset="100%" stopColor="#C6151F" />
                </linearGradient>
              </defs>
              <path d="M21 2C11.6 2 4 9.6 4 19c0 12.6 15.2 30.6 16.3 31.9.4.5 1 .5 1.4 0C22.8 49.6 38 31.6 38 19 38 9.6 30.4 2 21 2z"
                fill="url(#mapPinGrad)" stroke="#fff" strokeWidth="2" />
              <circle cx="21" cy="19" r="7.5" fill="#fff" />
              <circle cx="21" cy="19" r="4" fill="#C6151F" />
            </svg>
            <div style={{ width: 14, height: 5, marginTop: -3, borderRadius: "50%", background: "rgba(23,24,28,0.28)", filter: "blur(1.5px)" }} />
          </div>
        )}
        {/* My location button - SENGAJA di kiri-bawah, BUKAN kanan-bawah -
            sebelumnya nempel PAS di titik yg sama dgn kontrol zoom Leaflet
            (`L.control.zoom({position:"bottomright"})` di atas), jadi dua
            tombol saling tindih/rebutan tempat di pojok yg sama. Sekarang
            keduanya di pojok terpisah, tidak akan pernah tabrakan. */}
        {ready && (
          <button onClick={useMyLocation}
            style={{ position: "absolute", left: 12, bottom: 12, width: 44, height: 44, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 10px rgba(23,24,28,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 6 }}>
            {locating ? <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} /> : <Crosshair size={18} color="#5A5A68" />}
          </button>
        )}
      </div>

      {/* Bottom panel - Apple-Maps style: search dipindah ke DALAM panel
          ini (paling atas, di bawah handle drag). "Collapsed" (default):
          tinggi normal, nampilin blok alamat/manual/konfirmasi spt biasa di
          bawah kolom cari. "Expanded" (input fokus ATAU ada ketikan):
          tinggi animasi ke 85dvh, konten alamat/manual/konfirmasi
          disembunyikan, diganti daftar saran scroll-able penuh. */}
      <div
        onTouchStart={handlePanelTouchStart}
        onTouchMove={handlePanelTouchMove}
        onTouchEnd={handlePanelTouchEnd}
        style={{
          background: "#FFFFFF", borderRadius: "20px 20px 0 0",
          padding: "8px 18px calc(env(safe-area-inset-bottom,0px) + 16px)",
          boxShadow: "0 -4px 20px rgba(23,24,28,0.08)",
          // Expanded naik tinggi ke arah atas layar TAPI sengaja disisain
          // gap kecil di puncak (EXPANDED_TOP_GAP_PX) spy peta + status bar
          // masih keliatan tipis di atas - persis referensi Apple Maps,
          // BUKAN nutup mentok 100% layar (itu sebelumnya kesannya terlalu
          // "menelan" seluruh layar & sudut jadi lurus, sekarang tetap
          // rounded di kedua kondisi biar konsisten spt bottom sheet lain).
          // PENTING: pakai `height` (bukan cuma `maxHeight`) saat expanded -
          // sebelumnya cuma maxHeight, jadi selama hasil pencarian masih
          // kosong/loading (blm ada isi yg "mendorong" tingginya), panel
          // ikut MENYUSUT balik sekecil kontennya (cuma search bar) walau
          // status-nya udah expanded. `height` FIXED spy tetap ke-reserve
          // penuh dari awal ngetik, apa pun isi hasilnya.
          height: searchExpanded ? `calc(100dvh - ${EXPANDED_TOP_GAP_PX}px)` : "auto",
          maxHeight: searchExpanded ? `calc(100dvh - ${EXPANDED_TOP_GAP_PX}px)` : "none",
          transition: dragOffset ? "none" : "height 280ms cubic-bezier(0.32,0.72,0,1)",
          transform: dragOffset ? `translateY(${dragOffset}px)` : "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
        {/* Handle bar - gaya sama dgn bottom sheet lain di codebase ini
            (mis. SitePickerSheet/QrScanSheet): pill abu2 kecil di tengah. */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: "6px 0 8px", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: "#DCDDE3" }} />
        </div>

        {/* Search - sekarang jadi elemen PERTAMA di dalam panel (di bawah
            handle), bukan lagi mengambang di atas peta. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 13px", borderRadius: 13, background: "#F2F2F5", border: "1.5px solid #E4E5EA" }}>
            <Search size={16} color="#5A5A68" strokeWidth={2.4} style={{ flexShrink: 0 }} />
            <input ref={searchInputRef} value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onFocus={() => setSearchExpanded(true)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Cari nama jalan atau tempat…" className="mh-map-search"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 13.5, fontWeight: 500, fontFamily: FF, color: "#17181C" }} />
            {searching && <Loader2 size={14} color="#5A5A68" style={{ animation: "mspin .9s linear infinite" }} />}
          </div>
          {/* Tombol "Cari" eksplisit - konsep SAMA persis kayak demo resmi
              LocationIQ (ketik bebas, request BARU dikirim cuma pas tombol
              ini/Enter ditekan). Cuma nongol pas ada ketikan, biar gak
              makan tempat pas query masih kosong. */}
          {searchExpanded && searchQ.trim().length > 0 && (
            <button onClick={() => runSearch()} disabled={searching}
              style={{ flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: searching ? "#D8D9E0" : BRAND, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: searching ? "default" : "pointer" }}>
              Cari
            </button>
          )}
          {searchExpanded && (
            <button onClick={() => { searchInputRef.current?.blur(); setSearchExpanded(false); }}
              style={{ flexShrink: 0, height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
              Batal <ChevronDown size={13} />
            </button>
          )}
        </div>

        {searchExpanded ? (
          /* EXPANDED: daftar saran penuh, scroll-able, menggantikan blok
             alamat/manual/konfirmasi selama panel melebar. */
          <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {/* Tip idle - tampil SEBELUM user mulai ngetik (query kosong),
                bukan cuma pas hasil kosong/error. Nunjukin dari awal cara
                paling efektif cari di sini (nama jalan), krn data kita cuma
                jalan/tempat OSM - beda dgn Apple Maps yg punya kategori
                POI siap pakai (Pom Bensin/Hotel/dst di referensi), jadi
                diganti tip singkat drpd daftar kategori yg kita tidak
                punya datanya. */}
            {searchQ.trim().length === 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "12px 11px", borderRadius: 12, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
                <Info size={14} color="#8A8A96" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.6, color: "#6B6B76" }}>
                  Tips: pencarian paling akurat kalau pakai <b style={{ color: "#3A3A44" }}>nama jalan</b> (mis. "Jalan Jendral Sudirman") atau nama tempat/patokan terdekat.
                </div>
              </div>
            )}
            {/* Loading placeholder - baris "Mencari..." ngisi ruang selagi
                nunggu request (debounce + fetch) blm selesai, biar panel yg
                udah kepalang naik full-screen gak keliatan kosong-melompong
                sesaat sebelum hasil/tip "tidak ditemukan" muncul. */}
            {searching && searchQ.trim().length >= 3 && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 6px", color: "#8A8A96" }}>
                <Loader2 size={15} style={{ animation: "mspin .9s linear infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Mencari "{searchQ.trim()}"…</span>
              </div>
            )}
            {searchResults.map((r, i) => {
              // `r.display` (nama jalan/tempat dari edge function) adalah
              // baris UTAMA yg harus paling kebaca - sebelumnya cuma badge
              // kecil ~10px yg jadi fokus, nama jalannya malah nyaris tak
              // kelihatan. Baris kedua (area/kota) dipisah dari `address`
              // kalau ada, sbg konteks tambahan yg lebih halus.
              const secondary = r.address?.village || r.address?.town || r.address?.city || r.address?.county || null;
              return (
                <button key={i} onClick={() => pickResult(r)}
                  style={{ width: "100%", textAlign: "left", padding: "14px 6px", background: "none", border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid #F0F0F3" : "none", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <MapPin size={16} color="#8A8A96" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#17181C", lineHeight: 1.35 }}>{r.display}</div>
                    {secondary && (
                      <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 500, color: "#6B6B76", lineHeight: 1.4 }}>{secondary}</div>
                    )}
                  </div>
                </button>
              );
            })}
            {!searching && searchErr && searchQ.trim().length >= 3 && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 7, padding: "10px 11px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <AlertTriangle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: "#B91C1C" }}>{searchErr}</div>
              </div>
            )}
            {/* Empty-state: query cukup panjang, tidak loading, tidak ada
                hasil DAN tidak ada error - kasih tip actionable, bukan
                cuma ruang kosong yg bikin DSF mikir aplikasinya nge-hang. */}
            {!searching && !searchErr && searchQ.trim().length >= 3 && searchResults.length === 0 && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 7, padding: "10px 11px", borderRadius: 10, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
                <Info size={13} color="#8A8A96" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: "#6B6B76" }}>
                  Tidak ditemukan. Coba masukkan nama jalan atau jalan terdekat, lalu sesuaikan titik dengan menggeser pin di peta setelah menutup pencarian.
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10 }}>Lokasi Terpilih</div>

            <div style={{
              marginTop: 8, display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px", borderRadius: 12,
              background: geocoding ? "#F6F7F9" : address ? "#F6F7F9" : "#FFF7ED",
              border: `1px solid ${geocoding ? "#EFEFF2" : address ? "#EFEFF2" : "#FED7AA"}`,
            }}>
              {geocoding ? (
                <Loader2 size={14} color="#B0B0BA" style={{ flexShrink: 0, marginTop: 1, animation: "mspin .9s linear infinite" }} />
              ) : address ? (
                <MapPin size={14} color="#5A5A68" style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertTriangle size={14} color="#C2410C" style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              {/* Edit alamat manual (textarea + pensil) SENGAJA DIHAPUS -
                  alamat titik ini SELALU murni hasil reverse-geocode
                  LocationIQ dari koordinat pin/hasil pencarian, tidak boleh
                  ada jalur utk DSF ngetik alamat sendiri di sini (beda dgn
                  field "Alamat" utama di form plan yg tetap bebas diisi
                  manual - itu di luar sheet ini). Kalau alamat tidak
                  ketemu, DSF cukup digeser pin-nya/cari ulang, bukan
                  ngetik alamat sendiri di titik ini. */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: geocoding ? "#B0B0BA" : address ? "#3A3A44" : "#9A3412" }}>
                  {geocoding ? "Mencari alamat…" : (address || "Alamat tidak ditemukan - coba geser pin atau cari ulang di kolom pencarian.")}
                </div>
                {/* Lat & Lng SEKARANG 2 chip terpisah (bukan 1 baris
                    gabungan "Lat, Lng x, y") - lebih gampang discan
                    sekilas mana lat mana lng, & lebih gampang di-tap/select
                    salah satu angkanya doang kalau DSF perlu copy cuma
                    satu nilai. */}
                <div style={{ marginTop: 5, display: "flex", gap: 5 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#8A8A96", fontVariantNumeric: "tabular-nums", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 7, padding: "2px 7px" }}>
                    <span style={{ fontWeight: 800, color: "#B0B0BA" }}>Lat</span>
                    <span>{center.lat.toFixed(6)}</span>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#8A8A96", fontVariantNumeric: "tabular-nums", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 7, padding: "2px 7px" }}>
                    <span style={{ fontWeight: 800, color: "#B0B0BA" }}>Lng</span>
                    <span>{center.lng.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            </div>

            {locErr && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 10px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <AlertTriangle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.5, color: "#B91C1C" }}>{locErr}</div>
              </div>
            )}

            <button onClick={() => { setManualOpen((v) => !v); setManualErr(""); }}
              style={{
                width: "100%", marginTop: 9, height: 42, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                border: `1.5px solid ${manualOpen ? "#ED1C24" : "#E4E5EA"}`, background: manualOpen ? "rgba(237,28,36,0.06)" : "#FFFFFF",
                color: manualOpen ? "#ED1C24" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF,
              }}>
              <Pencil size={13} /> {manualOpen ? "Tutup Input Manual" : "Input Koordinat Manual"}
            </button>

            {/* Panel input manual - SEKARANG dianimasikan buka/tutupnya
                (maxHeight+opacity, bukan muncul/hilang instan) spy transisi
                naik-turun kartu ini terasa smooth, konsisten dgn animasi
                bottom sheet lain di app ini. maxHeight dikasih angka cukup
                besar (400px) drpd "none"/auto krn CSS transition butuh
                angka pasti spy animasinya jalan. */}
            <div style={{
              maxHeight: manualOpen ? 400 : 0, opacity: manualOpen ? 1 : 0,
              overflow: "hidden", transition: "max-height 280ms cubic-bezier(0.32,0.72,0,1), opacity 200ms ease",
            }}>
              <div style={{ marginTop: 10, padding: "11px 12px", borderRadius: 12, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
                {/* Tip Google Maps - arahan konkret DSF kalau alamat/titik
                    susah ditemukan lewat pencarian/geser pin di sini: buka
                    Google Maps, cari lokasinya di sana, tekan-tahan titiknya
                    utk dapat koordinat, lalu tempel di kolom bawah ini. */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 10px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", marginBottom: 10 }}>
                  <Info size={13} color="#8A8A96" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.6, color: "#6B6B76" }}>
                    Tidak ketemu alamatnya di sini? Cari lokasinya di aplikasi <b style={{ color: "#3A3A44" }}>Google Maps</b>, tekan-tahan titiknya utk melihat koordinat, lalu ketik di kolom bawah ini.
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>Koordinat (Lat, Lng)</div>
                <input value={manualCoordInput} onChange={(e) => setManualCoordInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyManualCoords()}
                  inputMode="decimal" placeholder="mis. -5.401579, 105.263786"
                  style={{ width: "100%", height: 42, borderRadius: 10, border: "1.5px solid #E4E5EA", padding: "0 11px", fontSize: 12.5, fontFamily: FF, outline: "none", background: "#FFFFFF", boxSizing: "border-box" }} />
                {manualErr && <div style={{ marginTop: 7, fontSize: 11, color: "#DC2626", fontWeight: 600 }}>{manualErr}</div>}
                <button onClick={applyManualCoords}
                  style={{ width: "100%", marginTop: 9, height: 40, borderRadius: 10, border: "none", background: "#17181C", color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} /> Arahkan Peta ke Titik Ini
                </button>
              </div>
            </div>

            <button onClick={() => onConfirm({ lat: center.lat, lng: center.lng, address })} disabled={!ready}
              style={{ width: "100%", marginTop: 12, height: 48, borderRadius: 13, border: "none", cursor: ready ? "pointer" : "default", background: ready ? BRAND : "#D8D9E0", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: ready ? "0 4px 14px rgba(17,17,20,0.11)" : "none" }}>
              <Check size={16} /> Gunakan Titik Ini
            </button>
          </>
        )}
      </div>
    </div>
  );
}
