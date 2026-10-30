"use client";
/**
 * SDP_AddressSearch.jsx — autocomplete alamat ala e-commerce.
 * Ketik nama tempat/jalan → saran muncul (debounced) → pilih → onSelect(place).
 * Sumber: edge function `locationiq` (action:'autocomplete'), scoped Indonesia+Sumatera.
 *
 * UPDATE (permintaan user - "untuk pencarian alamat gunakan konsep yang
 * sama persis pada saat pencarian alamat di martaHub Mobile yang sudah
 * pasti berjalan dengan baik"): internal pencarian (debounce, cache,
 * retry, error handling, fallback typo) disalin PERSIS dari
 * app/martahub/m/_shared/MapPickerSheet.jsx (runSearch/lightNormalizeQuery/
 * sortResultsByDistance/autocompleteCache pattern) - itu implementasi yang
 * sudah terbukti jalan baik di MartaHub Mobile. Tampilan (input + dropdown
 * saran) TETAP dipertahankan sesuai desain form SDP ini (bukan di-copy
 * tampilannya, cuma "konsep"/logic pencariannya).
 *
 * onSelect menerima { display, displayFull, lat, lon, address } (address =
 * objek LocationIQ: road, suburb, city, postcode, dst).
 *
 * Props: { t, supabase, onSelect, placeholder, nearLat, nearLng }
 *   nearLat/nearLng (opsional): titik referensi (mis. pin peta yg sudah
 *   ada) utk mengurutkan hasil berdasarkan jarak terdekat - sama seperti
 *   `fromLat`/`fromLng` (posisi peta) di MapPickerSheet. Kalau tidak
 *   diisi, hasil ditampilkan apa adanya sesuai urutan dari server.
 */
import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, X, AlertCircle } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ── Cache client-side (in-memory, module scope) — SAMA PERSIS dgn pola di
// MapPickerSheet.jsx: bertahan lintas buka/tutup komponen dlm satu session
// tab, TTL 2 menit (disamakan dgn cache sisi server edge function). ──
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;
const autocompleteCache = new Map(); // key: lowercased/trimmed query -> { value, ts }

function getCached(map, key) {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > CLIENT_CACHE_TTL_MS) { map.delete(key); return undefined; }
  return hit.value;
}
function setCached(map, key, value) { map.set(key, { value, ts: Date.now() }); }

