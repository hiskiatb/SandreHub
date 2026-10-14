"use client";

/**
 * CMS Gallery - redesain UI (permintaan user 2026-09-16: "pada cms
 * seharusnya foto foto ini muncul di tab gallery yang ada di cms buat ui
 * nya sangat bagus"; jawaban atas klarifikasi: "Redesign Gallery yang
 * sudah ada (Recommended)"). Fungsionalitas lama tetap dipertahankan
 * (filter region, grouping per Plan -> Branch, thumbnail via
 * gdrive-gallery edge function) - yang berubah cuma tampilan + preview-nya
 * sekarang pakai PhotoSwipe (sama seperti MartaHub mobile) supaya bisa
 * pinch-zoom / geser antar foto / download, bukan cuma modal 1 foto statis.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ImageOff, Images, Loader2, RefreshCw, Search, X } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import { openPhotoLightbox } from "../m/_shared/photoLightbox";

import supabaseMarta from "../../../lib/supabaseMarta";

// Sumber foto: Supabase Storage (bucket mh-photos) - daftar dari RPC
// mh_gallery_storage_photos (foto POSM + foto aktivitas, otorisasi via email
// caller), URL gambar = public URL bucket (tanpa Google Drive).
const PHOTO_BUCKET = "mh-photos";

async function fetchGalleryList(email) {
  if (!email) throw new Error("Belum login");
  const { data, error } = await supabaseMarta.rpc("mh_gallery_storage_photos", { p_caller_email: email });
  if (error) throw new Error(error.message || "Gagal memuat gallery.");
  const bucket = supabaseMarta.storage.from(PHOTO_BUCKET);
  return (data || []).map((r) => ({
    id: `${r.source}:${r.id}`,
    name: r.caption || (r.storage_path || "").split("/").pop() || "foto",
    url: bucket.getPublicUrl(r.storage_path).data.publicUrl,
    modified_time: r.created_at,
    plan_id: r.plan_id,
    plan_name: r.plan_name,
    branch_name: r.branch_name,
    region: r.region,
    brand: r.brand,
    source: r.source,
  }));
}

const UNLINKED_KEY = "__unlinked__";
const selStyle = {
  padding: "8px 11px", borderRadius: 10, border: `1px solid ${T.line}`, background: "#fff",
  color: T.hi, fontSize: 12.5, fontFamily: "inherit",
};
const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function GalleryPage() {
  return (
    <MartaShell active="gallery" title="Gallery" subtitle="Semua foto dokumentasi (POSM & aktivitas) dari penyimpanan MartaHub.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState("Semua Region");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");   // yyyy-mm-dd (zona waktu lokal)
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("Semua Branch");
  const [brandFilter, setBrandFilter] = useState("Semua Brand");
  const [sortDir, setSortDir] = useState("desc"); // desc = terbaru dulu
  const urlCacheRef = useRef(new Map()); // item.id -> blob url, dipakai bareng oleh Thumb & lightbox biar ga fetch dobel

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true); setErr("");
    try { setItems(await fetchGalleryList(email)); }
    catch (e) { setErr(e.message || "Gagal memuat gallery"); setItems([]); }
    finally { setLoading(false); }
  }, [email]);

  useEffect(() => { load(); }, [load]);

  const regions = useMemo(() => {
    const set = new Set((items || []).map((i) => i.region || "Lainnya"));
    return ["Semua Region", ...Array.from(set).sort()];
  }, [items]);

  const branches = useMemo(() => {
    const set = new Set((items || []).map((i) => i.branch_name || "Belum diketahui"));
    return ["Semua Branch", ...Array.from(set).sort()];
  }, [items]);
  const brands = useMemo(() => {
    const set = new Set((items || []).map((i) => (i.brand || "").toUpperCase()).filter(Boolean));
    return ["Semua Brand", ...Array.from(set).sort()];
  }, [items]);

  // yyyy-mm-dd menurut zona waktu perangkat (bukan UTC) supaya foto malam hari
  // tidak "pindah" ke tanggal sebelumnya/berikutnya.
  const localYmd = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const setPreset = (days) => {
    const to = new Date(); const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateFrom(localYmd(from.toISOString())); setDateTo(localYmd(to.toISOString()));
  };
  const clearDates = () => { setDateFrom(""); setDateTo(""); };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items || []).filter((i) => {
      if (regionFilter !== "Semua Region" && (i.region || "Lainnya") !== regionFilter) return false;
      if (branchFilter !== "Semua Branch" && (i.branch_name || "Belum diketahui") !== branchFilter) return false;
      if (brandFilter !== "Semua Brand" && (i.brand || "").toUpperCase() !== brandFilter) return false;
      if (dateFrom || dateTo) {
        const d = localYmd(i.modified_time);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      if (!q) return true;
      return [i.plan_name, i.branch_name, i.name].some((v) => (v || "").toLowerCase().includes(q));
    });
    list.sort((a, b) => {
      const c = (a.modified_time || "").localeCompare(b.modified_time || "");
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [items, regionFilter, branchFilter, brandFilter, dateFrom, dateTo, query, sortDir]);

  const filterActive = regionFilter !== "Semua Region" || branchFilter !== "Semua Branch" || brandFilter !== "Semua Brand" || !!dateFrom || !!dateTo || !!query;
  const resetAll = () => {
    setRegionFilter("Semua Region"); setBranchFilter("Semua Branch"); setBrandFilter("Semua Brand");
    clearDates(); setQuery("");
  };

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of filteredItems) {
      const key = it.plan_id || (it.plan_name ? `${it.plan_name}` : UNLINKED_KEY);
      if (!map.has(key)) map.set(key, { key, plan_name: it.plan_name, items: [] });
      map.get(key).items.push(it);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.plan_name === b.plan_name) return 0;
      if (!a.plan_name) return 1;
      if (!b.plan_name) return -1;
      return a.plan_name.localeCompare(b.plan_name);
    });
    return arr;
  }, [filteredItems]);

  const openGroupLightbox = useCallback(async (groupItems, clickedItem) => {
    const startIndex = Math.max(0, groupItems.findIndex((it) => it.id === clickedItem.id));
    const ok = groupItems.map((it) => ({ url: it.url, name: it.name }));
    if (!ok.length) return;
    openPhotoLightbox(ok, startIndex, { filenamePrefix: "gallery" });
  }, []);

  const totalPhotos = items?.length ?? null;

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } } @keyframes mh-gal-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }"}</style>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18,
        flexWrap: "wrap", padding: "16px 18px", borderRadius: 16, background: "linear-gradient(135deg, #FFFFFF 0%, #FBF7F8 100%)",
        border: `1px solid ${T.line}`, boxShadow: "0 1px 3px rgba(13,17,23,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, background: T.primaryBg, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Images size={20} color={T.primary} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, lineHeight: 1.2 }}>Gallery Dokumentasi</div>
            <div style={{ fontSize: 12, color: T.lo, marginTop: 2 }}>
              {totalPhotos === null ? "Memuat…" : `${totalPhotos} foto`}
              {filterActive ? ` · menampilkan ${filteredItems.length}` : ""}
            </div>
          </div>
        </div>

        <button onClick={load} disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10,
            border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
          {loading ? <Loader2 size={14} style={{ animation: "mh-spin .8s linear infinite" }} /> : <RefreshCw size={14} />} Muat ulang
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200, maxWidth: 320 }}>
          <Search size={14} color={T.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari plan, branch, atau nama file…"
            style={{
              width: "100%", padding: "9px 12px 9px 32px", borderRadius: 10, border: `1px solid ${T.line}`,
              fontSize: 12.5, color: T.hi, background: "#fff", boxSizing: "border-box",
            }} />
          {query && (
            <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: T.lo, display: "flex" }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={selStyle}>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {brands.length > 2 && (
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={selStyle}>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={selStyle}>
          <option value="desc">Terbaru dulu</option>
          <option value="asc">Terlama dulu</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.mid }}>Tanggal</span>
        <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} style={selStyle} />
        <span style={{ fontSize: 12, color: T.lo }}>s/d</span>
        <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} style={selStyle} />
        {[["Hari ini", 1], ["7 hari", 7], ["30 hari", 30]].map(([l, d]) => (
          <button key={l} onClick={() => setPreset(d)} style={{ ...selStyle, cursor: "pointer", fontWeight: 700 }}>{l}</button>
        ))}
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} style={{ ...selStyle, cursor: "pointer", color: T.error }}>Hapus tanggal</button>
        )}
        {filterActive && (
          <button onClick={resetAll} style={{ ...selStyle, cursor: "pointer", marginLeft: "auto", fontWeight: 700 }}>Reset semua filter</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {regions.map((r) => {
            const activeChip = regionFilter === r;
            return (
              <button key={r} onClick={() => setRegionFilter(r)}
                style={{
                  padding: "7px 13px", borderRadius: 999, border: `1px solid ${activeChip ? T.primary : T.line}`,
                  background: activeChip ? T.primary : "#fff", color: activeChip ? "#fff" : T.mid,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .12s ease", whiteSpace: "nowrap",
                }}>
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {err && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.error}`, background: T.errorBg, color: T.error, fontSize: 12.5, marginBottom: 16 }}>{err}</div>
      )}

      {items === null && !err && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.lo, fontSize: 13, padding: "60px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "mh-spin .8s linear infinite" }} /> Memuat foto…
        </div>
      )}

      {items !== null && filteredItems.length === 0 && !err && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: T.lo, fontSize: 13, padding: "70px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "#F1F2F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageOff size={24} />
          </div>
          {items.length === 0 ? "Belum ada foto." : "Tidak ada foto yang cocok dengan filter/pencarian."}
        </div>
      )}

      {groups.map((g, gi) => (
        <PlanGroup key={g.key} planName={g.plan_name} items={g.items}
          onPreview={openGroupLightbox} email={email} urlCacheRef={urlCacheRef} animDelay={Math.min(gi, 6) * 0.03} />
      ))}
    </div>
  );
}

function PlanGroup({ planName, items, onPreview, email, urlCacheRef, animDelay }) {
  const byBranch = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.branch_name || "Belum diketahui";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div style={{
      marginBottom: 18, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 16, padding: "16px 18px",
      boxShadow: "0 1px 2px rgba(13,17,23,0.03)", animation: "mh-gal-fade .25s ease both", animationDelay: `${animDelay}s`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: 14, fontWeight: 800, color: planName ? T.hi : T.lo, fontStyle: planName ? "normal" : "italic",
        }}>
          {planName || "Belum terhubung ke Plan"}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.primary, background: T.primaryBg, borderRadius: 999, padding: "2px 9px" }}>
          {items.length} foto
        </span>
      </div>
      {byBranch.map(([branch, branchItems]) => (
        <div key={branch} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: T.lo, display: "inline-block" }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.mid }}>{branch}</span>
            <span style={{ fontSize: 10.5, color: T.lo }}>· {branchItems.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {branchItems.map((it) => (
              <Thumb key={it.id} item={it} email={email} urlCacheRef={urlCacheRef}
                onOpen={() => onPreview(branchItems, it)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Thumb({ item, email, urlCacheRef, onOpen }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const boxRef = useRef(null);

  // Lazy-load: <img> baru dipasang saat thumbnail mendekati layar,
  // supaya ratusan foto tidak diunduh sekaligus.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { if (visible) setUrl(item.url); }, [visible, item.url]);

  return (
    <div
      ref={boxRef}
      title={`${item.name}${item.modified_time ? " · " + fmtDateTime(item.modified_time) : ""}`}
      onClick={() => url && onOpen()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", width: "100%", paddingTop: "100%", borderRadius: 12, overflow: "hidden",
        background: "#F1F2F5", border: `1px solid ${T.line}`, cursor: url ? "pointer" : "default",
        boxShadow: hover && url ? "0 6px 16px rgba(13,17,23,0.14)" : "0 1px 2px rgba(13,17,23,0.03)",
        transition: "box-shadow .15s ease, transform .15s ease", transform: hover && url ? "translateY(-2px)" : "none",
      }}>
      {url ? (
        <>
          <img src={url} alt={item.name} loading="lazy" decoding="async" onError={() => { setUrl(null); setFailed(true); }} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            transition: "transform .2s ease", transform: hover ? "scale(1.06)" : "scale(1)",
          }} />
          <div style={{
            position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
            opacity: hover ? 1 : 0, transition: "opacity .15s ease", display: "flex", alignItems: "flex-end", padding: 8,
          }}>
            <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fmtDateTime(item.modified_time) || item.name}
            </span>
          </div>
        </>
      ) : failed ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.lo }}><ImageOff size={18} /></div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.lo }}><Loader2 size={16} style={{ animation: "mh-spin .8s linear infinite" }} /></div>
      )}
    </div>
  );
}
