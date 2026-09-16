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

const FUNCTIONS_BASE = (process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/gdrive-gallery";

async function fetchGalleryList(email) {
  if (!email) throw new Error("Belum login");
  const res = await fetch(`${FUNCTIONS_BASE}?action=list&caller_email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`Gagal memuat gallery (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.reason === "not_configured" ? "Integrasi Google Drive belum dikonfigurasi." : "Gagal memuat gallery.");
  return data.items || [];
}

async function fetchImageBlobUrl(email, id) {
  if (!email) throw new Error("Belum login");
  const res = await fetch(`${FUNCTIONS_BASE}?action=image&id=${encodeURIComponent(id)}&caller_email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`Gagal memuat foto (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

const UNLINKED_KEY = "__unlinked__";

export default function GalleryPage() {
  return (
    <MartaShell active="gallery" title="Gallery" subtitle="Preview foto dokumentasi POSM langsung dari Google Drive.">
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

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((i) => {
      if (regionFilter !== "Semua Region" && (i.region || "Lainnya") !== regionFilter) return false;
      if (!q) return true;
      return [i.plan_name, i.branch_name, i.name].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [items, regionFilter, query]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of filteredItems) {
      const key = it.plan_name ? `${it.plan_name}` : UNLINKED_KEY;
      if (!map.has(key)) map.set(key, { plan_name: it.plan_name, items: [] });
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
    if (!email) return;
    const startIndex = Math.max(0, groupItems.findIndex((it) => it.id === clickedItem.id));
    const resolved = await Promise.all(
      groupItems.map(async (it) => {
        let url = urlCacheRef.current.get(it.id);
        if (!url) {
          try { url = await fetchImageBlobUrl(email, it.id); urlCacheRef.current.set(it.id, url); }
          catch { return null; }
        }
        return { url, name: it.name };
      })
    );
    const ok = resolved.filter(Boolean);
    if (!ok.length) return;
    const okStart = Math.min(startIndex < 0 ? 0 : startIndex, ok.length - 1);
    openPhotoLightbox(ok, okStart, { filenamePrefix: "gallery" });
  }, [email]);

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
              {totalPhotos === null ? "Memuat…" : `${totalPhotos} foto tersinkron dari Google Drive`}
              {regionFilter !== "Semua Region" || query ? ` · menampilkan ${filteredItems.length}` : ""}
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
          <Loader2 size={16} style={{ animation: "mh-spin .8s linear infinite" }} /> Memuat foto dari Google Drive…
        </div>
      )}

      {items !== null && filteredItems.length === 0 && !err && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: T.lo, fontSize: 13, padding: "70px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "#F1F2F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageOff size={24} />
          </div>
          {items.length === 0 ? "Belum ada foto di folder Google Drive." : "Tidak ada foto yang cocok dengan filter/pencarian."}
        </div>
      )}

      {groups.map((g, gi) => (
        <PlanGroup key={g.plan_name || UNLINKED_KEY} planName={g.plan_name} items={g.items}
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

  useEffect(() => {
    // Ref cuma dibaca di dalam effect (bukan saat render) - lihat
    // https://react.dev/reference/react/useRef, akses ref.current saat
    // render bisa bikin komponen ga update sesuai ekspektasi.
    const cached = urlCacheRef.current.get(item.id);
    if (cached) { setUrl(cached); return; }
    if (!email) return;
    let alive = true;
    fetchImageBlobUrl(email, item.id).then((u) => {
      if (!alive) return;
      urlCacheRef.current.set(item.id, u); setUrl(u);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, email]);

  return (
    <div
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
          <img src={url} alt={item.name} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            transition: "transform .2s ease", transform: hover ? "scale(1.06)" : "scale(1)",
          }} />
          <div style={{
            position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
            opacity: hover ? 1 : 0, transition: "opacity .15s ease", display: "flex", alignItems: "flex-end", padding: 8,
          }}>
            <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name}
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