// Retry SEKALI (bukan exponential backoff) utk kegagalan yg keliatan
// transient (network error/timeout, atau 5xx-ish) - 429 (rate-limit) TIDAK
// di-retry sama sekali krn retry tidak akan membantu & cuma boros kuota.
// (sama persis dgn isTransientFailure() di MapPickerSheet.jsx)
function isTransientFailure(err, errorCtxStatus) {
  if (errorCtxStatus === 429) return false;
  if (err?.name === "AbortError") return true;
  if (errorCtxStatus == null) return true;
  return errorCtxStatus >= 500;
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// MITIGASI RINGAN utk typo prefix jalan (BUKAN fuzzy/Levenshtein spell-
// correction sungguhan) - sama persis dgn lightNormalizeQuery() di
// MapPickerSheet.jsx: (1) spasi ganda dirapikan jadi satu, (2) prefix umum
// "jl"/"jln" <-> "jalan" ditukar krn user sering tidak konsisten menulisnya.
function lightNormalizeQuery(q) {
  const collapsed = q.replace(/\s+/g, " ").trim();
  const lower = collapsed.toLowerCase();
  if (/^jln?\.?\s/.test(lower)) return collapsed.replace(/^jln?\.?\s/i, "Jalan ");
  if (/^jalan\s/.test(lower)) return collapsed.replace(/^jalan\s/i, "Jl ");
  return collapsed !== q ? collapsed : null;
}

// Urutkan hasil berdasarkan jarak lurus (squared-distance, cukup akurat
// utk ranking dlm area kecil) dari titik referensi (nearLat/nearLng) -
// sama persis dgn sortResultsByDistance() di MapPickerSheet.jsx. Kalau
// titik referensi tidak ada, urutan dari server dipakai apa adanya.
function sortResultsByDistance(results, fromLat, fromLng) {
  if (fromLat == null || fromLng == null) return results;
  return [...results].sort((a, b) => {
    const da = (Number(a.lat) - fromLat) ** 2 + (Number(a.lon) - fromLng) ** 2;
    const db = (Number(b.lat) - fromLat) ** 2 + (Number(b.lon) - fromLng) ** 2;
    return da - db;
  });
}

export default function SDP_AddressSearch({ t, supabase, onSelect, placeholder = "Cari alamat, jalan, atau tempat…", nearLat = null, nearLng = null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const reqId = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Auto-search stlh berhenti ngetik 1 detik (debounce 1000ms) - SAMA
  // PERSIS dgn MapPickerSheet.jsx: 1 detik idle cukup panjang shg jauh
  // lebih hemat drpd debounce lama (350-450ms) yg nembak tiap jeda
  // ketikan sekecil apa pun, tapi tetap kerasa responsif.
  useEffect(() => {
    setResults([]); setErr("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const s = q.trim();
    if (s.length < 3) { setLoading(false); return; }
    debounceRef.current = setTimeout(() => { runSearch(); }, 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function runSearch(isRetry, reqIdOverride) {
    const s = q.trim();
    // Minimal 3 karakter - konsisten dgn ambang di empty-state UI di bawah.
    if (s.length < 3) return;
    const id = isRetry ? reqIdOverride : ++reqId.current;
    const qKey = s.toLowerCase();
    if (!isRetry) {
      // Fast-path cache client - query yg sama persis (case/whitespace
      // diabaikan) dlm 2 menit terakhir langsung dipakai, tanpa nyalain
      // spinner sama sekali.
      const cached = getCached(autocompleteCache, qKey);
      if (cached !== undefined) {
        setResults(sortResultsByDistance(cached, nearLat, nearLng));
        setErr(""); setOpen(true);
        return;
      }
      setLoading(true); setResults([]); setErr("");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // jangan sampai "Mencari…" macet tanpa batas
    try {
      const { data, error } = await supabase.functions.invoke("locationiq", {
        body: { action: "autocomplete", q: s },
        signal: controller.signal,
      });
      if (!aliveRef.current || id !== reqId.current) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[locationiq autocomplete] error:", error);
        const ctxStatus = error?.context?.status;
        if (!isRetry && isTransientFailure(error, ctxStatus)) {
          clearTimeout(timer);
          await delay(600);
          return runSearch(true, id);
        }
        setErr(
          ctxStatus === 401 || ctxStatus === 403 ? "Token LocationIQ belum aktif/salah."
          : ctxStatus === 429 ? "Kuota pencarian alamat hari ini habis. Coba lagi besok."
          : ctxStatus === 500 ? "Server pencarian alamat bermasalah."
          : "Gagal memuat saran pencarian. Coba lagi."
        );
        setResults([]); setOpen(true);
        return;
      }
      let found = Array.isArray(data?.results) ? data.results : [];
      // Fallback SEKALI kalau attempt asli nol hasil - coba varian query yg
      // dinormalisasi ringan (lihat lightNormalizeQuery). Hasil dari varian
      // ini yg dipakai kalau attempt asli tetap kosong.
      if (!found.length && !isRetry) {
        const normalized = lightNormalizeQuery(s);
        if (normalized && normalized.toLowerCase() !== qKey) {
          try {
            const fb = await supabase.functions.invoke("locationiq", { body: { action: "autocomplete", q: normalized } });
            if (!fb.error && fb.data?.results?.length) found = fb.data.results;
          } catch { /* diam-diam gagal - attempt asli (kosong) tetap yg ditampilkan */ }
        }
      }
      if (!aliveRef.current || id !== reqId.current) return;
      if (found.length) setCached(autocompleteCache, qKey, found);
      setResults(sortResultsByDistance(found, nearLat, nearLng));
      setOpen(true);
    } catch (e) {
      if (!aliveRef.current || id !== reqId.current) return;
      // eslint-disable-next-line no-console
      console.error("[locationiq autocomplete] exception:", e);
      if (!isRetry && isTransientFailure(e, undefined)) {
        clearTimeout(timer);
        await delay(600);
        return runSearch(true, id);
      }
      setErr(e?.name === "AbortError" ? "Pencarian terlalu lama, coba lagi." : "Gagal memuat saran pencarian. Coba lagi.");
      setResults([]); setOpen(true);
    } finally {
      clearTimeout(timer);
      if (aliveRef.current && id === reqId.current) setLoading(false);
    }
  }

  const pick = (r) => { onSelect?.(r); setQ(r.displayFull || r.display || ""); setOpen(false); setResults([]); setErr(""); };
  const clear = () => { setQ(""); setResults([]); setErr(""); setOpen(false); };

  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 38px 11px 38px", borderRadius: 10, border: `1px solid ${err ? t.acc : t.line}`, background: t.inp || t.card, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

  return (
    <div ref={boxRef} style={{ position: "relative", zIndex: open ? 60 : undefined }}>
      <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => (results.length || err) && setOpen(true)} placeholder={placeholder} style={inp} />
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
        {loading ? <Loader2 size={15} color={t.mid} style={{ animation: "sp 1s linear infinite" }} />
          : q ? <button type="button" onClick={clear} style={{ border: "none", background: "none", cursor: "pointer", color: t.mid, display: "flex", padding: 0 }}><X size={15} /></button>
          : null}
      </span>

      {open && q.trim().length >= 3 && (
        <div style={{ position: "absolute", zIndex: 200, top: "calc(100% + 4px)", left: 0, right: 0, background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.md || "0 10px 26px rgba(0,0,0,.2)", overflow: "hidden" }}>
          {err ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 12px", fontSize: 12.5, color: t.acc }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {err}
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "14px 12px", fontSize: 13, color: t.mid, textAlign: "center" }}>{loading ? "Mencari…" : "Tidak ada hasil."}</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {results.map((r, i) => (
                <div key={i} onClick={() => pick(r)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", cursor: "pointer", borderTop: i ? `1px solid ${t.line}` : "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = t.sub)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <MapPin size={15} color={t.teal || "#1A9E90"} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: t.hi, lineHeight: 1.4 }}>{r.display}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
